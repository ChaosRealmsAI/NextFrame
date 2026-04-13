use super::*;

#[test]
fn encoding_base64_encode_covers_empty_small_and_padding_cases() {
    assert_eq!(encoding::base64_encode(b""), "");
    assert_eq!(encoding::base64_encode(b"foo"), "Zm9v");
    assert_eq!(encoding::base64_encode(b"f"), "Zg==");
    assert_eq!(encoding::base64_encode(b"fo"), "Zm8=");
}

#[test]
fn encoding_percent_decode_url_path_decodes_valid_sequences() {
    let decoded = encoding::percent_decode_url_path("/folder%20name/%E4%BD%A0%E5%A5%BD.txt")
        .expect("decode valid percent-encoded URL path");

    assert_eq!(decoded, "/folder name/你好.txt");
}

#[test]
fn encoding_percent_decode_url_path_rejects_invalid_hex_digits() {
    let error = encoding::percent_decode_url_path("/bad%2Gpath")
        .expect_err("invalid hex digits should fail percent decoding");

    assert_eq!(error, "invalid percent-encoding in URL path: /bad%2Gpath");
}

#[test]
fn encoding_percent_decode_url_path_rejects_partial_sequences() {
    let error = encoding::percent_decode_url_path("/bad%")
        .expect_err("partial percent sequence should fail percent decoding");

    assert_eq!(error, "invalid percent-encoding in URL path: /bad%");
}

#[test]
fn encoding_percent_encode_path_preserves_slashes_and_encodes_spaces_and_unicode() {
    let encoded = encoding::percent_encode_path("folder name/你好.txt");

    assert_eq!(encoded, "folder%20name/%E4%BD%A0%E5%A5%BD.txt");
}

#[test]
fn encoding_path_to_file_url_formats_absolute_paths() {
    let path = if cfg!(windows) {
        PathBuf::from(r"C:\Temp\clip.mp4")
    } else {
        PathBuf::from("/tmp/clip.mp4")
    };

    let url = encoding::path_to_file_url(&path);

    if cfg!(windows) {
        assert_eq!(url, "file:///C:/Temp/clip.mp4");
    } else {
        assert_eq!(url, "file:///tmp/clip.mp4");
    }
}

#[test]
fn encoding_path_to_file_url_encodes_spaces() {
    let path = if cfg!(windows) {
        PathBuf::from(r"C:\Program Files\clip one.mp4")
    } else {
        PathBuf::from("/tmp/clip one.mp4")
    };

    let url = encoding::path_to_file_url(&path);

    if cfg!(windows) {
        assert_eq!(url, "file:///C:/Program%20Files/clip%20one.mp4");
    } else {
        assert_eq!(url, "file:///tmp/clip%20one.mp4");
    }
}

#[test]
fn encoding_decode_hex_digit_decodes_numeric_lowercase_uppercase_and_invalid_inputs() {
    assert_eq!(encoding::decode_hex_digit(b'0'), Some(0));
    assert_eq!(encoding::decode_hex_digit(b'9'), Some(9));
    assert_eq!(encoding::decode_hex_digit(b'a'), Some(10));
    assert_eq!(encoding::decode_hex_digit(b'f'), Some(15));
    assert_eq!(encoding::decode_hex_digit(b'A'), Some(10));
    assert_eq!(encoding::decode_hex_digit(b'F'), Some(15));
    assert_eq!(encoding::decode_hex_digit(b'g'), None);
    assert_eq!(encoding::decode_hex_digit(b'/'), None);
}

#[test]
fn encoding_base64_encode_handles_exactly_one_byte_with_double_padding() {
    assert_eq!(encoding::base64_encode(b"A"), "QQ==");
}

#[test]
fn encoding_base64_encode_handles_exactly_two_bytes_with_single_padding() {
    assert_eq!(encoding::base64_encode(b"AB"), "QUI=");
}

#[test]
fn encoding_base64_encode_handles_binary_bytes() {
    assert_eq!(encoding::base64_encode(&[0x00, 0xFF]), "AP8=");
}

#[test]
fn encoding_percent_decode_url_path_decodes_consecutive_percent_sequences() {
    let decoded =
        encoding::percent_decode_url_path("/%E4%BD%A0%E5%A5%BD%E4%B8%96%E7%95%8C/%F0%9F%8C%8D")
            .expect("decode consecutive percent-encoded byte sequences");

    assert_eq!(decoded, "/\u{4f60}\u{597d}\u{4e16}\u{754c}/\u{1f30d}");
}

#[test]
fn encoding_percent_encode_path_handles_spaces_and_unicode_segments() {
    let encoded = encoding::percent_encode_path("folder name/\u{4f60}\u{597d} \u{4e16}\u{754c}.txt");

    assert_eq!(
        encoded,
        "folder%20name/%E4%BD%A0%E5%A5%BD%20%E4%B8%96%E7%95%8C.txt"
    );
}

#[test]
fn encoding_path_to_file_url_encodes_unicode_paths() {
    let path = if cfg!(windows) {
        PathBuf::from(r"C:\Temp\你好\clip.mp4")
    } else {
        PathBuf::from("/tmp/\u{4f60}\u{597d}/clip.mp4")
    };

    let url = encoding::path_to_file_url(&path);

    if cfg!(windows) {
        assert_eq!(url, "file:///C:/Temp/%E4%BD%A0%E5%A5%BD/clip.mp4");
    } else {
        assert_eq!(url, "file:///tmp/%E4%BD%A0%E5%A5%BD/clip.mp4");
    }
}
