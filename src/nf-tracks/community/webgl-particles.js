// src/nf-tracks/community/webgl-particles.js
// Community L2 Track · Canvas 2D 粒子（kind 仍叫 "webgl-particles" 保持 source.json 兼容）
//
// v1.41 简化：WebGL 在 WKWebView 里没跑出来 → 改 Canvas 2D + 修 canvas CSS 尺寸
//   - 旧版 style="width:1920px;height:1080px" 绝对像素导致 canvas 溢出 stage
//   - 新版 position:absolute; inset:0; width:100%; height:100% fit stage
//
// HARD CONSTRAINTS (lint-enforced by scripts/check-abi.mjs · 11 gates):
//   - single-file · zero imports / require / await import
//   - 3 required exports (describe / sample / render) + L2 trio (mount / update / unmount)
//   - render is a PURE function of (t, params, viewport); at t=0 opacity >= 0.9 (FM-T0)
//   - update(el, t, params) is idempotent in t: NO Date.now / Math.random / fetch
//   - describe().name / description (>=20) / use_cases (non-empty string[]) set
//   - level = 2 · mount + update + unmount all exported

export function describe() {
  return {
    id: "webgl-particles",
    kind: "webgl-particles",
    level: 2,
    name: "Particles Track",
    description:
      "Canvas 2D 800 粒子螺旋 · 背景级视觉 · 随 t 旋转 + hue 变色 · L2 生命周期 mount/update/unmount · 适合科技感 hero / 音乐 MV / 创意开场",
    use_cases: ["科技感 hero 背景", "音乐 MV", "创意开场"],
    viewport: "any",
    t0_visibility: 0.95,
    z_order_hint: 1,
    visual_channels: ["background"],
    duration_hint_ms: 10000,
    params: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      additionalProperties: false,
      properties: {
        count: { type: "number", default: 800, minimum: 100, maximum: 5000 },
        hue_base: { type: "number", default: 260, minimum: 0, maximum: 360 },
      },
    },
  };
}

export function sample() {
  return { count: 800, hue_base: 260 };
}

// render · skeleton canvas · FM-T0 opacity 0.95 · 必带 persist + track-id 两属性
// fit stage 用 position:absolute + inset:0 + 100% · 不溢出
export function render(t, params, viewport) {
  const w = (viewport && typeof viewport.w === "number") ? viewport.w : 1920;
  const h = (viewport && typeof viewport.h === "number") ? viewport.h : 1080;
  return (
    '<canvas ' +
    'data-nf-persist="webgl-particles" ' +
    'data-nf-track-id="webgl-particles" ' +
    'width="' + w + '" height="' + h + '" ' +
    'style="position:absolute;inset:0;width:100%;height:100%;' +
    'opacity:0.95;display:block;background:#050507;pointer-events:none"></canvas>'
  );
}

// ---------- L2 lifecycle --------------------------------------------------

// mount · called once after DOM insert · initializes Canvas 2D context +
// deterministic spiral positions. Idempotent data: no Math.random / Date.now.
export function mount(el, params, viewport) {
  if (!el || typeof el.getContext !== "function") return;

  const p = params || {};
  const count = Math.max(
    100,
    Math.min(5000, typeof p.count === "number" ? p.count : 800),
  );
  const hueBase = typeof p.hue_base === "number" ? p.hue_base : 260;

  const ctx = el.getContext("2d");
  if (!ctx) {
    el._nfState = { unsupported: true };
    return;
  }

  // Deterministic spiral positions in unit circle (幂等 · 不读 Math.random).
  const positions = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const ti = i / count;
    const angle = ti * Math.PI * 2 * 7; // 7-turn spiral
    const radius = 0.3 + ti * 0.6;
    positions[i * 2]     = Math.cos(angle) * radius;
    positions[i * 2 + 1] = Math.sin(angle) * radius;
  }

  el._nfState = {
    ctx: ctx,
    count: count,
    hueBase: hueBase,
    positions: positions,
  };
}

// update · called every RAF tick · MUST be idempotent in t (same t -> same pixels).
export function update(el, t, params) {
  if (!el) return;
  const s = el._nfState;
  if (!s || s.unsupported) return;

  const ctx = s.ctx;
  const count = s.count;
  const positions = s.positions;
  const hueBase =
    params && typeof params.hue_base === "number" ? params.hue_base : s.hueBase;
  const W = el.width;
  const H = el.height;

  // Clear with trail effect（半透明黑 · 叠影轨迹）
  ctx.fillStyle = "rgba(5, 5, 7, 0.25)";
  ctx.fillRect(0, 0, W, H);

  const tSec = (typeof t === "number" ? t : 0) / 1000;
  const cx = W / 2;
  const cy = H / 2;
  const scale = Math.min(W, H) * 0.45;

  // Draw particles · 按 t 旋转 + hue 变色（同 t 同位置 · 幂等）
  for (let i = 0; i < count; i++) {
    const px = positions[i * 2];
    const py = positions[i * 2 + 1];
    const rot = tSec * 0.5 + i * 0.0001;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const x = cx + scale * (cosR * px - sinR * py);
    const y = cy + scale * (sinR * px + cosR * py);
    const hue = (hueBase + (i / count) * 80 + tSec * 10) % 360;
    ctx.fillStyle = "hsla(" + hue.toFixed(0) + ", 80%, 65%, 0.85)";
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// unmount · clean up state to avoid leaks across diff cycles.
export function unmount(el) {
  if (!el) return;
  if (el._nfState) {
    el._nfState = null;
  }
}
