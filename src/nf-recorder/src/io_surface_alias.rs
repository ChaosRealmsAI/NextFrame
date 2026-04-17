#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {}

use std::ffi::c_void;
use std::mem;
use std::ptr;
use std::slice;

use anyhow::{Context, Result, anyhow, bail};
use objc2::runtime::ProtocolObject;
use objc2_core_foundation::{
    CFDictionary, CFRetained, CFNumber, CFNumberType, kCFTypeDictionaryKeyCallBacks,
    kCFTypeDictionaryValueCallBacks,
};
use objc2_io_surface::{
    IOSurfaceLockOptions, IOSurfaceRef, kIOSurfaceBytesPerElement, kIOSurfaceHeight,
    kIOSurfacePixelFormat, kIOSurfaceWidth,
};
use objc2_metal::{
    MTLBlitCommandEncoder, MTLBuffer, MTLCommandBuffer, MTLCommandBufferStatus, MTLCommandEncoder,
    MTLCommandQueue, MTLCreateSystemDefaultDevice, MTLDevice, MTLPixelFormat, MTLResourceOptions,
    MTLSize, MTLStorageMode, MTLTexture, MTLTextureDescriptor,
};

const BGRA_FOURCC: u32 = u32::from_be_bytes(*b"BGRA");

pub struct MetalAliasContext {
    pub device: objc2::rc::Retained<ProtocolObject<dyn MTLDevice>>,
    pub queue: objc2::rc::Retained<ProtocolObject<dyn MTLCommandQueue>>,
}

impl MetalAliasContext {
    pub fn new() -> Result<Self> {
        let device = MTLCreateSystemDefaultDevice().context("Metal device not available")?;
        let queue = device
            .newCommandQueue()
            .context("failed to create Metal command queue")?;
        Ok(Self { device, queue })
    }

    pub fn alias_texture(
        &self,
        surface: &IOSurfaceRef,
        pixel_format: MTLPixelFormat,
        width: usize,
        height: usize,
    ) -> Result<objc2::rc::Retained<ProtocolObject<dyn MTLTexture>>> {
        // SAFETY: Creating a descriptor is safe; the caller provides the intended Metal view of the IOSurface.
        let desc = unsafe {
            MTLTextureDescriptor::texture2DDescriptorWithPixelFormat_width_height_mipmapped(
                pixel_format,
                width,
                height,
                false,
            )
        };
        desc.setStorageMode(MTLStorageMode::Shared);
        self.device
            .newTextureWithDescriptor_iosurface_plane(&desc, surface, 0)
            .context("Metal failed to alias IOSurface as a texture")
    }

    pub fn readback_rgba(
        &self,
        texture: &ProtocolObject<dyn MTLTexture>,
        width: usize,
        height: usize,
    ) -> Result<Vec<u8>> {
        let row_bytes = width * 4;
        let readback_len = row_bytes * height;
        let readback = self
            .device
            .newBufferWithLength_options(readback_len, MTLResourceOptions::StorageModeShared)
            .context("Metal failed to allocate readback buffer")?;
        let command_buffer = self
            .queue
            .commandBuffer()
            .context("MTLCommandQueue.commandBuffer returned nil")?;
        let encoder = command_buffer
            .blitCommandEncoder()
            .context("MTLCommandBuffer.blitCommandEncoder returned nil")?;
        // SAFETY: The destination buffer is large enough for the full texture copy.
        unsafe {
            encoder.copyFromTexture_sourceSlice_sourceLevel_sourceOrigin_sourceSize_toBuffer_destinationOffset_destinationBytesPerRow_destinationBytesPerImage(
                texture,
                0,
                0,
                objc2_metal::MTLOrigin { x: 0, y: 0, z: 0 },
                MTLSize { width, height, depth: 1 },
                &readback,
                0,
                row_bytes,
                readback_len,
            );
        }
        encoder.endEncoding();
        command_buffer.commit();
        command_buffer.waitUntilCompleted();
        check_command_buffer(command_buffer.as_ref())?;
        // SAFETY: The shared buffer contents are valid for `readback_len` bytes after completion.
        let bgra =
            unsafe { slice::from_raw_parts(readback.contents().cast::<u8>().as_ptr(), readback_len) };
        Ok(bgra_to_rgba(bgra))
    }
}

pub fn create_bgra_surface(width: usize, height: usize) -> Result<CFRetained<IOSurfaceRef>> {
    let numbers = [
        cf_u32(width as u32)?,
        cf_u32(height as u32)?,
        cf_u32(4)?,
        cf_u32(BGRA_FOURCC)?,
    ];
    let mut keys = [
        // SAFETY: These IOSurface property keys are valid process-global constants.
        unsafe { kIOSurfaceWidth } as *const _ as *const c_void,
        // SAFETY: These IOSurface property keys are valid process-global constants.
        unsafe { kIOSurfaceHeight } as *const _ as *const c_void,
        // SAFETY: These IOSurface property keys are valid process-global constants.
        unsafe { kIOSurfaceBytesPerElement } as *const _ as *const c_void,
        // SAFETY: These IOSurface property keys are valid process-global constants.
        unsafe { kIOSurfacePixelFormat } as *const _ as *const c_void,
    ];
    let mut values =
        numbers.map(|value| CFRetained::as_ptr(&value).as_ptr() as *const c_void);
    // SAFETY: CFDictionaryCreate copies the key/value pointers for the lifetime of the returned dictionary.
    let props = unsafe {
        CFDictionary::new(
            None,
            keys.as_mut_ptr(),
            values.as_mut_ptr(),
            keys.len() as isize,
            &kCFTypeDictionaryKeyCallBacks,
            &kCFTypeDictionaryValueCallBacks,
        )
    }
    .context("CFDictionaryCreate for IOSurface properties returned nil")?;
    // SAFETY: IOSurfaceCreate returns a retained IOSurface when given a valid property dictionary.
    unsafe { IOSurfaceRef::new(&props) }.context("IOSurfaceCreate returned nil")
}

pub fn fill_test_surface(surface: &IOSurfaceRef, width: usize, height: usize) -> Result<()> {
    // SAFETY: Locking is required before mutating IOSurface memory from the CPU.
    unsafe {
        kern_ok(
            surface.lock(IOSurfaceLockOptions::empty(), ptr::null_mut()),
            "IOSurfaceLock",
        )?;
    }
    let bytes_per_row = surface.bytes_per_row();
    let base = surface.base_address().cast::<u8>().as_ptr();
    for y in 0..height {
        let row = unsafe { base.add(y * bytes_per_row) };
        for x in 0..width {
            let px = if (x / 32 + y / 32) % 2 == 0 {
                [0_u8, 0_u8, 255_u8, 255_u8]
            } else {
                [0_u8, 255_u8, 0_u8, 255_u8]
            };
            // SAFETY: The destination row points into the locked IOSurface allocation.
            unsafe {
                ptr::copy_nonoverlapping(px.as_ptr(), row.add(x * 4), 4);
            }
        }
    }
    // SAFETY: Unlocking balances the earlier successful lock.
    unsafe {
        kern_ok(
            surface.unlock(IOSurfaceLockOptions::empty(), ptr::null_mut()),
            "IOSurfaceUnlock",
        )?;
    }
    Ok(())
}

pub fn resident_bytes() -> Result<u64> {
    let mut info = unsafe { mem::zeroed::<libc::mach_task_basic_info>() };
    let mut count = libc::MACH_TASK_BASIC_INFO_COUNT;
    #[allow(deprecated)]
    // SAFETY: `task_info` fills the provided struct for the current process.
    let status = unsafe {
        libc::task_info(
            libc::mach_task_self(),
            libc::MACH_TASK_BASIC_INFO,
            (&mut info as *mut libc::mach_task_basic_info).cast(),
            &mut count,
        )
    };
    if status != 0 {
        bail!("task_info(MACH_TASK_BASIC_INFO) failed with kern_return_t={status}");
    }
    // SAFETY: `resident_size` is aligned inside the filled struct.
    Ok(unsafe { ptr::addr_of!(info.resident_size).read_unaligned() as u64 })
}

fn cf_u32(value: u32) -> Result<CFRetained<CFNumber>> {
    // SAFETY: CFNumberCreate copies the input integer bits into a new CFNumber.
    unsafe { CFNumber::new(None, CFNumberType::SInt32Type, (&value as *const u32).cast()) }
        .context("CFNumberCreate failed")
}

fn check_command_buffer(command_buffer: &ProtocolObject<dyn MTLCommandBuffer>) -> Result<()> {
    if command_buffer.status() == MTLCommandBufferStatus::Completed {
        return Ok(());
    }
    let error_text = command_buffer
        .error()
        .map(|error| error.localizedDescription().to_string())
        .unwrap_or_else(|| "unknown Metal command buffer error".to_string());
    Err(anyhow!("Metal blit failed: {error_text}"))
}

fn bgra_to_rgba(bgra: &[u8]) -> Vec<u8> {
    let mut rgba = Vec::with_capacity(bgra.len());
    for pixel in bgra.chunks_exact(4) {
        rgba.push(pixel[2]);
        rgba.push(pixel[1]);
        rgba.push(pixel[0]);
        rgba.push(pixel[3]);
    }
    rgba
}

fn kern_ok(status: i32, context: &str) -> Result<()> {
    if status == 0 {
        Ok(())
    } else {
        bail!("{context} failed with kern_return_t={status}")
    }
}
