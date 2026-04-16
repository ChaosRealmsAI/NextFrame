// Audio mux for v0.8 pipeline: reads audiometa sidecar, composes ffmpeg
// filter_complex (atrim + afade + volume + pan + adelay + amix), muxes into
// the recorder's video-only mp4. See POC spec/poc/v10-closed-loop/gap2-audio-ffmpeg-filter/
// for the validated filter graph; the key invariant is `afade st=` is post-trim
// local time, not source-absolute.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { guarded } from "../lib/guard.js";

export interface AudioMetaClip {
  trackId: string;
  clipIndex: number;
  src: string;
  beginMs: number;
  endMs: number;
  srcInMs: number;
  srcOutMs: number | null;
  fadeInMs: number;
  fadeOutMs: number;
  volume: number;
  pan: number;
}

type MuxResult =
  | { ok: true; value: { outputPath: string } }
  | { ok: false; error: { code: string; message: string; hint?: string } };

function fmt(value: number): string {
  // Round to 6 decimals to keep filter_complex human-readable and avoid float
  // noise turning "0" into "0.00000000001" which some ffmpeg parsers trip on.
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded.toString();
}

export function buildFilterComplex(clips: AudioMetaClip[]): {
  filter: string;
  finalLabel: string;
  hasClips: boolean;
} {
  if (clips.length === 0) return { filter: "", finalLabel: "", hasClips: false };

  const chains: string[] = [];
  const mixInputs: string[] = [];

  clips.forEach((clip, i) => {
    const srcInS = clip.srcInMs / 1000;
    const srcOutS = clip.srcOutMs !== null
      ? clip.srcOutMs / 1000
      : srcInS + Math.max(0, (clip.endMs - clip.beginMs) / 1000);
    const clipDurS = Math.max(0, srcOutS - srcInS);
    const fadeInS = Math.min(clip.fadeInMs / 1000, clipDurS);
    const fadeOutS = Math.min(clip.fadeOutMs / 1000, clipDurS);
    const fadeOutStartS = Math.max(0, clipDurS - fadeOutS);
    const delayMs = Math.max(0, Math.round(clip.beginMs));

    // The audio input index in ffmpeg is 1+i because input 0 is the video mp4.
    // Filter chain syntax: [input_pad]filter1,filter2,...[output_pad]
    // — no comma between input pad and first filter, no comma before output pad.
    const filters: string[] = [];
    filters.push(`atrim=start=${fmt(srcInS)}:end=${fmt(srcOutS)}`);
    filters.push("asetpts=PTS-STARTPTS");
    if (fadeInS > 0) filters.push(`afade=t=in:st=0:d=${fmt(fadeInS)}`);
    if (fadeOutS > 0) filters.push(`afade=t=out:st=${fmt(fadeOutStartS)}:d=${fmt(fadeOutS)}`);
    if (clip.volume !== 1) filters.push(`volume=${fmt(clip.volume)}`);

    // pan: normalize mono-or-stereo source to stereo with energy redistributed.
    // pan in [-1, 1]; 0 = center, -1 = full left, +1 = full right. Use linear
    // mixing against input channel 0 only (safer for mono mp3 sources).
    if (clip.pan !== 0) {
      const p = Math.max(-1, Math.min(1, clip.pan));
      const left = fmt(Math.max(0, 1 - Math.max(0, p)));
      const right = fmt(Math.max(0, 1 + Math.min(0, p)));
      filters.push(`pan=stereo|c0=${left}*c0|c1=${right}*c0`);
    } else {
      // Always materialize stereo so amix of heterogeneous layouts does not fail.
      filters.push("pan=stereo|c0=c0|c1=c0");
    }
    // adelay shifts the clip to its timeline begin.
    if (delayMs > 0) filters.push(`adelay=${delayMs}|${delayMs}:all=1`);
    chains.push(`[${i + 1}:a]${filters.join(",")}[clip${i}]`);
    mixInputs.push(`[clip${i}]`);
  });

  let finalLabel: string;
  if (mixInputs.length === 1) {
    finalLabel = mixInputs[0].slice(1, -1); // strip brackets
    return { filter: chains.join(";"), finalLabel, hasClips: true };
  }

  finalLabel = "mixout";
  const mix = `${mixInputs.join("")}amix=inputs=${mixInputs.length}:normalize=0[${finalLabel}]`;
  return { filter: `${chains.join(";")};${mix}`, finalLabel, hasClips: true };
}

export async function readAudioMeta(sidecarPath: string): Promise<AudioMetaClip[] | null> {
  try {
    const text = await readFile(sidecarPath, "utf8");
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed as AudioMetaClip[] : null;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function muxAudioTracksToMp4(
  videoPath: string,
  audioMeta: AudioMetaClip[],
  outputPath: string,
  opts: { ffmpegPath?: string } = {},
): Promise<MuxResult> {
  const ffmpegPath = opts.ffmpegPath || "ffmpeg";
  const graph = buildFilterComplex(audioMeta);
  if (!graph.hasClips) {
    const r: MuxResult = { ok: false, error: { code: "AUDIO_META_EMPTY", message: "no audio clips to mux" } };
    guarded("muxAudioTracksToMp4", r as unknown as Record<string, unknown>);
    return r;
  }

  const args: string[] = ["-y", "-i", videoPath];
  for (const clip of audioMeta) args.push("-i", clip.src);
  args.push(
    "-filter_complex", graph.filter,
    "-map", "0:v",
    "-map", `[${graph.finalLabel}]`,
    "-c:v", "copy",
    "-c:a", "aac",
    "-ar", "44100",
    "-ac", "2",
    outputPath,
  );

  let child;
  try {
    child = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
  } catch (err: unknown) {
    const r: MuxResult = {
      ok: false,
      error: {
        code: "AUDIO_MUX_SPAWN",
        message: (err as Error).message,
        hint: `ffmpeg ${args.slice(0, 4).join(" ")} ...`,
      },
    };
    guarded("muxAudioTracksToMp4", r as unknown as Record<string, unknown>);
    return r;
  }

  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });

  const [exitCode] = await once(child, "close");
  if (exitCode !== 0) {
    const r: MuxResult = {
      ok: false,
      error: {
        code: "AUDIO_MUX_FAIL",
        message: `ffmpeg exited ${exitCode}`,
        hint: stderr.split("\n").slice(-8).join("\n"),
      },
    };
    guarded("muxAudioTracksToMp4", r as unknown as Record<string, unknown>);
    return r;
  }

  const r: MuxResult = { ok: true, value: { outputPath } };
  guarded("muxAudioTracksToMp4", r as unknown as Record<string, unknown>);
  return r;
}
