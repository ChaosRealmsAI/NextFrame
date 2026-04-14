# TTS / 语音克隆 / 音频工具全景调研

> 面向 NextFrame `nf-tts` 模块的竞品分析。  
> 更新时间：2026-04-14

---

## 一、当前 nf-tts 架构速览

`nf-tts` 是 NextFrame 的 Rust TTS CLI，当前已支持：
- **两个后端**：Edge TTS（免费，微软 Edge 语音服务）+ 火山引擎（情感控制、方言、中文）
- **Word-level timestamps**：`WordBoundary` 结构体，offset_ms + duration_ms
- **强制对齐**：Whisper aligner 做 forced alignment，生成 SRT / timeline 文件
- **批量合成 + 队列调度**：支持并发任务

---

## 二、开源模型

### 1. GPT-SoVITS
| 项目 | 详情 |
|------|------|
| GitHub | [RVC-Boss/GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) |
| Stars | **56.6k** |
| 语言支持 | 中文、英文、日文、韩文、粤语 |
| 声音克隆 | ✅ 1 分钟音频即可训练，5 秒即可 zero-shot |
| 情感控制 | 有限（依赖参考音频） |
| 字级时间戳 | ❌ 不原生支持 |
| 协议 | MIT |
| 质量评级 | ⭐⭐⭐⭐⭐ |
| 说明 | 国内最流行声音克隆工具，GPT 理解语义 + SoVITS 生成音频。v4 版 RTF=0.014（4090）。中文效果极强，跨语言克隆稳定。 |

---

### 2. Coqui TTS（含 XTTS-v2）
| 项目 | 详情 |
|------|------|
| GitHub | [coqui-ai/TTS](https://github.com/coqui-ai/TTS) |
| Stars | **45.1k** |
| 语言支持 | 1100+ 语言（Fairseq），XTTS-v2 支持 17 种 |
| 声音克隆 | ✅ 6 秒参考音频即可克隆 |
| 情感控制 | 有限 |
| 字级时间戳 | ❌ |
| 协议 | MPL-2.0；XTTS-v2 模型权重仅限非商用 |
| 质量评级 | ⭐⭐⭐⭐ |
| 说明 | HuggingFace 最多下载的 TTS 模型，生态完整。公司已解散，但仓库活跃度高，社区维护中。 |

---

### 3. Bark
| 项目 | 详情 |
|------|------|
| GitHub | [suno-ai/bark](https://github.com/suno-ai/bark) |
| Stars | **39.1k** |
| 语言支持 | 13 种，含中文（简体）、日文、德法西等 |
| 声音克隆 | ✅（无约束声音克隆，100+ 预设音色） |
| 情感控制 | ✅ 可生成笑声、叹气、非语音音效、音乐 |
| 字级时间戳 | ❌ |
| 协议 | MIT（2023.5 起商用开放） |
| 质量评级 | ⭐⭐⭐⭐ |
| 说明 | Transformer-based 全生成模型，能生成音效、音乐、非语音内容。速度较慢，不适合实时场景。中文质量一般。 |

---

### 4. ChatTTS
| 项目 | 详情 |
|------|------|
| GitHub | [2noise/ChatTTS](https://github.com/2noise/ChatTTS) |
| Stars | **38.4k** |
| 语言支持 | 中文、英文（10 万小时训练数据） |
| 声音克隆 | 有限 |
| 情感控制 | ✅ Token 级控制笑声、停顿，极自然 |
| 字级时间戳 | ❌ |
| 协议 | 非商用限制 |
| 质量评级 | ⭐⭐⭐⭐⭐（中文语气最自然） |
| 说明 | 专为日常对话设计，中文语气/停顿/笑声控制业界最强。稳定性稍差，长文本生成偶有漂移。对 NextFrame 中文配音极有吸引力。 |

---

### 5. F5-TTS
| 项目 | 详情 |
|------|------|
| GitHub | [SWivid/F5-TTS](https://github.com/SWivid/F5-TTS) |
| Stars | **14.3k** |
| 语言支持 | 中文、英文为主（含 Emilia 中英数据集） |
| 声音克隆 | ✅ Flow Matching 扩散架构，零样本克隆 |
| 情感控制 | 有限 |
| 字级时间戳 | ❌ |
| 协议 | CC BY-NC-SA 4.0（非商用） |
| 质量评级 | ⭐⭐⭐⭐⭐ |
| 说明 | 2025 年最佳综合评分之一，质量与可控性平衡最好。速度快（<7s），扩散模型推理精准。 |

---

### 6. Fish Speech
| 项目 | 详情 |
|------|------|
| GitHub | [fishaudio/fish-speech](https://github.com/fishaudio/fish-speech) |
| Stars | **29.4k** |
| 语言支持 | 80+ 语言，Tier1：日文、英文、中文 |
| 声音克隆 | ✅ 10-30 秒参考音频，Dual-Autoregressive 架构 |
| 情感控制 | ✅ 自然语言标签（15,000+ 情感标签） |
| 字级时间戳 | ❌ |
| 协议 | CC BY-NC-SA 4.0；商用需联系授权 |
| 质量评级 | ⭐⭐⭐⭐⭐ |
| 说明 | 1000 万小时训练，4B 参数解码器。情感标签丰富度业界最强，群组策略优化（GRPO）。2025 年综合质量 Top 3。 |

---

### 7. CosyVoice 2 / 3
| 项目 | 详情 |
|------|------|
| GitHub | [FunAudioLLM/CosyVoice](https://github.com/FunAudioLLM/CosyVoice) |
| Stars | **20.6k** |
| 出品 | 阿里巴巴 FunAudioLLM |
| 语言支持 | 9 种主要语言 + 18+ 中文方言 |
| 声音克隆 | ✅ Zero-shot 多语言克隆 |
| 情感控制 | ✅ 指令控制（语言/方言/情感/语速/音量） |
| 字级时间戳 | ❌（有 Pinyin 发音控制） |
| 协议 | Apache-2.0 |
| 质量评级 | ⭐⭐⭐⭐⭐ |
| 说明 | 国内最强多语言开源 TTS，150ms 低延迟流式，方言覆盖极全（东北话/四川话/粤语等）。2025 年出 v3，加入强化学习优化。对 NextFrame 中文配音价值极高。 |

---

### 8. IndexTTS（Bilibili）
| 项目 | 详情 |
|------|------|
| GitHub | [index-tts/index-tts](https://github.com/index-tts/index-tts) |
| Stars | **20k** |
| 出品 | Bilibili |
| 语言支持 | 中文、英文（含拼音精确控制） |
| 声音克隆 | ✅ Zero-shot 工业级声音克隆 |
| 情感控制 | ✅ 参考音频/向量/文本三种情感控制方式，说话人与情感解耦 |
| 字级时间戳 | ✅ 支持时长精确控制（explicit token 或自由生成） |
| 协议 | 需查阅（有 LICENSE_ZH.txt） |
| 质量评级 | ⭐⭐⭐⭐⭐ |
| 说明 | B 站出品，工业级质量。IndexTTS-2 情感/时长控制最精准，WER/说话人相似度/情感真实度全面超越同期模型。**对视频配音场景价值最高**。 |

---

### 9. Chatterbox（Resemble AI）
| 项目 | 详情 |
|------|------|
| GitHub | [resemble-ai/chatterbox](https://github.com/resemble-ai/chatterbox) |
| Stars | **24.3k** |
| 语言支持 | Turbo 版仅英文；Multilingual 版 23+ 语言（含中文） |
| 声音克隆 | ✅ Zero-shot |
| 情感控制 | ✅ 情感夸张度拨盘（开源模型中首创）+ 拟语音标签 `[laugh]` `[cough]` |
| 字级时间戳 | ❌ |
| 协议 | MIT |
| 质量评级 | ⭐⭐⭐⭐ |
| 说明 | HuggingFace 百万次下载，带 Perth 水印（负责任 AI）。350M 参数，低延迟适合语音 agent。情感夸张控制是亮点。 |

---

### 10. Higgs Audio V2（Boson AI）
| 项目 | 详情 |
|------|------|
| GitHub | [boson-ai/higgs-audio](https://github.com/boson-ai/higgs-audio) |
| Stars | **8k** |
| 语言支持 | 多语言，含中文 |
| 声音克隆 | ✅ Zero-shot + 多说话人对话生成 |
| 情感控制 | ✅ 自然语言描述情感 |
| 字级时间戳 | ❌ |
| 协议 | Apache-2.0 |
| 质量评级 | ⭐⭐⭐⭐ |
| 说明 | 1000 万小时音频训练，v2.5 压缩至 1B 参数仍超 3B 版精度。支持哼歌克隆、同步背景音乐生成。2025 HuggingFace 最热 TTS 之一。 |

---

### 11. MeloTTS（MyShell.ai）
| 项目 | 详情 |
|------|------|
| GitHub | [myshell-ai/MeloTTS](https://github.com/myshell-ai/MeloTTS) |
| Stars | **7.3k** |
| 语言支持 | 英文（美/英/印/澳）、西班牙、法文、中文（含混合英文）、日文、韩文 |
| 声音克隆 | ❌ |
| 情感控制 | ❌ |
| 字级时间戳 | ❌ |
| 协议 | MIT（商用免费） |
| 质量评级 | ⭐⭐⭐ |
| 说明 | CPU 实时推理，极轻量，基于 VITS/VITS2/Bert-VITS2。适合嵌入低功耗设备或快速原型。中文混合英文朗读自然。 |

---

### 12. Kokoro-82M
| 项目 | 详情 |
|------|------|
| GitHub | [hexgrad/kokoro](https://github.com/hexgrad/kokoro) |
| Stars | **6.5k** |
| 语言支持 | 英文（美/英）、西班牙、法文、印地、意大利、日文、葡萄牙、普通话 |
| 声音克隆 | ❌ |
| 情感控制 | 有限 |
| 字级时间戳 | ❌ |
| 协议 | Apache-2.0 |
| 质量评级 | ⭐⭐⭐⭐ |
| 说明 | 82M 参数最轻量高质模型，<0.3s 推理速度冠军。基于 StyleTTS 2 架构。有 kokoro.js 在浏览器跑，还有 Kokoros（Rust 版）。适合对延迟要求极高的场景。 |

---

### 13. Piper TTS
| 项目 | 详情 |
|------|------|
| GitHub | [rhasspy/piper](https://github.com/rhasspy/piper)（已归档，新版 [OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl)） |
| Stars | **10.8k** |
| 语言支持 | 20+ 语言（ONNX 导出 VITS，支持中文等） |
| 声音克隆 | ❌ |
| 情感控制 | ❌ |
| 字级时间戳 | ❌ |
| 协议 | MIT（旧版）；新版 GPL |
| 质量评级 | ⭐⭐⭐ |
| 说明 | 完全离线，低功耗设备（树莓派）可用。ONNX 推理极快。原始仓库 2025.10 归档，社区以 GPL 继续维护。 |

---

## 三、云 API 服务

### 14. Edge TTS（微软）
| 项目 | 详情 |
|------|------|
| 非官方 Python 封装 | [rany2/edge-tts](https://github.com/rany2/edge-tts)，**10.6k stars** |
| 语言支持 | 140+ 语言，中文极全（普通话/粤语/闽南/方言多音色） |
| 声音克隆 | ❌ |
| 情感控制 | SSML 有限支持 |
| 字级时间戳 | ✅（`--write-subtitles` SRT 输出） |
| 费用 | **完全免费**（调微软 Edge 服务，无需 API key） |
| 协议 | 非官方工具 GPL-3.0 |
| 质量评级 | ⭐⭐⭐⭐ |
| 说明 | nf-tts 当前主要免费后端。中文音色 500+ 个，免费无限额，WebSocket 流式。是面向预算有限用户的最优方案。 |

---

### 15. 火山引擎 TTS / 豆包语音（字节跳动）
| 项目 | 详情 |
|------|------|
| 官网 | [volcengine.com/docs/6561](https://www.volcengine.com/docs/6561/1257584) |
| 语言支持 | 中文（全方言）、英文、日文等 |
| 声音克隆 | ✅ 声音复刻 API，38元/个（201-2000 梯度） |
| 情感控制 | ✅ 情感分类（happy/angry/sad/surprise 等 11 种）+ 强度 1-5 |
| 字级时间戳 | ✅ 响应体含 `words` 数组，start_time/end_time |
| 费用 | 新用户赠送免费额度；大模型 TTS 按 token 计费 |
| 质量评级 | ⭐⭐⭐⭐⭐ |
| 说明 | nf-tts 当前中文高质后端。首包延迟 0.3s，豆包大模型 TTS 可根据上下文自动预测情感。方言覆盖（东北/陕西/四川）、声音复刻完善。 |

---

### 16. ElevenLabs
| 项目 | 详情 |
|------|------|
| 官网 | [elevenlabs.io](https://elevenlabs.io) |
| 语言支持 | 多语言（中文支持有限） |
| 声音克隆 | ✅ Instant Clone（Starter 起）+ Professional Clone（Creator 起） |
| 情感控制 | ✅ 音频标签 `[laughs]` `[whispers]` + 情感文字提示 |
| 字级时间戳 | ❌ |
| 费用 | 免费 10k 字符/月；Starter $5/月 30k；Creator $22/月 100k；API $0.30/1k chars |
| 质量评级 | ⭐⭐⭐⭐⭐ |
| 说明 | 英文质量业界天花板，情感表现最自然。中文效果相对弱。不支持字级时间戳对视频同步有限制。 |

---

### 17. OpenAI TTS（gpt-4o-mini-tts）
| 项目 | 详情 |
|------|------|
| 官网 | [platform.openai.com](https://platform.openai.com/docs/models/gpt-4o-mini-tts) |
| 语言支持 | 多语言，含中文 |
| 声音克隆 | ❌ |
| 情感控制 | ✅ 自然语言风格提示（cheerful/poetic/business-like 等） |
| 字级时间戳 | ❌ |
| 费用 | 输入 $0.60/1M chars；输出 $12.00/1M audio tokens（约 $0.015/分钟） |
| 质量评级 | ⭐⭐⭐⭐ |
| 说明 | 13 种音色，风格可控，质量稳定。无声音克隆，无字级时间戳，对视频制作场景较局限。 |

---

### 18. Microsoft Azure TTS
| 项目 | 详情 |
|------|------|
| 官网 | [azure.microsoft.com/speech](https://azure.microsoft.com/en-us/pricing/details/speech/) |
| 语言支持 | 140+ 语言 |
| 声音克隆 | ✅ Custom Neural Voice |
| 情感控制 | 有限（SSML） |
| 字级时间戳 | ✅ per-word timestamps（Google 无此功能） |
| 费用 | $15/1M chars（Neural 标准） |
| 质量评级 | ⭐⭐⭐⭐ |
| 说明 | 企业级稳定性，字级时间戳是和 Google 的关键差异。Edge TTS 底层就是 Azure Neural，非官方封装可免费使用。 |

---

### 19. Google Cloud TTS
| 项目 | 详情 |
|------|------|
| 官网 | cloud.google.com/text-to-speech |
| 语言支持 | 50+ 语言 |
| 声音克隆 | ❌ |
| 情感控制 | 有限（SSML） |
| 字级时间戳 | ✅（via SSML `<mark>`） |
| 费用 | $16/1M chars（Wavenet），$4/1M chars（Standard） |
| 质量评级 | ⭐⭐⭐⭐ |
| 说明 | 音质领先业界，SSML 功能完整。无声音克隆，中文支持良好但情感控制弱。 |

---

### 20. Amazon Polly
| 项目 | 详情 |
|------|------|
| 官网 | aws.amazon.com/polly |
| 语言支持 | 29 种语言 |
| 声音克隆 | ❌ |
| 情感控制 | 有限（SSML Newscaster 风格） |
| 字级时间戳 | ✅ Speech Marks（字/音素级，适合口型同步） |
| 费用 | $16/1M chars（Neural） |
| 质量评级 | ⭐⭐⭐⭐ |
| 说明 | AWS 生态友好，字级 + 音素级时间戳是其特色，适合视频字幕同步和 lip-sync 动画。中文不支持。 |

---

### 21. MiniMax TTS
| 项目 | 详情 |
|------|------|
| 官网 | minimax.io |
| 语言支持 | 30+ 语言，中文质量极强 |
| 声音克隆 | ✅（99% 相似度声称） |
| 情感控制 | 有限 |
| 字级时间戳 | ❌ |
| 费用 | $50/1M chars |
| 质量评级 | ⭐⭐⭐⭐ |
| 说明 | 国产 API 服务，中文质量优秀，声音克隆相似度高。定价偏高，适合对中文质量有极高要求的商业场景。 |

---

## 四、横向对比矩阵

| 工具 | Stars | 中文 | 声音克隆 | 情感控制 | 字级时间戳 | 开源/免费 | 质量 |
|------|-------|------|---------|---------|-----------|---------|------|
| GPT-SoVITS | 56.6k | ✅✅ | ✅ | 有限 | ❌ | ✅ MIT | ⭐⭐⭐⭐⭐ |
| Coqui TTS | 45.1k | ✅ | ✅ | 有限 | ❌ | ✅ MPL | ⭐⭐⭐⭐ |
| Bark | 39.1k | ✅ | ✅ | ✅情感音效 | ❌ | ✅ MIT | ⭐⭐⭐⭐ |
| ChatTTS | 38.4k | ✅✅ | 有限 | ✅✅ | ❌ | ⚠️ 非商用 | ⭐⭐⭐⭐⭐ |
| Chatterbox | 24.3k | ✅(多语版) | ✅ | ✅夸张度 | ❌ | ✅ MIT | ⭐⭐⭐⭐ |
| Fish Speech | 29.4k | ✅✅ | ✅ | ✅✅ | ❌ | ⚠️ 非商用 | ⭐⭐⭐⭐⭐ |
| CosyVoice 2/3 | 20.6k | ✅✅方言 | ✅ | ✅指令 | ❌ | ✅ Apache | ⭐⭐⭐⭐⭐ |
| IndexTTS | 20k | ✅✅ | ✅ | ✅✅解耦 | ✅时长控制 | ⚠️ 查协议 | ⭐⭐⭐⭐⭐ |
| F5-TTS | 14.3k | ✅ | ✅ | 有限 | ❌ | ⚠️ 非商用 | ⭐⭐⭐⭐⭐ |
| Piper | 10.8k | ✅ | ❌ | ❌ | ❌ | ✅ MIT | ⭐⭐⭐ |
| Edge TTS | 10.6k | ✅✅ | ❌ | 有限 | ✅SRT | ✅ 完全免费 | ⭐⭐⭐⭐ |
| Higgs Audio V2 | 8k | ✅ | ✅ | ✅ | ❌ | ✅ Apache | ⭐⭐⭐⭐ |
| MeloTTS | 7.3k | ✅混合 | ❌ | ❌ | ❌ | ✅ MIT | ⭐⭐⭐ |
| Kokoro-82M | 6.5k | ✅ | ❌ | 有限 | ❌ | ✅ Apache | ⭐⭐⭐⭐ |
| ElevenLabs | - | ⚠️ 有限 | ✅ | ✅ | ❌ | 💰 $0.30/1k | ⭐⭐⭐⭐⭐ |
| 火山引擎 | - | ✅✅ | ✅ | ✅ | ✅ | 💰 按需计费 | ⭐⭐⭐⭐⭐ |
| OpenAI TTS | - | ✅ | ❌ | ✅风格提示 | ❌ | 💰 $0.015/分钟 | ⭐⭐⭐⭐ |
| Azure TTS | - | ✅✅ | ✅ | 有限 | ✅ | 💰 $15/1M | ⭐⭐⭐⭐ |
| Google TTS | - | ✅ | ❌ | 有限 | ✅ | 💰 $16/1M | ⭐⭐⭐⭐ |
| Amazon Polly | - | ❌ | ❌ | 有限 | ✅音素级 | 💰 $16/1M | ⭐⭐⭐⭐ |
| MiniMax | - | ✅✅ | ✅ | 有限 | ❌ | 💰 $50/1M | ⭐⭐⭐⭐ |

---

## 五、对 nf-tts 的启示

### 当前已做好的
- Edge TTS 后端：免费 + 中文好 + 字级时间戳 ✅
- 火山引擎后端：中文情感 + 声音复刻 + 字级时间戳 ✅
- Whisper forced alignment 补齐无时间戳模型的缺口 ✅
- SRT / timeline 输出 ✅

### 值得考虑加入的后端

| 优先级 | 后端 | 理由 |
|--------|------|------|
| 高 | CosyVoice 2/3（本地） | 开源 Apache，中文方言全面，150ms 低延迟，适合离线用户 |
| 高 | IndexTTS（本地） | Bilibili 出品，时长精确控制 + 情感解耦，视频配音最契合 |
| 中 | GPT-SoVITS（本地） | 56k stars 用户群大，声音克隆需求强，但无字级时间戳需 Whisper 补 |
| 中 | OpenAI TTS API | 最简单的 API 集成，风格提示方便，适合英文配音 |
| 低 | ElevenLabs API | 英文质量最好，但缺字级时间戳，中文弱，价格高 |

### 字级时间戳差距
大多数开源模型（GPT-SoVITS、Fish Speech、CosyVoice 等）**不原生提供字级时间戳**，nf-tts 的 Whisper forced alignment 是正确策略，可以为任何 TTS 后端补充时间戳能力。

### 视频配音核心需求匹配
```
中文质量     → 火山引擎 / CosyVoice / ChatTTS / GPT-SoVITS
声音克隆     → 火山引擎 / GPT-SoVITS / Fish Speech / IndexTTS
情感控制     → 火山引擎 / Fish Speech / ChatTTS / IndexTTS
字级时间戳   → Edge TTS / 火山引擎 / Azure / Amazon Polly (+ Whisper 兜底)
离线本地     → CosyVoice / GPT-SoVITS / IndexTTS / Kokoro / Piper
免费         → Edge TTS（首选）/ Kokoro / MeloTTS / CosyVoice
```

---

*数据来源：GitHub 仓库页面、bentoml.com、siliconflow.com、inferless.com、speechmatics.com、elevenlabs.io、volcengine.com，采集时间 2026-04-14。*
