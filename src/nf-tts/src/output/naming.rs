pub fn sequential_name(id: usize) -> String {
    format!("{id:03}.mp3")
}

pub fn hash_name(text: &str, voice: &str, rate: &str, pitch: &str, volume: &str) -> String {
    let input = format!("{text}\0{voice}\0{rate}\0{pitch}\0{volume}");
    let hash = blake3::hash(input.as_bytes());
    let bytes = hash.as_bytes();
    format!("{:02x}{:02x}{:02x}.mp3", bytes[0], bytes[1], bytes[2])
}
