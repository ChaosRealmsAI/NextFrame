import { spawn } from "node:child_process";
import { once } from "node:events";

export async function muxMP4Audio(videoPath, audioPath, outputPath, opts = {}) {
  const ffmpegArgs = [
    "-y",
    "-i", videoPath,
    "-i", audioPath,
    "-c:v", "copy",
    "-c:a", "aac",
    "-shortest",
    outputPath,
  ];

  try {
    const child = spawn(opts.ffmpegPath || "ffmpeg", ffmpegArgs, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const [exitCode] = await once(child, "close");
    if (exitCode !== 0) {
      return {
        ok: false,
        error: {
          code: "MUX_FAIL",
          message: `ffmpeg exited ${exitCode}`,
          hint: stderr.trim(),
        },
      };
    }
    return { ok: true, value: { outputPath, audioPath } };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "MUX_FAIL",
        message: error.message,
        hint: `ffmpeg ${ffmpegArgs.join(" ")}`,
      },
    };
  }
}
