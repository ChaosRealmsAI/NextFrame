use crate::backend::SynthParams;

/// Build SSML string for Edge TTS.
pub fn build_ssml(text: &str, params: &SynthParams) -> String {
    let escaped = escape_xml(text);
    format!(
        "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>\
         <voice name='{}'>\
         <prosody pitch='{}' rate='{}' volume='{}'>\
         {}\
         </prosody>\
         </voice>\
         </speak>",
        params.voice, params.pitch, params.rate, params.volume, escaped
    )
}

/// Escape XML special characters.
fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn escaped_char_len(c: char) -> usize {
    match c {
        '&' => "&amp;".len(),
        '<' => "&lt;".len(),
        '>' => "&gt;".len(),
        '"' => "&quot;".len(),
        '\'' => "&apos;".len(),
        _ => c.len_utf8(),
    }
}

fn escaped_len(s: &str) -> usize {
    s.chars().map(escaped_char_len).sum()
}

/// Remove characters incompatible with the TTS service.
pub fn clean_text(s: &str) -> String {
    s.chars()
        .map(|c| {
            let code = c as u32;
            if (0..=8).contains(&code) || (11..=12).contains(&code) || (14..=31).contains(&code) {
                ' '
            } else {
                c
            }
        })
        .collect()
}

/// Split text into chunks that fit within the byte limit.
/// Splits at newlines or spaces, respecting UTF-8 and the escaped byte limit.
pub fn split_text(text: &str, max_bytes: usize) -> Vec<String> {
    let text = clean_text(text);

    if escaped_len(&text) <= max_bytes {
        return vec![text];
    }

    let mut chunks = Vec::new();
    let mut remaining = text.as_str();

    while !remaining.is_empty() {
        let mut split_at = 0;
        let mut last_break = None;
        let mut used_bytes = 0;

        for (index, ch) in remaining.char_indices() {
            let ch_len = escaped_char_len(ch);
            if used_bytes + ch_len > max_bytes {
                break;
            }

            used_bytes += ch_len;
            split_at = index + ch.len_utf8();
            if ch == '\n' || ch == ' ' {
                last_break = Some(index);
            }
        }

        if split_at == 0 {
            if let Some(first) = remaining.chars().next() {
                split_at = first.len_utf8();
            }
        }

        if let Some(break_index) = last_break {
            split_at = break_index;
        }

        if split_at == 0 {
            split_at = remaining.chars().next().map(char::len_utf8).unwrap_or(0);
        }

        let chunk = remaining[..split_at].trim().to_string();
        if !chunk.is_empty() {
            chunks.push(chunk);
        }
        remaining = remaining[split_at..].trim_start();
    }

    chunks
}

#[cfg(test)]
mod tests {
    use super::{build_ssml, escaped_len, split_text};
    use crate::backend::SynthParams;

    fn params() -> SynthParams {
        SynthParams {
            voice: "en-US-TestVoice".to_string(),
            rate: "+0%".to_string(),
            volume: "+0%".to_string(),
            pitch: "+0Hz".to_string(),
            emotion: None,
            emotion_scale: None,
            speech_rate: None,
            loudness_rate: None,
            volc_pitch: None,
            context_text: None,
            dialect: None,
        }
    }

    #[test]
    fn build_ssml_escapes_text_once() {
        let ssml = build_ssml("AT&T <tag> 'quote' \"double\"", &params());

        assert!(ssml.contains("AT&amp;T &lt;tag&gt; &apos;quote&apos; &quot;double&quot;"));
        assert!(!ssml.contains("&amp;amp;"));
        assert!(!ssml.contains("&amp;lt;"));
    }

    #[test]
    fn split_text_tracks_escaped_size_without_preescaping_chunks() {
        let chunks = split_text("A & B", 5);

        assert_eq!(chunks, vec!["A", "&", "B"]);
        assert!(chunks.iter().all(|chunk| escaped_len(chunk) <= 5));
        assert!(chunks.iter().all(|chunk| !chunk.contains("&amp;")));
    }
}
