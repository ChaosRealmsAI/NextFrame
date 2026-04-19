//! T-08 · AVAssetWriter fragmented MP4 · moov-front · BT.709 SDR tagging
//!
//! 蓝本: `poc/POC-03-av-writer-fragmented/src/main.rs` (fragmented path 已跑通)
//! + `poc/POC-02-vt-h264/src/main.rs` (passthrough writer 已跑通)
//!
//! 关键硬约束:
//! - `AVFileTypeMPEG4`
//! - `shouldOptimizeForNetworkUse = YES` (Apple "moov front" 关键开关)
//! - `movieFragmentInterval = CMTime(1, 1)` (1s fragment)
//! - 色彩三元组 = BT.709 / ITU_R_709_2
//! - `expectsMediaDataInRealTime = NO`
//! - `mediaTimeScale = 600` (30/60 fps 整除)
//! - finishWriting 异步: 用 Mutex+Condvar 桥接等 completion
//! - back-pressure: `while !input.isReadyForMoreMediaData { spin_sleep(100μs) }`
//! - passthrough 模式: outputSettings=None · sourceFormatHint=&format_description
//!   (我们给的是已压缩 H264 sample · writer 不 re-encode)
//! - 禁 unwrap/expect/panic/todo (测试文件除外)
//! - FFI `unsafe` 全带一句注释说明理由

use std::path::{Path, PathBuf};
use std::ptr::NonNull;
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::Duration;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2_av_foundation::{
    AVAssetWriter, AVAssetWriterInput, AVAssetWriterStatus, AVFileTypeMPEG4, AVMediaTypeVideo,
};
use objc2_core_media::{
    kCMBlockBufferAssureMemoryNowFlag, kCMTimeInvalid, CMBlockBuffer, CMFormatDescription,
    CMSampleBuffer, CMSampleTimingInfo, CMTime, CMVideoFormatDescription,
};
use objc2_foundation::NSURL;

use crate::pipeline::vt_wrap::CompressedFrame;
use crate::pipeline::{OutputStats, PipelineError};

/// 时间刻度: 毫秒 · 对齐 `CompressedFrame.pts_ms` (timescale=1000)。
const PTS_TIMESCALE: i32 = 1000;
/// AVAssetWriterInput 内部 mediaTimeScale · 30/60 fps 整除。
const MEDIA_TIMESCALE: i32 = 600;
/// back-pressure spin 间隔 · AVAssetWriter 非实时模式下极少见到 !readyForMoreMediaData。
const BACKPRESSURE_SPIN: Duration = Duration::from_micros(100);
/// finishWriting 超时保护 · 防止 completion handler 卡死。
const FINISH_TIMEOUT: Duration = Duration::from_secs(30);

/// AVAssetWriter 封装 · fragmented MP4 · moov-front · passthrough H264。
///
/// 生命周期: `new()` → 多次 `append()` → `close() → OutputStats`。
/// **消费性 API**: `close` 接收 `self`, 保证调用后对象不可再用。
///
/// 注意: input 的 sourceFormatHint 来自**第一个** CompressedFrame 的 format_description,
/// 所以 writer + input 的创建是**懒加载** (第一次 append 时完成)。
pub struct Mp4Writer {
    // writer 在 new() 时创建 (不 startWriting)
    writer: Retained<AVAssetWriter>,
    // input 延迟到第一帧 append 时创建 (需要 format_description 作为 sourceFormatHint)
    input: Option<Retained<AVAssetWriterInput>>,
    output_path: PathBuf,
    #[allow(dead_code)] // T-07 集成 / 日志用
    width: u32,
    #[allow(dead_code)]
    height: u32,
    fps: u32,
    frames: u64,
    first_pts_ms: Option<u64>,
    last_pts_ms: u64,
    session_started: bool,
}

impl Mp4Writer {
    /// 初始化 writer (不 startWriting · input 延到第一次 append 创建)。
    ///
    /// # 硬约束
    /// - 目标文件已存在会先删除 (AVAssetWriter 遇到 file-exists 直接报错)
    /// - `shouldOptimizeForNetworkUse = YES` + `movieFragmentInterval = 1s` = moov-front
    pub fn new(
        output: &Path,
        width: u32,
        height: u32,
        fps: u32,
    ) -> Result<Self, PipelineError> {
        // AVAssetWriter 不接受已有文件 · 先清掉
        if output.exists() {
            std::fs::remove_file(output).map_err(|e| {
                PipelineError::IoError(format!("remove existing {}: {}", output.display(), e))
            })?;
        }

        // SAFETY: NSURL::from_file_path 内部 NSString 构造 · 仅读取路径 bytes。
        let url = NSURL::from_file_path(output)
            .ok_or_else(|| PipelineError::IoError(format!("invalid path {}", output.display())))?;

        // SAFETY: AVFileTypeMPEG4 是 Apple 暴露的静态常量 · 取地址安全。
        let file_type =
            unsafe { AVFileTypeMPEG4 }.ok_or(PipelineError::WriterSessionFailed)?;

        // SAFETY: assetWriterWithURL_fileType_error 是 Apple 标准构造器 · error-out 已包 Result。
        let writer = unsafe { AVAssetWriter::assetWriterWithURL_fileType_error(&url, file_type) }
            .map_err(|_e| PipelineError::WriterSessionFailed)?;

        // === 关键 flags: moov-front + fragmented ===
        // SAFETY: setShouldOptimizeForNetworkUse(true) = AVAssetWriter 会把 moov atom
        // 移到文件头部 (Apple "fast start" · 流媒体友好)。
        unsafe { writer.setShouldOptimizeForNetworkUse(true) };
        // SAFETY: movieFragmentInterval=1s · AVAssetWriter 每秒产一个 moof+mdat fragment,
        // 既保证 moov-front 又保证 crash-resilient (部分写入也能播)。
        // CMTime::new 是 CMTimeMake 包装 · value=1, timescale=1 → 1.0s.
        unsafe { writer.setMovieFragmentInterval(CMTime::new(1, 1)) };

        Ok(Self {
            writer,
            input: None,
            output_path: output.to_path_buf(),
            width,
            height,
            fps,
            frames: 0,
            first_pts_ms: None,
            last_pts_ms: 0,
            session_started: false,
        })
    }

    /// 追加一帧压缩 sample。
    ///
    /// 第一次调用时 (self.input == None) 用 cf.format_description 作为 sourceFormatHint
    /// 创建 input + add 到 writer + startWriting + startSession。
    /// back-pressure: input 未 ready 时 spin sleep 100μs (非实时模式下极少触发)。
    pub fn append(&mut self, cf: &CompressedFrame) -> Result<(), PipelineError> {
        if self.input.is_none() {
            self.init_input_and_session(cf)?;
        }

        let input = self.input.as_ref().ok_or(PipelineError::WriterSessionFailed)?;

        let sample = build_sample_buffer(cf, self.fps)?;

        // back-pressure spin · AVAssetWriter 非实时模式 · 这里通常只转一圈。
        loop {
            // SAFETY: isReadyForMoreMediaData 只读 BOOL。
            if unsafe { input.isReadyForMoreMediaData() } {
                break;
            }
            thread::sleep(BACKPRESSURE_SPIN);
        }

        // SAFETY: appendSampleBuffer 消费 sample · 返回 true 成功, false 看 writer.error。
        let ok = unsafe { input.appendSampleBuffer(&sample) };
        if !ok {
            return Err(PipelineError::WriterSessionFailed);
        }

        self.frames += 1;
        self.last_pts_ms = cf.pts_ms;
        Ok(())
    }

    /// 用第一帧的 format_description 作为 sourceFormatHint 创建 input + 启动 session。
    fn init_input_and_session(&mut self, cf: &CompressedFrame) -> Result<(), PipelineError> {
        // SAFETY: AVMediaTypeVideo 是 Apple 静态常量。
        let media_type =
            unsafe { AVMediaTypeVideo }.ok_or(PipelineError::WriterSessionFailed)?;

        // passthrough 模式: outputSettings = None → AVAssetWriter 不再编码,
        // 直接 re-wrap 传进来的已压缩 CMSampleBuffer 成 MP4 sample entry。
        // sourceFormatHint 告诉 AVAssetWriter 我们将送什么格式 (avcC box 源头)。
        let format_hint = cv_to_cm_format(cf.format_description.as_ref_format());

        // SAFETY: assetWriterInputWithMediaType_outputSettings_sourceFormatHint:
        //   outputSettings=None (passthrough) · sourceFormatHint=&format_hint (非 null)。
        let input = unsafe {
            AVAssetWriterInput::assetWriterInputWithMediaType_outputSettings_sourceFormatHint(
                media_type,
                None,
                Some(format_hint),
            )
        };

        // SAFETY: setter.
        unsafe { input.setExpectsMediaDataInRealTime(false) };
        // SAFETY: setter · mediaTimeScale=600 对齐 30/60 fps。
        unsafe { input.setMediaTimeScale(MEDIA_TIMESCALE) };

        // SAFETY: canAddInput 只读检查 · 无副作用。
        if !unsafe { self.writer.canAddInput(&input) } {
            return Err(PipelineError::WriterSessionFailed);
        }
        // SAFETY: addInput 挂到 writer · 生命周期由 writer 保持。
        unsafe { self.writer.addInput(&input) };

        // SAFETY: startWriting · writer 进入 .Writing 状态。
        if !unsafe { self.writer.startWriting() } {
            return Err(PipelineError::WriterSessionFailed);
        }

        // 第一帧的 pts 作为 session start time · 保证 AVAssetWriter 时间轴从 0 开始。
        // SAFETY: CMTime::new 是 CMTimeMake 的 wrapper · plain struct init · 无副作用。
        let start = unsafe { CMTime::new(cf.pts_ms as i64, PTS_TIMESCALE) };
        // SAFETY: startSessionAtSourceTime 必须在 startWriting 之后、appendSampleBuffer 之前。
        unsafe { self.writer.startSessionAtSourceTime(start) };

        self.input = Some(input);
        self.session_started = true;
        self.first_pts_ms = Some(cf.pts_ms);
        Ok(())
    }

    /// 收尾: endSession · markAsFinished · finishWriting (异步 · 阻塞等 completion)。
    ///
    /// 消费 self · 保证调用后对象不可复用。
    pub fn close(self) -> Result<OutputStats, PipelineError> {
        // 如果没有任何帧被 append · 我们直接报错 (AVAssetWriter 会拒绝空 session)。
        if !self.session_started {
            return Err(PipelineError::WriterSessionFailed);
        }
        let input = self
            .input
            .as_ref()
            .ok_or(PipelineError::WriterSessionFailed)?;

        // 结束 session · end time = last_pts + 1 frame duration.
        // SAFETY: plain struct init.
        let end = unsafe {
            CMTime::new(
                self.last_pts_ms as i64 + (1_000 / self.fps as i64).max(1),
                PTS_TIMESCALE,
            )
        };
        // SAFETY: endSessionAtSourceTime 关闭 session · 必须在 markAsFinished 之前。
        unsafe { self.writer.endSessionAtSourceTime(end) };
        // SAFETY: markAsFinished 告诉 input 不再有 sample 要 append。
        unsafe { input.markAsFinished() };

        finish_writer_sync(&self.writer)?;

        // SAFETY: status() 只读。
        let status = unsafe { self.writer.status() };
        if status != AVAssetWriterStatus::Completed {
            return Err(PipelineError::WriterSessionFailed);
        }

        let size_bytes = std::fs::metadata(&self.output_path)
            .map_err(|e| {
                PipelineError::IoError(format!(
                    "stat output {}: {}",
                    self.output_path.display(),
                    e
                ))
            })?
            .len();

        // 手工读文件前 N 字节 · 确认 moov atom 在 mdat 之前 (moov-front 验证)。
        let moov_front = verify_moov_front(&self.output_path)?;

        let first = self.first_pts_ms.unwrap_or(0);
        let duration_ms = self
            .last_pts_ms
            .saturating_sub(first)
            .saturating_add((1_000 / self.fps as u64).max(1));

        Ok(OutputStats {
            frames: self.frames,
            duration_ms,
            size_bytes,
            moov_front,
            path: self.output_path,
        })
    }
}

/// 把 `CompressedFrame` (AVCC bytes + format description + pts_ms) 包成 CMSampleBuffer。
///
/// 步骤:
/// 1. 用 libc::malloc 堆拷贝 data · 让 kCFAllocatorDefault 负责 free (CMBlockBuffer 释放时自动)。
/// 2. CMBlockBufferCreateWithMemoryBlock wrap bytes.
/// 3. CMSampleBufferCreateReady with format_description + timing.
fn build_sample_buffer(
    cf: &CompressedFrame,
    fps: u32,
) -> Result<Retained<CMSampleBuffer>, PipelineError> {
    let len = cf.data.len();
    if len == 0 {
        return Err(PipelineError::WriterSessionFailed);
    }
    // SAFETY: libc::malloc 分配 · 对齐任意 byte 都够 (u8 对齐=1)。
    let buf_ptr = unsafe { libc_malloc(len) };
    if buf_ptr.is_null() {
        return Err(PipelineError::IoError("libc::malloc returned null".into()));
    }
    // SAFETY: buf_ptr 指向 len 字节的有效内存 · cf.data 是合法 slice。
    unsafe {
        std::ptr::copy_nonoverlapping(cf.data.as_ptr(), buf_ptr as *mut u8, len);
    }

    let mut block_buffer_raw: *mut CMBlockBuffer = std::ptr::null_mut();
    // SAFETY: FFI · structure_allocator=None · block_allocator=None (默认 kCFAllocatorDefault
    // 会 free(buf_ptr)) · custom_block_source=null · offset=0 · flags=AssureMemoryNow。
    let status = unsafe {
        CMBlockBuffer::create_with_memory_block(
            None,
            buf_ptr,
            len,
            None,
            std::ptr::null(),
            0,
            len,
            kCMBlockBufferAssureMemoryNowFlag,
            NonNull::from(&mut block_buffer_raw),
        )
    };
    if status != 0 || block_buffer_raw.is_null() {
        // 创建失败 · 我们自己 free buf_ptr 防止泄漏。
        // SAFETY: 所有权仍在我们这 · 必须 free。
        unsafe { libc_free(buf_ptr) };
        return Err(PipelineError::WriterSessionFailed);
    }
    // SAFETY: 非空指针 · 成功接管 · Retained 负责 CFRelease。
    let block_buffer = unsafe {
        Retained::from_raw(block_buffer_raw).ok_or(PipelineError::WriterSessionFailed)?
    };

    let duration_ms = (1_000 / fps as i64).max(1);
    // SAFETY: CMTime::new is a plain struct initializer (wraps CMTimeMake).
    let duration = unsafe { CMTime::new(duration_ms, PTS_TIMESCALE) };
    // SAFETY: plain struct init.
    let pts = unsafe { CMTime::new(cf.pts_ms as i64, PTS_TIMESCALE) };
    // 非重排 → DTS 可以设 invalid (AllowFrameReordering=false · AVAssetWriter 会用 pts)。
    // SAFETY: kCMTimeInvalid 是 Apple 静态常量。
    let dts = unsafe { kCMTimeInvalid };
    let timing = CMSampleTimingInfo {
        duration,
        presentationTimeStamp: pts,
        decodeTimeStamp: dts,
    };
    let sample_size: usize = len;

    let mut sample_raw: *mut CMSampleBuffer = std::ptr::null_mut();
    let format_desc_base = cv_to_cm_format(cf.format_description.as_ref_format());

    // SAFETY: FFI · allocator=None · data_buffer=&block_buffer · format=&format_desc_base ·
    // num_samples=1 · timing_entries=1 · size_entries=1.
    let status = unsafe {
        CMSampleBuffer::create_ready(
            None,
            Some(&block_buffer),
            Some(format_desc_base),
            1,
            1,
            &timing as *const CMSampleTimingInfo,
            1,
            &sample_size as *const usize,
            NonNull::from(&mut sample_raw),
        )
    };
    if status != 0 || sample_raw.is_null() {
        return Err(PipelineError::WriterSessionFailed);
    }
    // SAFETY: 非空 · Retained 接管。
    let sample = unsafe {
        Retained::from_raw(sample_raw).ok_or(PipelineError::WriterSessionFailed)?
    };
    Ok(sample)
}

/// `CMVideoFormatDescription` 是 `CMFormatDescription` 的子类型 (CF type 层级 · layout 等价)。
fn cv_to_cm_format(v: &CMVideoFormatDescription) -> &CMFormatDescription {
    // SAFETY: Apple 的 CF type 层级 · video 是 format 的 subclass · opaque layout 相同。
    // (clippy/1.94 认为两者在 Rust 类型层面等价 · 但实际是 newtype alias · cast 表达意图。)
    #[allow(clippy::unnecessary_cast)]
    unsafe {
        &*(v as *const CMVideoFormatDescription as *const CMFormatDescription)
    }
}

/// 阻塞等 finishWriting 的 completion handler 触发。
///
/// AVAssetWriter 的 finishWriting 是异步 · 回调到内部 queue · 用 Mutex+Condvar 桥接。
fn finish_writer_sync(writer: &AVAssetWriter) -> Result<(), PipelineError> {
    let done = Arc::new((Mutex::new(false), Condvar::new()));
    let done_cb = done.clone();
    // `RcBlock::new` 需要 Fn + 'static · Arc<(Mutex, Condvar)> 满足。
    let handler = RcBlock::new(move || {
        let (lock, cv) = &*done_cb;
        if let Ok(mut guard) = lock.lock() {
            *guard = true;
            cv.notify_all();
        }
    });
    // SAFETY: finishWritingWithCompletionHandler 消费 block (AVAssetWriter 内部 retain)。
    // block 只访问 Arc · Send+Sync 满足。
    unsafe { writer.finishWritingWithCompletionHandler(&handler) };

    let (lock, cv) = &*done;
    let mut guard = lock
        .lock()
        .map_err(|_| PipelineError::IoError("finish mutex poisoned".into()))?;
    while !*guard {
        let (next_guard, timeout) = cv
            .wait_timeout(guard, FINISH_TIMEOUT)
            .map_err(|_| PipelineError::IoError("finish condvar poisoned".into()))?;
        guard = next_guard;
        if timeout.timed_out() {
            return Err(PipelineError::Timeout);
        }
    }
    Ok(())
}

/// 手工读文件 · 找 `moov` atom 是否在 `mdat` 之前。
///
/// MP4 atom 格式: `[size: u32 BE][type: 4 bytes][payload]`; size=1 → 扩展 u64 在 payload 开头。
/// fragmented MP4 顺序: `ftyp → moov → (moof → mdat)*`.
/// moov-front 检查: 扫到 moov 时是否还没见到 mdat。
fn verify_moov_front(path: &Path) -> Result<bool, PipelineError> {
    let data = std::fs::read(path)
        .map_err(|e| PipelineError::IoError(format!("read {}: {}", path.display(), e)))?;

    let mut offset: usize = 0;
    let mut saw_mdat_first = false;
    while offset + 8 <= data.len() {
        let size32 = u32::from_be_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        let atom_type = &data[offset + 4..offset + 8];

        let size = if size32 == 1 {
            if offset + 16 > data.len() {
                break;
            }
            let mut size64_bytes = [0u8; 8];
            size64_bytes.copy_from_slice(&data[offset + 8..offset + 16]);
            u64::from_be_bytes(size64_bytes)
        } else if size32 == 0 {
            (data.len() - offset) as u64
        } else {
            size32 as u64
        };

        if atom_type == b"moov" {
            return Ok(!saw_mdat_first);
        }
        if atom_type == b"mdat" {
            saw_mdat_first = true;
        }

        if size < 8 {
            break;
        }
        let Ok(advance) = usize::try_from(size) else {
            break;
        };
        if advance == 0 || offset.saturating_add(advance) > data.len() {
            break;
        }
        offset += advance;
    }
    // 找不到 moov 就返 false (writer 失败时可能完全没写 moov)。
    Ok(false)
}

// ===== libc 最小 FFI · malloc/free · 给 CMBlockBuffer 用 =====
// 避免拉整个 libc crate 依赖 · 这两个 symbol 是 macOS libSystem 必有。

extern "C" {
    fn malloc(size: usize) -> *mut core::ffi::c_void;
    fn free(ptr: *mut core::ffi::c_void);
}

#[inline]
unsafe fn libc_malloc(size: usize) -> *mut core::ffi::c_void {
    // SAFETY: 调用者保证 size > 0 · 失败返回 null 由调用者处理。
    unsafe { malloc(size) }
}

#[inline]
unsafe fn libc_free(ptr: *mut core::ffi::c_void) {
    // SAFETY: 调用者保证 ptr 是 libc_malloc 返回的有效指针。
    unsafe { free(ptr) }
}
