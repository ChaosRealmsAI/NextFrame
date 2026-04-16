//! voice language heuristics
use crate::backend::DEFAULT_VOICE;

/// Auto-detect voice for volcengine backend.
pub fn auto_detect_voice_volcengine(text: &str) -> &'static str {
    let mut cjk = 0u32;
    let mut total = 0u32;
    for ch in text.chars() {
        if !ch.is_alphabetic() {
            continue;
        }
        total += 1;
        if (0x4E00..=0x9FFF).contains(&(ch as u32)) {
            cjk += 1;
        }
    }
    if total > 0 && cjk * 100 / total > 30 {
        crate::backend::volcengine::DEFAULT_VOICE
    } else {
        "en_female_sarah_conversation_bigtts"
    }
}

/// Detect the dominant language of text and return a suggested voice.
pub fn auto_detect_voice(text: &str) -> &'static str {
    let mut cjk = 0u32;
    let mut jp_only = 0u32;
    let mut kr_only = 0u32;
    let mut total = 0u32;

    for ch in text.chars() {
        if !ch.is_alphabetic() {
            continue;
        }
        total += 1;
        match ch as u32 {
            // CJK Unified Ideographs (shared by Chinese/Japanese/Korean)
            0x4E00..=0x9FFF => cjk += 1,
            // Hiragana + Katakana -> Japanese
            0x3040..=0x30FF => jp_only += 1,
            // Hangul -> Korean
            0xAC00..=0xD7AF | 0x1100..=0x11FF => kr_only += 1,
            _ => {}
        }
    }

    if total == 0 {
        return DEFAULT_VOICE;
    }

    if jp_only > 0 {
        return "ja-JP-NanamiNeural";
    }
    if kr_only > 0 {
        return "ko-KR-SunHiNeural";
    }
    if cjk * 100 / total > 30 {
        return "zh-CN-YunxiNeural";
    }

    DEFAULT_VOICE
}
