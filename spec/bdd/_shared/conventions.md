# BDD 书写约定 · 跨 feature 统一

## 术语

- **subagent haiku** = Claude Code Agent tool · model="haiku-4-5-20251001" · 盲测弱模型读 prompt 能否干出可用品
- **主 agent** = 本会话的 opus 4.7 · 调度者 · 亲验产物
- **产物** = 输出文件(mp4 / mp3 / html / json) · PM 肉眼可验
- **链** = 从输入到产物的一组 CLI 调用序列(clips 链 · TTS 链)

## steps_human vs steps_ai

- `steps_human`: 人(PM)视角的 Given/When/Then · 用"打开 / 点击 / 看到"等动词 · 关注视觉/交互预期
- `steps_ai`: AI 视角 · 用"调 CLI / 读文件 / 判 exit code"等动词 · 关注可编程验证

## ai_tools 铁律

每 scenario 必 `ai_tools[]` · 列 AI 自己跑验证的**产品内建 CLI**(不用外部 mediainfo/ffprobe/playwright · 按 feedback_product_self_verify_builtin memory)· 例:
- `nf-source verify --file output/highlight-1.mp4` (判可播 · exit 0/1)
- `nf-tts verify --mp3 output/tts.mp3 --timeline output/tts.timeline.json`

## verify_point 关联

每 scenario `verify_point` 关联 `spec/versions/v{X}/kickoff/version-level.json.success_picture` 拆出的验收点 · 一对一.

## 命名

- feature 目录: 小写连字符 · `clips` / `tts` / `editor-timeline`
- scenario id: `{feature}-{N}` · 两位数字 · `clips-01` / `tts-01`
- verify_point: `V-{N}` · `V-1` / `V-2` / `V-3`
