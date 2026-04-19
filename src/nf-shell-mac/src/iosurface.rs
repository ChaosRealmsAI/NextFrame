//! IOSurface helper · CARenderer 输出的 zero-copy 帧容器。
//!
//! `IOSurfaceHandle` 是跨 crate 传递的公共类型 — `DesktopShell::snapshot` 返回 ·
//! `nf-recorder::RecordPipeline::push_frame` 吃。VT VTCompressionSession 通过
//! `CVPixelBufferCreateWithIOSurface` 直接包 IOSurface 成 CVPixelBuffer · zero-copy。
//!
//! **像素格式固定**：`kCVPixelFormatType_32BGRA` (`'BGRA'` = 0x42475241)。
//! - BGRA 是 VT / AVFoundation 的 happy path（POC-02 验过）
//! - Metal BGRA8Unorm 与 IOSurface 'BGRA' 字节序一致 · MTLTexture 可直接 bind
//!
//! **Send / Sync**：IOSurface 本身 thread-safe（IOSurfaceLock 内部原子 · IOKit 服务跨进程共享）·
//! `Retained<IOSurfaceRef>` 的引用计数是 atomic CFRetain/Release · 可跨线程传递。
//! `unsafe impl Send + Sync` 合法 · 调用方只需保证 lock/unlock 配对即可。

use std::ptr::NonNull;

use objc2_core_foundation::CFRetained;
use objc2_core_video::{CVPixelBuffer, CVPixelBufferCreateWithIOSurface};
use objc2_io_surface::IOSurfaceRef;

/// `kCVPixelFormatType_32BGRA` · FourCC `'BGRA'`。VT 最快喂格式（POC-02 实测）。
pub const PIXEL_FORMAT_BGRA: u32 = 0x4247_5241;

/// IOSurface handle · `DesktopShell::snapshot` 返回值 · 跨 crate 传给 `nf-recorder`。
///
/// 内部持 `CFRetained<IOSurfaceRef>`（+1 ref）· clone 增 ref · drop 减 ref。
/// VT encoder 侧用 `as_iosurface()` 拿 `&IOSurfaceRef` 建 CVPixelBuffer。
#[derive(Debug, Clone)]
pub struct IOSurfaceHandle {
    /// +1-refed IOSurface · 生命周期跟 handle 走。
    pub(crate) surface: CFRetained<IOSurfaceRef>,
    /// 像素宽度（logical · 不含 bytes_per_row padding）。
    pub width: u32,
    /// 像素高度。
    pub height: u32,
    /// CVPixelFormatType · 固定 `PIXEL_FORMAT_BGRA`（v1.14）。
    pub pixel_format: u32,
}

impl IOSurfaceHandle {
    /// 从既有 `CFRetained<IOSurfaceRef>` 构造 · 元数据来自 surface 自身。
    ///
    /// 调用方：`CARendererSampler::sample` · 传入 sampler 自己持有的 surface。
    pub fn from_surface(surface: CFRetained<IOSurfaceRef>) -> Self {
        let width = surface.width() as u32;
        let height = surface.height() as u32;
        Self {
            surface,
            width,
            height,
            pixel_format: PIXEL_FORMAT_BGRA,
        }
    }

    /// 借出内部 `IOSurfaceRef` 给 VT / CVPixelBuffer 用。
    ///
    /// 生命周期受限于 `&self` · 下游若要跨线程持有请 `clone()`（atomic ref bump）。
    pub fn as_iosurface(&self) -> &IOSurfaceRef {
        &self.surface
    }

    /// 从 IOSurface 构造 `CVPixelBuffer`（zero-copy · 同一块 IOSurface 内存）。
    ///
    /// **用途**：VT `VTCompressionSessionEncodeFrame` 吃 `CVImageBuffer` / `CVPixelBuffer` ·
    /// 这是 GPU (CARenderer-render target) → encoder 路径的关键桥。CVPixelBuffer
    /// 通过 `CVPixelBufferCreateWithIOSurface` 直接 wrap IOSurface · Apple 文档
    /// 保证 zero-copy（CVPB 会 retain IOSurface · 不复制像素）。
    ///
    /// **attrs=None**：使用默认属性 · BGRA / width / height 由 IOSurface 自身决定。
    pub fn as_cv_pixel_buffer(&self) -> Result<CFRetained<CVPixelBuffer>, IoError> {
        let mut out: *mut CVPixelBuffer = std::ptr::null_mut();
        // SAFETY: surface 来自有效 IOSurfaceRef（Self 持 +1 ref）· allocator=None 走
        // kCFAllocatorDefault · pixel_buffer_attributes=None 走默认 · out 是可写栈槽。
        // 返回 OSStatus=0 表示成功 · CVPixelBufferCreateWithIOSurface 按 Create Rule
        // 返回 +1 retained 指针 · 由下游 CFRetained::from_raw 接管。
        let status = unsafe {
            CVPixelBufferCreateWithIOSurface(
                None,
                &self.surface,
                None,
                NonNull::from(&mut out),
            )
        };
        if status != 0 {
            return Err(IoError::CVPixelBufferCreateFailed(status));
        }
        let nn = NonNull::new(out).ok_or(IoError::RetainFailed)?;
        // SAFETY: nn 非空 · CVPixelBufferCreateWithIOSurface 按 Create Rule 返回
        // +1 retained · CFRetained::from_raw 接管所有权（不再额外 CFRetain）。
        Ok(unsafe { CFRetained::from_raw(nn) })
    }
}

/// IOSurface / CVPixelBuffer 桥接错误。
#[derive(Debug, thiserror::Error)]
pub enum IoError {
    /// `CVPixelBufferCreateWithIOSurface` 返回非零 OSStatus。
    #[error("CVPixelBufferCreateWithIOSurface failed: OSStatus={0}")]
    CVPixelBufferCreateFailed(i32),
    /// `CFRetained::from_raw` 拿到 null（极少见 · 通常状态码非零会先拦住）。
    #[error("retain from raw failed")]
    RetainFailed,
}

// SAFETY: IOSurface (IOKit IOSurfaceRef) 本身 thread-safe · 跨进程共享也是其 raison d'être。
// `CFRetained` 的引用计数基于 atomic CFRetain/CFRelease · 多线程 clone/drop 安全。
// 真正需要小心的是 `lock(ReadOnly/ReadWrite)` 的读写一致性 · 那是调用方责任不是 Send/Sync 责任。
unsafe impl Send for IOSurfaceHandle {}
// SAFETY: 同上 · IOSurface 只读引用（`&IOSurfaceRef`）跨线程共享 · lock-read 是幂等 refcount 操作。
unsafe impl Sync for IOSurfaceHandle {}
