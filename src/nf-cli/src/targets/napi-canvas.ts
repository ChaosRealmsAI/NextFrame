// napi-canvas render target — renders a timeline frame to PNG bytes using @napi-rs/canvas.
import { renderAt } from "nf-core/engine/render.js";
import type { Timeline } from "nf-core/types.js";

interface RenderFrameOpts {
  width?: number;
  height?: number;
}

type RenderFrameResult =
  | { ok: true; value: Buffer }
  | { ok: false; error: { code: string; message: string } };

export function renderFramePNG(timeline: Timeline, t: number, opts: RenderFrameOpts = {}): RenderFrameResult {
  const r = renderAt(timeline, t, opts) as Record<string, unknown>;
  if (!r.ok) {
    return { ok: false, error: r.error as { code: string; message: string } };
  }
  try {
    const canvas = r.canvas as { toBuffer(format: string): Buffer };
    const pngBuffer = canvas.toBuffer("image/png");
    return { ok: true, value: pngBuffer };
  } finally {
    if (typeof r.release === "function") (r.release as () => void)();
  }
}
