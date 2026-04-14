/// 分句策略：有换行按换行分（用户手动控制），否则按标点分
pub(super) fn split_sentences(text: &str) -> Vec<String> {
    let lines: Vec<String> = text
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect();
    if lines.len() > 1 {
        return lines;
    }

    let mut sentences = Vec::new();
    let mut current = String::new();
/// 用 ffmpeg 获取精确的 MP3 时长（毫秒）
pub(super) fn get_audio_duration_ms(audio: &[u8]) -> u64 {
    let tmp = std::env::temp_dir().join(format!("vox-dur-{}.mp3", std::process::id()));
    if let Ok(mut file) = std::fs::File::create(&tmp) {
        let _ = file.write_all(audio);
    }

    let output = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "csv=p=0",
            &tmp.to_string_lossy(),
        ])
        .output();

    let _ = std::fs::remove_file(&tmp);

    output
        .ok()
        .and_then(|command| String::from_utf8(command.stdout).ok())
        .and_then(|stdout| stdout.trim().parse::<f64>().ok())
        .map(|secs| (secs * 1000.0) as u64)
        .unwrap_or_else(|| (audio.len() as u64) * 1000 / 16000)
}

>>>>>>> wt-fix-tts-bb31c753
    let tmp = std::env::temp_dir().join(format!("vox-sil-{}.mp3", std::process::id()));
    {
        let mut file = std::fs::File::create(&tmp)?;
        file.write_all(audio)?;
    }

    let output = Command::new("ffmpeg")
        .args([
            "-i",
            &tmp.to_string_lossy(),
            "-af",
            "silencedetect=noise=-30dB:d=0.2",
            "-f",
            "null",
            "-",
        ])
        .output();

    let _ = std::fs::remove_file(&tmp);

    let output = output?;
    let stderr = String::from_utf8_lossy(&output.stderr);
<<<<<<< HEAD
    let mut starts = Vec::new();
    let mut ends = Vec::new();
    for line in stderr.lines() {
        if let Some(pos) = line.find("silence_start: ") {
            if let Ok(value) = line[pos + "silence_start: ".len()..].trim().parse::<f64>() {
                starts.push(value);
            }
        }
        if let Some(pos) = line.find("silence_end: ") {
            if let Some(value) = line[pos + "silence_end: ".len()..]
                .split_whitespace()
                .next()
            {
=======

    let mut starts = Vec::new();
    let mut ends = Vec::new();
    for line in stderr.lines() {
        if let Some(position) = line.find("silence_start: ") {
            let value = &line[position + "silence_start: ".len()..];
            if let Ok(value) = value.trim().parse::<f64>() {
                starts.push(value);
            }
        }
        if let Some(position) = line.find("silence_end: ") {
            let value = &line[position + "silence_end: ".len()..];
            if let Some(value) = value.split_whitespace().next() {
                if let Ok(value) = value.parse::<f64>() {
                    ends.push(value);
                }
            }
        }
    }

    let all_silences: Vec<(u64, u64)> = starts
        .iter()
        .zip(ends.iter())
        .filter_map(|(&start, &end)| {
            let start_ms = (start * 1000.0) as u64;
            let end_ms = (end * 1000.0) as u64;
            if start_ms > 200 {
                Some((start_ms, end_ms))
            } else {
                None
            }
        })
        .collect();

    let total_ms = get_audio_duration_ms(audio);
    let needed = sentences.len().saturating_sub(1);
    let total_chars: usize = sentences
        .iter()
        .map(|sentence| sentence.chars().count())
        .sum();

    let mut expected_ends = Vec::new();
    let mut cumulative_chars = 0usize;
    for (index, sentence) in sentences.iter().enumerate() {
        cumulative_chars += sentence.chars().count();
        if index < sentences.len() - 1 {
            let ratio = cumulative_chars as f64 / total_chars as f64;
            expected_ends.push((ratio * total_ms as f64) as u64);
        }
    }

    let mut used = vec![false; all_silences.len()];
    let mut matched = Vec::new();

    for expected in &expected_ends {
        let mut best_idx = None;
        let mut best_dist = u64::MAX;
        for (index, &(start_ms, _)) in all_silences.iter().enumerate() {
            if used[index] {
                continue;
            }

            let distance = start_ms.abs_diff(*expected);
            if distance < best_dist {
                best_dist = distance;
                best_idx = Some(index);
            }
        }

        if let Some(index) = best_idx {
            used[index] = true;
            matched.push(all_silences[index]);
        }
    }

    matched.sort_by_key(|pair| pair.0);
    matched.truncate(needed);

    let mut boundaries = Vec::new();
    let mut cursor_ms = 0u64;
    for (index, sentence) in sentences.iter().enumerate() {
        let end_ms = if index < matched.len() {
            matched[index].0
        } else {
            total_ms
        };

        boundaries.push(WordBoundary {
            text: sentence.clone(),
            offset_ms: cursor_ms,
            duration_ms: end_ms.saturating_sub(cursor_ms),
        });

        if index < matched.len() {
            cursor_ms = matched[index].1;
        }
    }

    Ok(boundaries)
}
