pub const HDR10_MASTERING_DISPLAY_BYTES: [u8; 24] = [
    0x34, 0x2f, 0x39, 0x83, 0x1a, 0x85, 0x0f, 0xb7, 0x08, 0x98, 0x39, 0x83, 0x0f, 0xa0, 0x10, 0x27,
    0x00, 0x0f, 0x42, 0x40, 0x00, 0x00, 0x00, 0x01,
];

pub const HDR10_CONTENT_LIGHT_BYTES: [u8; 4] = [0x03, 0xe8, 0x01, 0x90];

pub fn prepend_hdr10_prefix_sei(sample_data: &[u8]) -> Vec<u8> {
    let sei = build_hdr10_sei_nalu();
    let mut data = Vec::with_capacity(sample_data.len() + 4 + sei.len());
    data.extend_from_slice(&(sei.len() as u32).to_be_bytes());
    data.extend_from_slice(&sei);
    data.extend_from_slice(sample_data);
    data
}

pub fn build_hdr10_sei_nalu() -> Vec<u8> {
    let mut rbsp = Vec::with_capacity(40);
    append_sei_message(&mut rbsp, 137, &HDR10_MASTERING_DISPLAY_BYTES);
    append_sei_message(&mut rbsp, 144, &HDR10_CONTENT_LIGHT_BYTES);
    rbsp.push(0x80);

    let mut nalu = Vec::with_capacity(rbsp.len() + 8);
    nalu.extend_from_slice(&[0x4e, 0x01]);
    let mut consecutive_zeroes = 0usize;
    for byte in rbsp {
        if consecutive_zeroes >= 2 && byte <= 0x03 {
            nalu.push(0x03);
            consecutive_zeroes = 0;
        }
        nalu.push(byte);
        consecutive_zeroes = if byte == 0 { consecutive_zeroes + 1 } else { 0 };
    }
    nalu
}

fn append_sei_message(buffer: &mut Vec<u8>, payload_type: u16, payload: &[u8]) {
    append_sei_value(buffer, payload_type);
    append_sei_value(buffer, payload.len() as u16);
    buffer.extend_from_slice(payload);
}

fn append_sei_value(buffer: &mut Vec<u8>, mut value: u16) {
    while value >= 0xff {
        buffer.push(0xff);
        value -= 0xff;
    }
    buffer.push(value as u8);
}
