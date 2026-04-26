use nf_agent::Message;
use serde_json::{Value, json};

use super::{MAX_LLM_ATTEMPTS, TimelineWord};

pub(super) fn cue_messages(
    words: &[TimelineWord],
    max_chars: usize,
    min_pause_ms: u64,
    attempt: usize,
    last_error: Option<&str>,
) -> Vec<Message> {
    let user = cue_user_prompt(
        prompt_stream(words),
        max_chars,
        min_pause_ms,
        attempt,
        retry_note(last_error),
    );
    vec![
        Message::system("你是视频字幕 cue 切分器。只输出严格 JSON。"),
        Message::user(user),
    ]
}

fn prompt_stream(words: &[TimelineWord]) -> Value {
    Value::Array(
        words
            .iter()
            .map(|word| {
                json!({
                    "i": word.i,
                    "text": word.text,
                    "start_ms": word.start_ms,
                    "end_ms": word.end_ms,
                })
            })
            .collect(),
    )
}

fn retry_note(last_error: Option<&str>) -> String {
    last_error
        .map(|err| {
            format!(
                "\n上一次输出不合格: {err}\n这次只允许返回一个 JSON object, 不要 markdown, 不要解释, 不要丢字、重叠或超过字数。"
            )
        })
        .unwrap_or_default()
}

fn cue_user_prompt(
    stream: Value,
    max_chars: usize,
    min_pause_ms: u64,
    attempt: usize,
    retry: String,
) -> String {
    format!(
        r#"把下面 vox word-level timeline 切成 cue list。

三准则:
1. 语义完整: 一句话讲完一件事, 不在动词中切。
2. 屏幕能装: 每条 cue 的中文/可见字数 <= {max_chars}, 一行约占 viewport 80% 以内。
3. 停顿对齐: cue 切点尽量选相邻 word 间隔 >= {min_pause_ms}ms 的自然停顿。

严格返回这个 JSON schema, 不要多余文字:
{{"cues":[{{"text":"...", "start_ms":0, "end_ms":1200, "words":[{{"i":0,"text":"字","start_ms":0,"end_ms":120}}]}}]}}

要求:
- words 必须按输入 i 连续覆盖 0..N-1, 不重复不漏字。
- 每条 cue 的 start_ms 等于第一 word.start_ms, end_ms 等于最后 word.end_ms。
- text 可以为可读性加入空格, 但去掉空白后必须等于 words.text 拼接。

示例输入:
[{{"i":0,"text":"现","start_ms":0,"end_ms":120}},{{"i":1,"text":"在","start_ms":120,"end_ms":240}},{{"i":2,"text":"AI","start_ms":500,"end_ms":720}},{{"i":3,"text":"出","start_ms":720,"end_ms":860}}]
示例输出:
{{"cues":[{{"text":"现在", "start_ms":0, "end_ms":240, "words":[{{"i":0,"text":"现","start_ms":0,"end_ms":120}},{{"i":1,"text":"在","start_ms":120,"end_ms":240}}]}},{{"text":"AI 出", "start_ms":500, "end_ms":860, "words":[{{"i":2,"text":"AI","start_ms":500,"end_ms":720}},{{"i":3,"text":"出","start_ms":720,"end_ms":860}}]}}]}}

attempt: {attempt}/{MAX_LLM_ATTEMPTS}{retry}
word_stream:
{stream}"#
    )
}
