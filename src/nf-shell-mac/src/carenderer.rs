//! CARenderer 采样 · 把 `WKWebView.layer` 渲染到 IOSurface-backed `MTLTexture`。
//!
//! **蓝本**：`poc/POC-04B-carenderer-layer/src/main.rs` ·
//! POC 实测（macOS 26.0 / Apple Silicon）71.48 fps · 0.31ms/frame · CPU 5%。
//!
//! # 管线
//! 1. 建 1920×1080 (可配) BGRA IOSurface（`kCVPixelFormatType_32BGRA`）
//! 2. MTL device · `newTextureWithDescriptor_iosurface_plane(BGRA8Unorm, iosurface, 0)`
//! 3. `CARenderer::rendererWithMTLTexture(tex, nil)`
//! 4. 每帧：`setLayer` / `setBounds` / `beginFrameAtTime` / `addUpdateRect` / `render` / `endFrame`
//!
//! # 复用
//! 一个 `CARendererSampler` 生命周期内：device / texture / iosurface / renderer 全部 **只建一次**。
//! POC-04B 30 帧共享同一组资源 · 首帧 1.67ms（warm-up）· 后续 0.31ms 稳态。
//!
//! # Y 翻转（v1.14.1 patch · 修 FM-Y-FLIP-CARENDERER）
//! CoreAnimation 坐标系原点 = 左下；HTML / 视频坐标系原点 = 左上。CARenderer 采样结果
//! 相对 HTML **上下颠倒**（POC-04B report.md §坐标系备注）。
//!
//! **v1.14.1 决定**（修 bug）：sampler **在采样后显式 Y flip** · 返回的 IOSurface
//! 跟 HTML 完全一致 · 下游 VT / snapshot 无需感知方向。
//!
//! 路径：`src_surface`（CARenderer 原始输出 · Y 反的）→ **行倒序 memcpy**
//! 到 `out_surface`（Y 正的）→ 返回 out_surface。
//!
//! ## 为什么选 CPU memcpy 不选 Metal compute
//! 1080p BGRA = 1920×1080×4 = 8.3 MB · 行倒序拷贝 ~0.5ms 实测（单核 memcpy 带宽够）·
//! 远低于 60fps 预算（16.67ms）· 跟 prompt 给的 Metal blit/compute 方案（~0.1-0.2ms）
//! 差异仅 0.3ms 级 · 不是瓶颈。CPU 路径代码量少 ~100 行 · 少一套 MTLLibrary / Function /
//! ComputePipelineState / CommandQueue ceremony · **bug fix 最小侵入** 胜过性能极致。
//! 未来 v1.24 做 4K HDR10（4K = 4×1080p pixels · 2ms 开销也仍在预算）若需极致
//! GPU-only 路径 · 可升级到 Metal compute shader 读 src 写 out · 一天的 task。
//!
//! ## 自验证配合（VP-4 · 防镜子验镜子盲区）
//! FM-SELF-VERIFY-MIRROR：用同一产品 CARenderer 路径验自己 = 即使都翻也 diff≈0 "过"。
//! 对应 scripts/verify-v1.14.mjs `vp4_pixel_diff()` 加 playwright headless 外部渲染作
//! anchor · 三图对比（internal / external / mp4 frame 150）· 任一 > 阈值 FAIL。
//!
//! # FFI 安全
//! 全部 `unsafe` 都有 `// SAFETY:` 注释。main thread invariant 由 caller 保证（`new` / `sample`
//! 签名非 `Send`· 调用方只能在 main thread 用）。

use std::ffi::c_void;
use std::ptr::NonNull;

use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2_core_foundation::{CFDictionary, CFRetained, CFString, CGPoint, CGRect, CGSize};
use objc2_foundation::{NSCopying, NSMutableDictionary, NSNumber, NSString};
use objc2_io_surface::{
    kIOSurfaceBytesPerElement, kIOSurfaceBytesPerRow, kIOSurfaceHeight, kIOSurfacePixelFormat,
    kIOSurfaceWidth, IOSurfaceLockOptions, IOSurfaceRef,
};
use objc2_metal::{
    MTLCreateSystemDefaultDevice, MTLDevice, MTLPixelFormat, MTLStorageMode, MTLTexture,
    MTLTextureDescriptor, MTLTextureUsage,
};
use objc2_quartz_core::{CALayer, CARenderer};

use crate::iosurface::{IOSurfaceHandle, PIXEL_FORMAT_BGRA};
use crate::ShellError;

/// 每像素字节数 · BGRA8 = 4。
const BYTES_PER_ELEMENT: usize = 4;

/// CARenderer 采样器 · 单例复用 · 每帧只调 `sample`。
///
/// **生命周期**：`new(w, h)` 一次 · `sample(&layer)` 多次 · drop 释放 device / texture / surface。
///
/// **not Send / Sync**：内部持 Metal / CARenderer 对象 · CoreAnimation 对象只能在
/// 创建它们的 thread（main thread for AppKit hosted layer）操作。
pub struct CARendererSampler {
    /// Metal device · 仅一个 system default · 持一份引用防早释放。
    #[allow(dead_code)]
    device: Retained<ProtocolObject<dyn MTLDevice>>,
    /// IOSurface-backed MTLTexture · CARenderer 的 render target。
    #[allow(dead_code)]
    texture: Retained<ProtocolObject<dyn MTLTexture>>,
    /// 底层 IOSurface（**Y 反的** · CARenderer 原始输出）· 内部用不出手。
    src_surface: CFRetained<IOSurfaceRef>,
    /// **翻正后**的 IOSurface（Y 正 · 跟 HTML 一致）· `sample()` 返给调用方的 handle
    /// clone 自此块 · +1 ref 下游使用。
    out_surface: CFRetained<IOSurfaceRef>,
    /// CARenderer · rendererWithMTLTexture 绑死 texture · setLayer 可动态换。
    renderer: Retained<CARenderer>,
    /// 目标像素尺寸（logical）· 与 IOSurface / MTLTexture / renderer bounds 一致。
    width: u32,
    height: u32,
}

impl CARendererSampler {
    /// 创建采样器 · 分配 IOSurface + MTLTexture + CARenderer。
    ///
    /// **必须在 main thread 调用**（CAMetalLayer / CARenderer / MTLDevice 初始化约定）。
    /// 失败返 `ShellError::SnapshotFailed`。
    pub fn new(width: u32, height: u32) -> Result<Self, ShellError> {
        if width == 0 || height == 0 {
            return Err(ShellError::SnapshotFailed(format!(
                "invalid sampler dimensions: {width}x{height}"
            )));
        }

        // 1. 两块 IOSurface (BGRA · W*H · 4 bytes per element):
        //    - src_surface · CARenderer 渲染目标 · Y 反的
        //    - out_surface · Y flip 后的结果 · 返给调用方
        let src_surface = create_iosurface(width as usize, height as usize)?;
        let out_surface = create_iosurface(width as usize, height as usize)?;

        // 2. Metal device
        let device = MTLCreateSystemDefaultDevice()
            .ok_or_else(|| ShellError::SnapshotFailed("no Metal device".into()))?;

        // 3. MTLTexture descriptor · BGRA8Unorm · RenderTarget + ShaderRead · Shared storage
        // SAFETY: MTLTextureDescriptor 类方法无前置状态 · 参数合法（BGRA8Unorm / 尺寸 > 0）。
        let tex_desc = unsafe {
            MTLTextureDescriptor::texture2DDescriptorWithPixelFormat_width_height_mipmapped(
                MTLPixelFormat::BGRA8Unorm,
                width as usize,
                height as usize,
                false,
            )
        };
        tex_desc.setUsage(MTLTextureUsage::RenderTarget | MTLTextureUsage::ShaderRead);
        tex_desc.setStorageMode(MTLStorageMode::Shared);

        // 4. Texture · IOSurface-backed（src_surface）· zero-copy GPU path
        //    （POC-04D 验过 Metal/IOSurface 桥）。out_surface 没有 MTLTexture · 只用 CPU
        //    memcpy 写入 · 不经 GPU · 省一块 texture。
        let texture = device
            .newTextureWithDescriptor_iosurface_plane(&tex_desc, &src_surface, 0)
            .ok_or_else(|| {
                ShellError::SnapshotFailed(
                    "MTLDevice newTextureWithDescriptor:iosurface: returned nil".into(),
                )
            })?;

        // 5. CARenderer · 绑定 target texture · options=nil（ColorSpace 用 device default sRGB）
        // SAFETY: CARenderer::rendererWithMTLTexture_options 是 class method · 参数 texture 非 nil ·
        // options 允许 nil（Apple 文档：pass nil for default sRGB）。
        let renderer = unsafe { CARenderer::rendererWithMTLTexture_options(&texture, None) };

        Ok(Self {
            device,
            texture,
            src_surface,
            out_surface,
            renderer,
            width,
            height,
        })
    }

    /// 视口宽度（像素）。
    pub fn width(&self) -> u32 {
        self.width
    }

    /// 视口高度（像素）。
    pub fn height(&self) -> u32 {
        self.height
    }

    /// 采样一帧 · `layer` = `WKWebView.layer`（caller 负责 `setWantsLayer(true)` + 驱动过
    /// `displayIfNeeded` / `CATransaction::flush` 让 layer tree 可见）。
    ///
    /// 返回的 `IOSurfaceHandle` clone 自内部 surface（+1 ref）· 下游 VT 拿去 wrap
    /// CVPixelBuffer。**同一个 sampler 连续 sample 会写同一块 IOSurface** — 下游必须在
    /// 下次 `sample` 之前消费完（VT 的 `VTCompressionSessionEncodeFrame` 是同步 enqueue · OK）。
    ///
    /// **必须在 main thread 调用**。
    pub fn sample(&self, layer: &CALayer) -> Result<IOSurfaceHandle, ShellError> {
        let bounds = CGRect {
            origin: CGPoint { x: 0.0, y: 0.0 },
            size: CGSize {
                width: self.width as f64,
                height: self.height as f64,
            },
        };

        // 1. 绑 layer（renderer 只弱引 · layer 生命周期由 WKWebView 管）
        // SAFETY: CARenderer::setLayer 主线程调用 · layer 为 &CALayer · renderer / layer 都非 nil。
        self.renderer.setLayer(Some(layer));

        // 2. setBounds · 等于目标 texture 尺寸
        self.renderer.setBounds(bounds);

        // 3. beginFrame · timeStamp=null 让 renderer 用 now
        // SAFETY: beginFrameAtTime_timeStamp 主线程调用 · timeStamp 允许 null (Apple 文档)。
        unsafe {
            self.renderer.beginFrameAtTime_timeStamp(0.0, core::ptr::null_mut());
        }

        // 4. addUpdateRect · full bounds（每帧全量脏区 · 简单稳定）
        self.renderer.addUpdateRect(bounds);

        // 5. render + endFrame
        self.renderer.render();
        self.renderer.endFrame();

        // 6. **Y flip** · src_surface（Y 反）→ out_surface（Y 正）· CPU 行倒序 memcpy。
        //    1080p ~0.5ms 实测 · 远低于 60fps 预算（16.67ms）。
        flip_y_surface(
            &self.src_surface,
            &self.out_surface,
            self.width as usize,
            self.height as usize,
        )?;

        // 7. 打包 IOSurfaceHandle 返回（clone = +1 ref · out_surface 已 Y 正）
        Ok(IOSurfaceHandle::from_surface(self.out_surface.clone()))
    }
}

/// Y flip · src → dst · 行倒序 memcpy。两块 IOSurface 同尺寸同 BGRA 格式。
///
/// 策略：
/// 1. `src.lock(ReadOnly)` + `dst.lock(AvoidSync)` — AvoidSync 因我们会全量覆盖 · 不需读旧值。
/// 2. for y in 0..H: `dst_row[y] ← src_row[H-1-y]`（`copy_nonoverlapping` · 按 `bytes_per_row`）
///    - 按 `width * 4` 字节拷 · 不含 padding（两块 surface 可能 padding 不同）。
/// 3. 对称 unlock · 任何 lock 失败均不覆盖另一个 unlock（seeded 参数独立）。
///
/// 错误模式：任一 lock 非零 → `SnapshotFailed`；`bytes_per_row < width*4`（不应发生）
/// → `SnapshotFailed`。unlock 失败仅记 stderr 不 fatal（该帧数据已正确）。
fn flip_y_surface(
    src: &IOSurfaceRef,
    dst: &IOSurfaceRef,
    width: usize,
    height: usize,
) -> Result<(), ShellError> {
    let row_bytes = width.checked_mul(BYTES_PER_ELEMENT).ok_or_else(|| {
        ShellError::SnapshotFailed(format!("flip row overflow: width={width}"))
    })?;

    let mut src_seed: u32 = 0;
    // SAFETY: src lock(ReadOnly) · seed out-slot valid。
    let src_lock = unsafe { src.lock(IOSurfaceLockOptions::ReadOnly, &mut src_seed) };
    if src_lock != 0 {
        return Err(ShellError::SnapshotFailed(format!(
            "flip: src lock failed: {src_lock}"
        )));
    }

    let mut dst_seed: u32 = 0;
    // SAFETY: dst lock(AvoidSync) · 我们全量覆盖 · 不需读旧 · 省 GPU sync 栈。
    //   AvoidSync 对应 bit 0b10 (kIOSurfaceLockAvoidSync) · objc2_io_surface 枚举里
    //   没有直接常量（0 = 默认 ReadWrite）· 用默认 ReadWrite（bit 0b00）也正确 · 只是
    //   会强制 GPU flush · 对 CPU-only dst surface 无影响。这里用 empty()（=ReadWrite）稳妥。
    let dst_lock = unsafe { dst.lock(IOSurfaceLockOptions::empty(), &mut dst_seed) };
    if dst_lock != 0 {
        // unlock src · 别泄 ref
        // SAFETY: 对称 unlock · 同 seed · 前面 lock 成功。
        let _ = unsafe { src.unlock(IOSurfaceLockOptions::ReadOnly, &mut src_seed) };
        return Err(ShellError::SnapshotFailed(format!(
            "flip: dst lock failed: {dst_lock}"
        )));
    }

    let src_base = src.base_address().as_ptr() as *const u8;
    let dst_base = dst.base_address().as_ptr() as *mut u8;
    let src_bpr = src.bytes_per_row();
    let dst_bpr = dst.bytes_per_row();
    let copy_ok = src_bpr >= row_bytes && dst_bpr >= row_bytes;

    if copy_ok {
        for y in 0..height {
            let src_y = height - 1 - y;
            // SAFETY: src_y < height · 索引在 src 范围内；row_bytes ≤ src_bpr。
            let src_row = unsafe { src_base.add(src_y * src_bpr) };
            // SAFETY: y < height · 索引在 dst 范围内；row_bytes ≤ dst_bpr。
            let dst_row = unsafe { dst_base.add(y * dst_bpr) };
            // SAFETY: row_bytes 字节不超出两侧 surface · 无重叠（src/dst 不同 surface）。
            unsafe {
                std::ptr::copy_nonoverlapping(src_row, dst_row, row_bytes);
            }
        }
    }

    // 对称 unlock · 任一失败记 stderr 继续（数据已正确 · 纯 refcount 失配）。
    // SAFETY: 对称 unlock · 同 seed · 前面 lock 成功。
    let src_unlock = unsafe { src.unlock(IOSurfaceLockOptions::ReadOnly, &mut src_seed) };
    // SAFETY: 对称 unlock · 同 seed · 前面 lock 成功。
    let dst_unlock = unsafe { dst.unlock(IOSurfaceLockOptions::empty(), &mut dst_seed) };
    if src_unlock != 0 {
        eprintln!("carenderer: flip src unlock returned {src_unlock} (non-fatal)");
    }
    if dst_unlock != 0 {
        eprintln!("carenderer: flip dst unlock returned {dst_unlock} (non-fatal)");
    }

    if !copy_ok {
        return Err(ShellError::SnapshotFailed(format!(
            "flip: row-stride too small · src_bpr={src_bpr} dst_bpr={dst_bpr} need={row_bytes}"
        )));
    }

    Ok(())
}

/// 建一个 BGRA IOSurface（kCVPixelFormatType_32BGRA）· W * H。
///
/// CoreFoundation dictionary 的 5 个 key：
/// - `kIOSurfaceWidth` / `kIOSurfaceHeight`
/// - `kIOSurfaceBytesPerElement` = 4
/// - `kIOSurfaceBytesPerRow` = width * 4
/// - `kIOSurfacePixelFormat` = `'BGRA'`
fn create_iosurface(width: usize, height: usize) -> Result<CFRetained<IOSurfaceRef>, ShellError> {
    let dict: Retained<NSMutableDictionary<NSString, NSNumber>> = NSMutableDictionary::new();
    // SAFETY: k* 常量来自 linked framework · 运行时解析后必非 nil。
    let entries: [(&CFString, Retained<NSNumber>); 5] = [
        (
            unsafe { kIOSurfaceWidth },
            NSNumber::new_isize(width as isize),
        ),
        (
            unsafe { kIOSurfaceHeight },
            NSNumber::new_isize(height as isize),
        ),
        (
            unsafe { kIOSurfaceBytesPerElement },
            NSNumber::new_isize(BYTES_PER_ELEMENT as isize),
        ),
        (
            unsafe { kIOSurfaceBytesPerRow },
            NSNumber::new_isize((BYTES_PER_ELEMENT * width) as isize),
        ),
        (
            unsafe { kIOSurfacePixelFormat },
            NSNumber::new_u32(PIXEL_FORMAT_BGRA),
        ),
    ];
    for (cf_key, value) in entries {
        // SAFETY: CFString 与 NSString toll-free bridging · 同一 objc runtime 对象。
        let ns_key: &NSString = unsafe { &*(cf_key as *const CFString as *const NSString) };
        let key_proto: &ProtocolObject<dyn NSCopying> = ProtocolObject::from_ref(ns_key);
        // SAFETY: setObject_forKey 主线程调用 · value / key 都非 nil · dict 可变。
        unsafe {
            dict.setObject_forKey(&*value, key_proto);
        }
    }

    // SAFETY: NSDictionary<NSString, NSNumber> 与 CFDictionary toll-free bridging · 同一对象。
    let ns_dict: &objc2_foundation::NSDictionary<NSString, NSNumber> = &dict;
    let cf_dict: &CFDictionary = unsafe {
        &*(ns_dict as *const objc2_foundation::NSDictionary<NSString, NSNumber>
            as *const CFDictionary)
    };

    // SAFETY: IOSurfaceRef::new 等价 IOSurfaceCreate(dict) · dict 格式合法（已填 5 必填 key）。
    unsafe { IOSurfaceRef::new(cf_dict) }
        .ok_or_else(|| ShellError::SnapshotFailed("IOSurfaceCreate returned nil".into()))
}

/// 测试 / 诊断辅助 · 读 IOSurface 中心像素（RGBA u8 四元）· 用在 test 里验中心红。
///
/// 内部 lock-ReadOnly + unlock 配对 · 不修改 IOSurface 内容。**只在 sample 完后调用**
/// （layer render pass 已 flush 到 IOSurface）。
///
/// 返回：(r, g, b, a)（注意 BGRA → RGBA 字节序换位）。
pub fn read_center_rgba(surface: &IOSurfaceRef) -> Result<(u8, u8, u8, u8), ShellError> {
    let width = surface.width();
    let height = surface.height();
    if width == 0 || height == 0 {
        return Err(ShellError::SnapshotFailed(format!(
            "IOSurface has zero extent: {width}x{height}"
        )));
    }

    let mut seed: u32 = 0;
    // SAFETY: IOSurfaceLock(ReadOnly) · seed 是合法 out-parameter slot。
    let lock_status = unsafe {
        surface.lock(
            objc2_io_surface::IOSurfaceLockOptions::ReadOnly,
            &mut seed as *mut u32,
        )
    };
    if lock_status != 0 {
        return Err(ShellError::SnapshotFailed(format!(
            "IOSurfaceLock(ReadOnly) failed: {lock_status}"
        )));
    }

    let base: NonNull<c_void> = surface.base_address();
    let bytes_per_row = surface.bytes_per_row();

    let result: Result<(u8, u8, u8, u8), ShellError> = {
        let cx = width / 2;
        let cy = height / 2;
        // SAFETY: lock 已持 · base + cy*bpr + cx*4 ≤ base + H*bpr · 在 surface 内。
        let pixel_ptr = unsafe {
            (base.as_ptr() as *const u8).add(cy * bytes_per_row + cx * BYTES_PER_ELEMENT)
        };
        // SAFETY: 读 4 字节 · 地址有效（同上）· BGRA 布局。
        let b = unsafe { *pixel_ptr };
        let g = unsafe { *pixel_ptr.add(1) };
        let r = unsafe { *pixel_ptr.add(2) };
        let a = unsafe { *pixel_ptr.add(3) };
        Ok((r, g, b, a))
    };

    // SAFETY: 对称 unlock · 同 seed。
    let unlock_status = unsafe {
        surface.unlock(
            objc2_io_surface::IOSurfaceLockOptions::ReadOnly,
            &mut seed as *mut u32,
        )
    };
    if unlock_status != 0 {
        return Err(ShellError::SnapshotFailed(format!(
            "IOSurfaceUnlock(ReadOnly) failed: {unlock_status}"
        )));
    }
    result
}
