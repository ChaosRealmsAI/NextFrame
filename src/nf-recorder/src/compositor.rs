use std::ptr::NonNull;

use anyhow::{Context, Result, bail};
use objc2_core_foundation::{CFBoolean, CFDictionary, CFNumber, CFRetained, CFType};
use objc2_core_video::{
    CVPixelBuffer, CVPixelBufferGetIOSurface, CVPixelBufferGetPixelFormatType, CVPixelBufferPool,
    kCVPixelBufferIOSurfacePropertiesKey, kCVPixelBufferMetalCompatibilityKey,
    kCVPixelBufferPixelFormatTypeKey, kCVPixelBufferWidthKey, kCVPixelBufferHeightKey,
    kCVPixelFormatType_32BGRA, kCVPixelFormatType_ARGB2101010LEPacked,
};
use objc2::runtime::ProtocolObject;
use objc2_metal::{
    MTLBlitCommandEncoder, MTLCommandBuffer, MTLCommandBufferStatus, MTLCommandEncoder,
    MTLCommandQueue, MTLPixelFormat, MTLTexture,
};

use crate::io_surface_alias::MetalAliasContext;

const COMPOSITE_SHADER_SRC: &str = include_str!("../shaders/composite.metal");

pub struct CompositedFrame {
    pixel_buffer: CFRetained<CVPixelBuffer>,
}

impl CompositedFrame {
    pub fn pixel_buffer(&self) -> &CVPixelBuffer {
        self.pixel_buffer.as_ref()
    }
}

pub struct MetalCompositor {
    alias: MetalAliasContext,
    output_pool: CFRetained<CVPixelBufferPool>,
    width: usize,
    height: usize,
    shader_len: usize,
}

impl MetalCompositor {
    pub fn new(width: usize, height: usize) -> Result<Self> {
        Ok(Self {
            alias: MetalAliasContext::new()?,
            output_pool: create_output_pool(width, height)?,
            width,
            height,
            shader_len: COMPOSITE_SHADER_SRC.len(),
        })
    }

    pub fn composite(&self, source_pixel_buffer: &CVPixelBuffer) -> Result<CompositedFrame> {
        if CVPixelBufferGetPixelFormatType(source_pixel_buffer) != kCVPixelFormatType_32BGRA {
            bail!("compositor expects BGRA capture input");
        }
        let output = create_pool_pixel_buffer(self.output_pool.as_ref())?;
        let source_surface = CVPixelBufferGetIOSurface(Some(source_pixel_buffer))
            .context("capture frame missing IOSurface")?;
        let output_surface = CVPixelBufferGetIOSurface(Some(output.as_ref()))
            .context("compositor output missing IOSurface")?;
        let src_tex = self.alias.alias_texture(
            source_surface.as_ref(),
            MTLPixelFormat::BGRA8Unorm,
            self.width,
            self.height,
        )?;
        let dst_tex = self.alias.alias_texture(
            output_surface.as_ref(),
            MTLPixelFormat::BGR10A2Unorm,
            self.width,
            self.height,
        )?;
        self.blit_copy(src_tex.as_ref(), dst_tex.as_ref())?;
        let _ = self.shader_len;
        Ok(CompositedFrame { pixel_buffer: output })
    }

    fn blit_copy(
        &self,
        src: &ProtocolObject<dyn MTLTexture>,
        dst: &ProtocolObject<dyn MTLTexture>,
    ) -> Result<()> {
        let command_buffer = self
            .alias
            .queue
            .commandBuffer()
            .context("create Metal command buffer")?;
        let blit = command_buffer
            .blitCommandEncoder()
            .context("create Metal blit encoder")?;
        // SAFETY: Both textures are the same size and backed by live shared-storage IOSurfaces.
        unsafe {
            blit.copyFromTexture_toTexture(src, dst);
        }
        blit.endEncoding();
        command_buffer.commit();
        command_buffer.waitUntilCompleted();
        check_command_buffer(command_buffer.as_ref())
    }
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
        let status = unsafe {
            CVPixelBufferPool::create(None, None, Some(attrs.as_ref()), NonNull::from(&mut raw))
        };
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
        .map(|error: objc2::rc::Retained<objc2_foundation::NSError>| {
            error.localizedDescription().to_string()
        })
        .unwrap_or_else(|| "unknown Metal command buffer error".to_string());
    bail!("Metal compositor blit failed: {error_text}")
}

fn cvt(status: i32, context: &str) -> Result<()> {
    if status == 0 {
        Ok(())
    } else {
        bail!("{context} failed with OSStatus {status}")
    }
}
