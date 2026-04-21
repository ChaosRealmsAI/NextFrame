use std::path::{Path, PathBuf};

const PNG_MAGIC: &[u8; 8] = b"\x89PNG\r\n\x1a\n";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CaptureResult {
    pub out: PathBuf,
    pub bytes: u64,
    pub width: usize,
    pub height: usize,
}

#[cfg(target_os = "macos")]
pub fn capture_window_by_number(window_number: u32, out: &Path) -> Result<CaptureResult, String> {
    macos::capture_window_by_number(window_number, out)
}

#[cfg(not(target_os = "macos"))]
pub fn capture_window_by_number(_window_number: u32, _out: &Path) -> Result<CaptureResult, String> {
    Err("unsupported platform: nf capture requires macOS CoreGraphics".to_string())
}

fn validate_png_magic(out: &Path) -> Result<(), String> {
    let header = read_png_magic(out)?;
    if &header == PNG_MAGIC {
        Ok(())
    } else {
        Err(format!("capture did not produce a PNG: {}", out.display()))
    }
}

fn read_png_magic(out: &Path) -> Result<[u8; 8], String> {
    use std::io::Read;

    let mut file = std::fs::File::open(out)
        .map_err(|err| format!("read capture header failed for {}: {err}", out.display()))?;
    let mut header = [0u8; 8];
    file.read_exact(&mut header)
        .map_err(|err| format!("read capture header failed for {}: {err}", out.display()))?;
    Ok(header)
}

#[cfg(target_os = "macos")]
mod macos {
    use std::ffi::c_void;
    use std::os::unix::ffi::OsStrExt;
    use std::path::Path;
    use std::ptr;

    use super::{CaptureResult, validate_png_magic};

    type Boolean = u8;
    type CfIndex = isize;
    type CfAllocatorRef = *const c_void;
    type CfTypeRef = *const c_void;
    type CfStringRef = *const c_void;
    type CfUrlRef = *const c_void;
    type CfDictionaryRef = *const c_void;
    type CgImageRef = *mut c_void;
    type CgImageDestinationRef = *mut c_void;

    const K_CF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;
    const K_CG_WINDOW_LIST_OPTION_INCLUDING_WINDOW: u32 = 1 << 3;
    const K_CG_WINDOW_IMAGE_BEST_RESOLUTION: u32 = 1 << 3;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CGPoint {
        x: f64,
        y: f64,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CGSize {
        width: f64,
        height: f64,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CGRect {
        origin: CGPoint,
        size: CGSize,
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFRelease(cf: CfTypeRef);
        fn CFStringCreateWithCString(
            alloc: CfAllocatorRef,
            c_str: *const i8,
            encoding: u32,
        ) -> CfStringRef;
        fn CFURLCreateFromFileSystemRepresentation(
            allocator: CfAllocatorRef,
            buffer: *const u8,
            buf_len: CfIndex,
            is_directory: Boolean,
        ) -> CfUrlRef;
    }

    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        #[link_name = "CGRectNull"]
        static CG_RECT_NULL: CGRect;

        fn CGImageGetWidth(image: CgImageRef) -> usize;
        fn CGImageGetHeight(image: CgImageRef) -> usize;
        fn CGWindowListCreateImage(
            screen_bounds: CGRect,
            list_option: u32,
            window_id: u32,
            image_option: u32,
        ) -> CgImageRef;
    }

    #[link(name = "ImageIO", kind = "framework")]
    unsafe extern "C" {
        fn CGImageDestinationCreateWithURL(
            url: CfUrlRef,
            image_type: CfStringRef,
            count: usize,
            options: CfDictionaryRef,
        ) -> CgImageDestinationRef;
        fn CGImageDestinationAddImage(
            destination: CgImageDestinationRef,
            image: CgImageRef,
            properties: CfDictionaryRef,
        );
        fn CGImageDestinationFinalize(destination: CgImageDestinationRef) -> Boolean;
    }

    pub fn capture_window_by_number(
        window_number: u32,
        out: &Path,
    ) -> Result<CaptureResult, String> {
        if let Some(parent) = out.parent().filter(|parent| !parent.as_os_str().is_empty()) {
            std::fs::create_dir_all(parent)
                .map_err(|err| format!("create capture directory failed: {err}"))?;
        }

        let image = create_window_image(window_number)?;
        let width = unsafe {
            // SAFETY: image is a non-null CGImage returned by CGWindowListCreateImage.
            CGImageGetWidth(image)
        };
        let height = unsafe {
            // SAFETY: image is a non-null CGImage returned by CGWindowListCreateImage.
            CGImageGetHeight(image)
        };

        let encode_result = encode_png(image, out);
        unsafe {
            // SAFETY: image was returned retained by CGWindowListCreateImage and is released once.
            CFRelease(image.cast_const());
        }
        encode_result?;

        validate_png_magic(out)?;
        let bytes = std::fs::metadata(out)
            .map_err(|err| format!("read capture metadata failed: {err}"))?
            .len();

        Ok(CaptureResult {
            out: out.to_path_buf(),
            bytes,
            width,
            height,
        })
    }

    fn create_window_image(window_number: u32) -> Result<CgImageRef, String> {
        let rect = unsafe {
            // SAFETY: CGRectNull is a CoreGraphics constant used to request the window's full bounds.
            CG_RECT_NULL
        };
        let image = unsafe {
            // SAFETY: CGWindowListCreateImage is called with documented constants and a window number
            // obtained from NSWindow.windowNumber.
            CGWindowListCreateImage(
                rect,
                K_CG_WINDOW_LIST_OPTION_INCLUDING_WINDOW,
                window_number,
                K_CG_WINDOW_IMAGE_BEST_RESOLUTION,
            )
        };
        if image.is_null() {
            return Err(format!(
                "capture returned null for native window {window_number}"
            ));
        }
        Ok(image)
    }

    fn encode_png(image: CgImageRef, out: &Path) -> Result<(), String> {
        let url = file_url(out)?;
        let png_type = cf_string("public.png")?;
        let destination = unsafe {
            // SAFETY: url and png_type are valid CoreFoundation objects created in this function.
            CGImageDestinationCreateWithURL(url, png_type, 1, ptr::null())
        };
        if destination.is_null() {
            unsafe {
                // SAFETY: url and png_type are valid CF objects and are released exactly once here.
                CFRelease(url);
                CFRelease(png_type);
            }
            return Err(format!(
                "create PNG destination failed for {}",
                out.display()
            ));
        }

        unsafe {
            // SAFETY: destination and image are non-null CoreGraphics/ImageIO objects.
            CGImageDestinationAddImage(destination, image, ptr::null());
        }
        let finalized = unsafe {
            // SAFETY: destination is a valid CGImageDestinationRef.
            CGImageDestinationFinalize(destination)
        };
        unsafe {
            // SAFETY: these CF objects were created in this function and are released exactly once.
            CFRelease(destination.cast_const());
            CFRelease(url);
            CFRelease(png_type);
        }

        if finalized == 0 {
            return Err(format!("finalize PNG failed for {}", out.display()));
        }
        Ok(())
    }

    fn file_url(path: &Path) -> Result<CfUrlRef, String> {
        let bytes = path.as_os_str().as_bytes();
        let len = CfIndex::try_from(bytes.len())
            .map_err(|_| format!("capture path is too long: {}", path.display()))?;
        let url = unsafe {
            // SAFETY: bytes points to a valid filesystem path byte slice for the duration of the call.
            CFURLCreateFromFileSystemRepresentation(ptr::null(), bytes.as_ptr(), len, 0)
        };
        if url.is_null() {
            return Err(format!("create file URL failed for {}", path.display()));
        }
        Ok(url)
    }

    fn cf_string(value: &str) -> Result<CfStringRef, String> {
        let c_string = std::ffi::CString::new(value)
            .map_err(|err| format!("create CFString input failed: {err}"))?;
        let cf_string = unsafe {
            // SAFETY: c_string is NUL-terminated and alive for the duration of the call.
            CFStringCreateWithCString(ptr::null(), c_string.as_ptr(), K_CF_STRING_ENCODING_UTF8)
        };
        if cf_string.is_null() {
            return Err(format!("create CFString failed for {value}"));
        }
        Ok(cf_string)
    }
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{PNG_MAGIC, read_png_magic};

    #[test]
    fn capture_png_magic_bytes() -> Result<(), Box<dyn std::error::Error>> {
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
        let path = std::env::temp_dir().join(format!(
            "nextframe-capture-magic-{}-{nanos}.png",
            std::process::id()
        ));
        std::fs::write(&path, [PNG_MAGIC.as_slice(), b"capture"].concat())?;

        let header = read_png_magic(&path)?;

        std::fs::remove_file(path)?;
        assert_eq!(&header, PNG_MAGIC);
        Ok(())
    }
}
