use std::ffi::c_void;
use std::ptr::NonNull;

use anyhow::{Context, Result, anyhow, bail};
use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2_core_foundation::{CFBoolean, CFDictionary, CFNumber, CFRetained, CFType};
use objc2_core_video::{
    CVPixelBuffer, CVPixelBufferGetIOSurface, CVPixelBufferGetPixelFormatType, CVPixelBufferPool,
    kCVPixelBufferIOSurfacePropertiesKey, kCVPixelBufferMetalCompatibilityKey,
    kCVPixelBufferPixelFormatTypeKey, kCVPixelBufferWidthKey, kCVPixelBufferHeightKey,
    kCVPixelFormatType_32BGRA, kCVPixelFormatType_ARGB2101010LEPacked,
};
use objc2_foundation::{NSString, ns_string};
use objc2_metal::{
    MTLBlendFactor, MTLBlendOperation, MTLCommandBuffer, MTLCommandBufferStatus, MTLCommandEncoder,
    MTLCommandQueue, MTLCompileOptions, MTLDataType, MTLDevice, MTLFunctionConstantValues,
    MTLGPUFamily, MTLLoadAction, MTLLibrary, MTLPipelineOption, MTLPrimitiveType,
    MTLRenderCommandEncoder, MTLRenderPassDescriptor, MTLRenderPipelineColorAttachmentDescriptorArray,
    MTLRenderPipelineDescriptor, MTLRenderPipelineState, MTLSize, MTLStoreAction, MTLTexture,
    MTLTextureUsage,
    MTLTileRenderPipelineColorAttachmentDescriptorArray, MTLTileRenderPipelineDescriptor,
    MTLPixelFormat,
};

use crate::io_surface_alias::MetalAliasContext;

const COMPOSITE_SHADER_SRC: &str = include_str!("../shaders/composite.metal");
const MAX_LAYERS: usize = 8;

pub struct CompositedFrame {
    pixel_buffer: CFRetained<CVPixelBuffer>,
}

impl CompositedFrame {
    pub fn pixel_buffer(&self) -> &CVPixelBuffer {
        self.pixel_buffer.as_ref()
    }

    pub fn into_pixel_buffer(self) -> CFRetained<CVPixelBuffer> {
        self.pixel_buffer
    }
}

pub struct MetalCompositor {
    alias: MetalAliasContext,
    output_pool: CFRetained<CVPixelBufferPool>,
    tile: Option<Retained<ProtocolObject<dyn MTLRenderPipelineState>>>,
    blend: Retained<ProtocolObject<dyn MTLRenderPipelineState>>,
    tile_size: MTLSize,
    width: usize,
    height: usize,
}

impl MetalCompositor {
    pub fn new(width: usize, height: usize) -> Result<Self> {
        let alias = MetalAliasContext::new()?;
        let library = compile_library(&alias)?;
        let tile = if alias.device.supportsFamily(MTLGPUFamily::Apple4) {
            Some(build_tile_pipeline(&alias, &library, 1)?)
        } else {
            None
        };
        let blend = build_blend_pipeline(&library, &alias)?;
        Ok(Self {
            alias,
            output_pool: create_output_pool(width, height)?,
            tile,
            blend,
            tile_size: MTLSize {
                width: 16,
                height: 16,
                depth: 1,
            },
            width,
            height,
        })
    }

    pub fn composite(&self, source_pixel_buffer: &CVPixelBuffer) -> Result<CompositedFrame> {
        self.composite_layers(&[source_pixel_buffer])
    }

    pub fn composite_layers(&self, source_pixel_buffers: &[&CVPixelBuffer]) -> Result<CompositedFrame> {
        if source_pixel_buffers.is_empty() {
            bail!("compositor requires at least one source layer");
        }
        if source_pixel_buffers.len() > MAX_LAYERS {
            bail!("compositor supports at most {MAX_LAYERS} source layers");
        }
        let output = create_pool_pixel_buffer(self.output_pool.as_ref())?;
        let output_surface = CVPixelBufferGetIOSurface(Some(output.as_ref()))
            .context("compositor output missing IOSurface")?;
        let output_texture = self.alias.alias_texture_with_usage(
            output_surface.as_ref(),
            MTLPixelFormat::BGR10A2Unorm,
            self.width,
            self.height,
            MTLTextureUsage::ShaderRead | MTLTextureUsage::RenderTarget,
        )?;
        let layer_textures = source_pixel_buffers
            .iter()
            .map(|buffer| self.alias_source_texture(buffer))
            .collect::<Result<Vec<_>>>()?;

        let command_buffer = self
            .alias
            .queue
            .commandBuffer()
            .context("create Metal command buffer")?;
        if let Some(tile) = self.tile.as_ref() {
            encode_tile_pass(
                command_buffer.as_ref(),
                tile.as_ref(),
                &layer_textures,
                output_texture.as_ref(),
                self.tile_size,
            )?;
        } else {
            encode_multipass(
                command_buffer.as_ref(),
                self.blend.as_ref(),
                &layer_textures,
                output_texture.as_ref(),
            )?;
        }
        command_buffer.commit();
        command_buffer.waitUntilCompleted();
        check_command_buffer(command_buffer.as_ref())?;
        Ok(CompositedFrame { pixel_buffer: output })
    }

    fn alias_source_texture(
        &self,
        source_pixel_buffer: &CVPixelBuffer,
    ) -> Result<Retained<ProtocolObject<dyn MTLTexture>>> {
        if CVPixelBufferGetPixelFormatType(source_pixel_buffer) != kCVPixelFormatType_32BGRA {
            bail!("compositor expects BGRA capture input");
        }
        let surface = CVPixelBufferGetIOSurface(Some(source_pixel_buffer))
            .context("capture frame missing IOSurface")?;
        self.alias.alias_texture(
            surface.as_ref(),
            MTLPixelFormat::BGRA8Unorm,
            self.width,
            self.height,
        )
    }
}

fn compile_library(alias: &MetalAliasContext) -> Result<Retained<ProtocolObject<dyn objc2_metal::MTLLibrary>>> {
    let source = NSString::from_str(COMPOSITE_SHADER_SRC);
    let options = MTLCompileOptions::new();
    alias
        .device
        .newLibraryWithSource_options_error(&source, Some(&options))
        .map_err(ns_error)
        .context("compile Metal composite library")
}

fn build_tile_pipeline(
    alias: &MetalAliasContext,
    library: &ProtocolObject<dyn objc2_metal::MTLLibrary>,
    layers: usize,
) -> Result<Retained<ProtocolObject<dyn MTLRenderPipelineState>>> {
    let constants = MTLFunctionConstantValues::new();
    let mut layer_count = u16::try_from(layers).context("layer count exceeds tile constant range")?;
    // SAFETY: The function constant points to a live stack value for the duration of specialization.
    unsafe {
        constants.setConstantValue_type_atIndex(
            NonNull::from(&mut layer_count).cast::<c_void>(),
            MTLDataType::UShort,
            0,
        );
    }
    let tile_fn = library
        .newFunctionWithName_constantValues_error(ns_string!("composite_tile"), &constants)
        .map_err(ns_error)
        .context("specialize composite_tile")?;

    let desc = MTLTileRenderPipelineDescriptor::new();
    // SAFETY: The tile function remains retained by the pipeline descriptor for the call.
    unsafe {
        desc.setTileFunction(&tile_fn);
        desc.setRasterSampleCount(1);
    }
    desc.setThreadgroupSizeMatchesTileSize(true);
    desc.setLabel(Some(ns_string!("nf-recorder.tile")));
    let colors: Retained<MTLTileRenderPipelineColorAttachmentDescriptorArray> = desc.colorAttachments();
    // SAFETY: Color attachment slot 0 exists on a newly created descriptor array.
    let color0 = unsafe { colors.objectAtIndexedSubscript(0) };
    color0.setPixelFormat(MTLPixelFormat::BGR10A2Unorm);

    alias
        .device
        .newRenderPipelineStateWithTileDescriptor_options_reflection_error(
            &desc,
            MTLPipelineOption::None,
            None,
        )
        .map_err(ns_error)
        .context("build Metal tile pipeline")
}

fn build_blend_pipeline(
    library: &ProtocolObject<dyn objc2_metal::MTLLibrary>,
    alias: &MetalAliasContext,
) -> Result<Retained<ProtocolObject<dyn MTLRenderPipelineState>>> {
    let vertex = library
        .newFunctionWithName(ns_string!("fullscreen_vertex"))
        .context("missing fullscreen_vertex")?;
    let fragment = library
        .newFunctionWithName(ns_string!("blend_fragment"))
        .context("missing blend_fragment")?;

    let desc = MTLRenderPipelineDescriptor::new();
    desc.setLabel(Some(ns_string!("nf-recorder.blend")));
    desc.setVertexFunction(Some(&vertex));
    desc.setFragmentFunction(Some(&fragment));
    desc.setRasterSampleCount(1);
    let colors: Retained<MTLRenderPipelineColorAttachmentDescriptorArray> = desc.colorAttachments();
    // SAFETY: Color attachment slot 0 exists on a newly created descriptor array.
    let color0 = unsafe { colors.objectAtIndexedSubscript(0) };
    color0.setPixelFormat(MTLPixelFormat::BGR10A2Unorm);
    color0.setBlendingEnabled(true);
    color0.setSourceRGBBlendFactor(MTLBlendFactor::SourceAlpha);
    color0.setDestinationRGBBlendFactor(MTLBlendFactor::OneMinusSourceAlpha);
    color0.setRgbBlendOperation(MTLBlendOperation::Add);
    color0.setSourceAlphaBlendFactor(MTLBlendFactor::One);
    color0.setDestinationAlphaBlendFactor(MTLBlendFactor::OneMinusSourceAlpha);
    color0.setAlphaBlendOperation(MTLBlendOperation::Add);

    alias
        .device
        .newRenderPipelineStateWithDescriptor_options_reflection_error(
            &desc,
            MTLPipelineOption::None,
            None,
        )
        .map_err(ns_error)
        .context("build Metal blend pipeline")
}

fn encode_tile_pass(
    command_buffer: &ProtocolObject<dyn MTLCommandBuffer>,
    tile: &ProtocolObject<dyn MTLRenderPipelineState>,
    layers: &[Retained<ProtocolObject<dyn MTLTexture>>],
    output: &ProtocolObject<dyn MTLTexture>,
    tile_size: MTLSize,
) -> Result<()> {
    let pass = MTLRenderPassDescriptor::renderPassDescriptor();
    let colors = pass.colorAttachments();
    // SAFETY: Color attachment slot 0 exists on a fresh descriptor array.
    let color0 = unsafe { colors.objectAtIndexedSubscript(0) };
    color0.setTexture(Some(output));
    color0.setLoadAction(MTLLoadAction::DontCare);
    color0.setStoreAction(MTLStoreAction::Store);
    pass.setRenderTargetWidth(output.width());
    pass.setRenderTargetHeight(output.height());
    pass.setTileWidth(tile_size.width);
    pass.setTileHeight(tile_size.height);
    pass.setImageblockSampleLength(tile.imageblockSampleLength());

    let encoder = command_buffer
        .renderCommandEncoderWithDescriptor(&pass)
        .context("create Metal tile encoder")?;
    encoder.setRenderPipelineState(tile);
    for (index, layer) in layers.iter().enumerate() {
        // SAFETY: Each index is within the fixed shader texture table, capped at MAX_LAYERS.
        unsafe {
            encoder.setTileTexture_atIndex(Some(layer.as_ref()), index);
        }
    }
    encoder.dispatchThreadsPerTile(tile_size);
    encoder.endEncoding();
    Ok(())
}

fn encode_multipass(
    command_buffer: &ProtocolObject<dyn MTLCommandBuffer>,
    pipeline: &ProtocolObject<dyn MTLRenderPipelineState>,
    layers: &[Retained<ProtocolObject<dyn MTLTexture>>],
    output: &ProtocolObject<dyn MTLTexture>,
) -> Result<()> {
    for (index, layer) in layers.iter().enumerate() {
        let pass = MTLRenderPassDescriptor::renderPassDescriptor();
        let colors = pass.colorAttachments();
        // SAFETY: Color attachment slot 0 exists on a fresh descriptor array.
        let color0 = unsafe { colors.objectAtIndexedSubscript(0) };
        color0.setTexture(Some(output));
        color0.setLoadAction(if index == 0 {
            MTLLoadAction::Clear
        } else {
            MTLLoadAction::Load
        });
        color0.setStoreAction(MTLStoreAction::Store);
        let encoder = command_buffer
            .renderCommandEncoderWithDescriptor(&pass)
            .context("create Metal blend encoder")?;
        encoder.setRenderPipelineState(pipeline);
        // SAFETY: The fragment shader reads texture slot 0 only.
        unsafe {
            encoder.setFragmentTexture_atIndex(Some(layer.as_ref()), 0);
            encoder.drawPrimitives_vertexStart_vertexCount(MTLPrimitiveType::Triangle, 0, 3);
        }
        encoder.endEncoding();
    }
    Ok(())
}

fn create_output_pool(width: usize, height: usize) -> Result<CFRetained<CVPixelBufferPool>> {
    let empty = CFDictionary::<CFType, CFType>::from_slices(&[], &[]);
    let attrs = CFDictionary::<CFType, CFType>::from_slices(
        &[
            // SAFETY: These CoreVideo keys are constant singleton values.
            unsafe { kCVPixelBufferPixelFormatTypeKey }.as_ref(),
            // SAFETY: These CoreVideo keys are constant singleton values.
            unsafe { kCVPixelBufferWidthKey }.as_ref(),
            // SAFETY: These CoreVideo keys are constant singleton values.
            unsafe { kCVPixelBufferHeightKey }.as_ref(),
            // SAFETY: These CoreVideo keys are constant singleton values.
            unsafe { kCVPixelBufferMetalCompatibilityKey }.as_ref(),
            // SAFETY: These CoreVideo keys are constant singleton values.
            unsafe { kCVPixelBufferIOSurfacePropertiesKey }.as_ref(),
        ],
        &[
            CFNumber::new_i32(kCVPixelFormatType_ARGB2101010LEPacked as i32).as_ref(),
            CFNumber::new_i32(width as i32).as_ref(),
            CFNumber::new_i32(height as i32).as_ref(),
            CFBoolean::new(true).as_ref(),
            empty.as_ref(),
        ],
    );
    let mut raw = std::ptr::null_mut();
    // SAFETY: CoreVideo initializes the pool in the provided out pointer.
    let status =
        unsafe { CVPixelBufferPool::create(None, None, Some(attrs.as_ref()), NonNull::from(&mut raw)) };
    cvt(status, "CVPixelBufferPoolCreate")?;
    let raw = NonNull::new(raw).context("CVPixelBufferPoolCreate returned null")?;
    // SAFETY: CoreVideo returns a retained pool.
    Ok(unsafe { CFRetained::from_raw(raw) })
}

fn create_pool_pixel_buffer(pool: &CVPixelBufferPool) -> Result<CFRetained<CVPixelBuffer>> {
    let mut raw = std::ptr::null_mut();
    // SAFETY: CoreVideo stores a retained pixel buffer in the provided out pointer.
    let status = unsafe { CVPixelBufferPool::create_pixel_buffer(None, pool, NonNull::from(&mut raw)) };
    cvt(status, "CVPixelBufferPoolCreatePixelBuffer")?;
    let raw = NonNull::new(raw).context("CVPixelBufferPoolCreatePixelBuffer returned null")?;
    // SAFETY: The out pointer owns a +1 retained pixel buffer.
    Ok(unsafe { CFRetained::from_raw(raw) })
}

fn check_command_buffer(command_buffer: &ProtocolObject<dyn MTLCommandBuffer>) -> Result<()> {
    if command_buffer.status() == MTLCommandBufferStatus::Completed {
        return Ok(());
    }
    let error_text = command_buffer
        .error()
        .map(|error| error.localizedDescription().to_string())
        .unwrap_or_else(|| "unknown Metal command buffer error".to_string());
    bail!("Metal compositor failed: {error_text}")
}

fn ns_error(err: Retained<objc2_foundation::NSError>) -> anyhow::Error {
    anyhow!(err.localizedDescription().to_string())
}

fn cvt(status: i32, context: &str) -> Result<()> {
    if status == 0 {
        Ok(())
    } else {
        bail!("{context} failed with OSStatus {status}")
    }
}
