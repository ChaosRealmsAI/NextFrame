# Step 0: 下载源视频

## CLI

```bash
nf-cli source-download <project> <episode> --url <URL> --format 720
```

## 输入

YouTube / Vimeo / TED URL。

## 产出（gate: source-downloaded）

```
<episode>/sources/<slug>/
├── source.mp4
└── meta.json    # {title, url, duration_sec, format, downloaded_at}
```

## 谁做

Code（yt-dlp + ffprobe）。

## 错误

- URL 无效 → 退出码 2
- 网络失败 → 退出码 3，可重试
