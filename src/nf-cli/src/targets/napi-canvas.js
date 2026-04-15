// napi-canvas render target — renders a timeline frame to PNG bytes using @napi-rs/canvas.
import { renderAt } from "nf-core/engine/render.js";
import { ensureCanvasFonts } from "../lib/canvas-factory.js";
ensureCanvasFonts();
export function renderFramePNG(timeline, t, opts = {}) {
    const r = renderAt(timeline, t, opts);
    if (!r.ok) {
        return { ok: false, error: r.error };
    }
    try {
        const canvas = r.canvas;
        const pngBuffer = canvas.toBuffer("image/png");
        return { ok: true, value: pngBuffer };
    }
    finally {
        if (typeof r.release === "function")
            r.release();
    }
}
