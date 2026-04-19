// src/nf-tracks/official/video.js
// Official "video" Track — <video> element embed with precise seek.
// Contract: ADR-033 Track ABI v1.1 + ADR-046 (video kind) + ADR-047 (data-nf-persist).
//
// v1.54 note:
// Fallback B temporarily lifts ADR-063's "no iframe" rule for THIS official
// Track only. The iframe is isolated inside mount()/unmount(); render() still
// returns plain HTML and the parent runtime never holds a live <video> ref.
//
// HARD CONSTRAINTS (lint-enforced by scripts/check-abi.mjs):
//   - single-file, zero imports, zero require, zero await import
//   - three and only three exports: describe, sample, render
//   - render is a PURE function of (t, params, viewport)
//   - render(0, sample(), viewport) → HTML containing opacity >= 0.9
//
// Allowed globals: Math, JSON, Array, Object, String, Number (no Date.now,
// no random, no DOM, no fetch). Runtime detects body[data-mode] externally
// and overrides muted/currentTime after render (diff preserves element
// identity via data-nf-persist).

export function describe() {
  return {
    id: "video",
    kind: "video",
    level: 2,
    name: "Video Track",
    description: "视频轨道 · PIP 画中画 · 支持 file:// / http:// · 起止时间裁剪 · 适合产品演示",
    use_cases: ["产品演示", "画中画", "采访剪辑"],
    viewport: "any",
    t0_visibility: 0.95,
    z_order_hint: 0,
    visual_channels: ["scene"],
    params: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      required: ["src"],
      additionalProperties: false,
      properties: {
        src: {
          type: "string",
          pattern: "^(file://|data:)",
        },
        from_ms: { type: "number", minimum: 0 },
        to_ms: { type: "number", minimum: 0 },
        fit: { type: "string", enum: ["contain", "cover"] },
        muted_in_record: { const: true },
        // Embedding rect (viewport-percent 0-100). Omit → full-stage.
        x: { type: "number", minimum: 0, maximum: 100 },
        y: { type: "number", minimum: 0, maximum: 100 },
        w: { type: "number", minimum: 0, maximum: 100 },
        h: { type: "number", minimum: 0, maximum: 100 },
        // Visual chrome.
        radius: { type: "number", minimum: 0 },
        border: { type: "string" },
        shadow: { type: "string" },
      },
    },
  };
}

export function sample() {
  return {
    src: "file:///tmp/sample-clip.mp4",
    from_ms: 2000,
    to_ms: 7000,
    fit: "cover",
    muted_in_record: true,
    // Embed bottom-right ≈ 40% × 40% PIP-style window.
    x: 55,
    y: 55,
    w: 40,
    h: 40,
    radius: 16,
    border: "2px solid rgba(255,255,255,0.25)",
    shadow: "0 12px 40px rgba(0,0,0,0.5)",
  };
}

// ---------- helpers (single-file rule; kept inline) ----------

function escapeAttr(s) {
  if (typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// persist key = "video-" + stable hash of src (same src → same key across frames).
// We use a simple FNV-1a hash of the src string so different clips with same
// src share the element (which is fine: runtime dedupes by key).
function stableKey(src) {
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return "video-" + h.toString(16);
}

function computeFit(p) {
  return p.fit === "cover" ? "cover" : "contain";
}

function buildSrcDoc(src, fit, key) {
  const srcLit = JSON.stringify(src);
  const fitLit = JSON.stringify(fit);
  const keyLit = JSON.stringify(key);
  return (
    "<!doctype html><html><head><meta charset=\"utf-8\"></head>" +
    "<body style=\"margin:0;background:#000;overflow:hidden;\">" +
    "<video id=\"v\" playsinline preload=\"auto\" muted " +
    "style=\"width:100%;height:100%;display:block;background:#000;object-fit:" + escapeAttr(fit) + ";\" " +
    "src=\"" + escapeAttr(src) + "\"></video>" +
    "<script>(function(){" +
    "var KEY=" + keyLit + ";" +
    "var v=document.getElementById('v');" +
    "function post(type,extra){try{parent.postMessage(Object.assign({__nfVideoProxy:true,key:KEY,type:type},extra||{}),'*');}catch(_e){}}" +
    "function state(type){post(type||'state',{" +
    "paused:!!v.paused," +
    "muted:!!v.muted," +
    "currentTime:Number(v.currentTime)||0," +
    "duration:isFinite(v.duration)?Number(v.duration):0," +
    "readyState:Number(v.readyState)||0," +
    "ended:!!v.ended," +
    "error:v.error?String(v.error.code):null," +
    "frameReady:(Number(v.readyState)||0)>=2" +
    "});}" +
    "window.addEventListener('message',function(ev){" +
    "var d=ev&&ev.data;" +
    "if(!d||d.__nfVideoProxy!==true||d.key!==KEY)return;" +
    "if(d.type==='seek'){" +
    "var target=(Number(d.t)||0)/1000;" +
    "if(Math.abs((Number(v.currentTime)||0)-target)>0.01){try{v.currentTime=target;}catch(_e){}}" +
    "state('seek');return;}" +
    "if(d.type==='play'){try{var p=v.play();if(p&&typeof p.catch==='function')p.catch(function(){});}catch(_e){}state('play-command');return;}" +
    "if(d.type==='pause'){try{v.pause();}catch(_e){}state('pause-command');return;}" +
    "if(d.type==='unmute'){try{v.muted=false;v.volume=typeof d.volume==='number'?d.volume:1.0;}catch(_e){}state('unmute-command');return;}" +
    "if(d.type==='mute'){try{v.muted=true;}catch(_e){}state('mute-command');return;}" +
    "if(d.type==='sync-volume'){try{v.volume=typeof d.volume==='number'?d.volume:1.0;}catch(_e){}state('volume-command');return;}" +
    "if(d.type==='set-fit'){try{v.style.objectFit=d.fit==='cover'?'cover':'contain';}catch(_e){}state('fit-command');return;}" +
    "});" +
    "['loadedmetadata','loadeddata','canplay','canplaythrough','seeked','timeupdate','play','playing','pause','volumechange','ended','waiting','stalled','error'].forEach(function(ev){" +
    "v.addEventListener(ev,function(){state(ev);});" +
    "});" +
    "state('boot');" +
    "})();<\/script>" +
    "</body></html>"
  );
}

function setStateAttr(el, name, value) {
  if (!el || typeof el.setAttribute !== "function") return;
  el.setAttribute(name, String(value));
}

function writeProxyState(el, payload) {
  if (!el || !payload || typeof payload !== "object") return;
  setStateAttr(el, "data-nf-video-paused", payload.paused ? "1" : "0");
  setStateAttr(el, "data-nf-video-muted", payload.muted ? "1" : "0");
  setStateAttr(el, "data-nf-video-current-time",
    typeof payload.currentTime === "number" ? payload.currentTime : 0);
  setStateAttr(el, "data-nf-video-duration",
    typeof payload.duration === "number" ? payload.duration : 0);
  setStateAttr(el, "data-nf-video-ready-state",
    typeof payload.readyState === "number" ? payload.readyState : 0);
  setStateAttr(el, "data-nf-video-frame-ready", payload.frameReady ? "1" : "0");
  setStateAttr(el, "data-nf-video-playing",
    payload.paused ? "0" : ((payload.frameReady ? "1" : "0")));
  setStateAttr(el, "data-nf-video-error",
    payload.error == null ? "" : String(payload.error));
}

export function render(t, params, viewport) {
  const p = params || {};
  const vp =
    viewport && typeof viewport.w === "number" && typeof viewport.h === "number"
      ? viewport
      : { w: 1920, h: 1080 };

  // Guard: no src → render empty placeholder (still FM-T0 compliant).
  if (!p.src || typeof p.src !== "string") {
    return (
      '<div data-layout="video-empty" style="' +
      "position:absolute;inset:0;" +
      "width:" + vp.w + "px;height:" + vp.h + "px;" +
      "background:#0b0d10;opacity:0.95;" +
      '"></div>'
    );
  }

  const src = escapeAttr(p.src);
  const key = stableKey(p.src);
  const fromMs = typeof p.from_ms === "number" ? p.from_ms : 0;
  const fit = computeFit(p);

  // Embed rect — percent of viewport (NOT px): bundle CSS scales #nf-stage>*
  // by stage/viewport ratio, and scale() does NOT scale `left` values — so
  // percent is the only way to express position relative to stage. Also add
  // transform: none to cancel the global scale on this element (the video
  // should fill its PIP rect at native resolution, not be re-scaled).
  // !important overrides bundle CSS `#nf-stage > *{top:0!important;left:0!important;transform:scale...!important}`.
  const hasRect = typeof p.x === "number" || typeof p.y === "number"
    || typeof p.w === "number" || typeof p.h === "number";
  const xPct = typeof p.x === "number" ? p.x : 0;
  const yPct = typeof p.y === "number" ? p.y : 0;
  const wPct = typeof p.w === "number" ? p.w : 100;
  const hPct = typeof p.h === "number" ? p.h : 100;

  // render is PURE. Do NOT emit `muted` attribute: HTML boolean attributes
  // are true whenever present (any string value including "false" = muted).
  // Runtime sets v.muted via property assignment after diff mount based on
  // body[data-mode] (play → false, record → true). See BUG-20260419-01.
  // Opacity hardcoded to 0.95 (FM-T0 gate: ≥ 0.9).
  const posStyle = hasRect
    ? "position:absolute !important;" +
      "left:" + xPct + "% !important;top:" + yPct + "% !important;" +
      "width:" + wPct + "% !important;height:" + hPct + "% !important;" +
      "transform:none !important;"
    : "position:absolute !important;" +
      "left:0 !important;top:0 !important;" +
      "width:100% !important;height:100% !important;" +
      "transform:none !important;";

  const radius = typeof p.radius === "number" ? p.radius : 0;
  const border = typeof p.border === "string" ? p.border : "";
  const shadow = typeof p.shadow === "string" ? p.shadow : "";

  const style =
    posStyle +
    "object-fit:" + fit + ";" +
    "background:#000;" +
    "opacity:0.95;" +
    (radius ? ("border-radius:" + radius + "px;") : "") +
    (border ? ("border:" + escapeAttr(border) + ";box-sizing:border-box;") : "") +
    (shadow ? ("box-shadow:" + escapeAttr(shadow) + ";") : "");

  return (
    '<div' +
    ' data-nf-persist="' + key + '"' +
    ' data-nf-track-id="video"' +
    ' data-nf-video-proxy="1"' +
    ' data-nf-video-key="' + key + '"' +
    ' data-nf-video-paused="1"' +
    ' data-nf-video-muted="1"' +
    ' data-nf-video-current-time="0"' +
    ' data-nf-video-duration="0"' +
    ' data-nf-video-ready-state="0"' +
    ' data-nf-video-frame-ready="0"' +
    ' data-nf-video-playing="0"' +
    ' data-nf-video-error=""' +
    ' data-nf-t-offset="' + fromMs + '"' +
    ' data-nf-src="' + src + '"' +
    ' data-nf-fit="' + fit + '"' +
    ' style="' + style + '"' +
    '></div>'
  );
}

export function mount(el, params) {
  if (!el || typeof document === "undefined") return;
  const p = params || {};
  const key = el.getAttribute("data-nf-video-key") || stableKey(p.src || "");
  const fit = computeFit(p);

  const onMessage = function(ev) {
    const data = ev && ev.data;
    if (!data || data.__nfVideoProxy !== true || data.key !== key) return;
    writeProxyState(el, data);
  };

  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("message", onMessage);
  }
  el.__nfVideoProxyHandler = onMessage;

  let frame = el.querySelector && el.querySelector("iframe[data-nf-video-frame='1']");
  if (!frame) {
    frame = document.createElement("iframe");
    frame.setAttribute("data-nf-video-frame", "1");
    frame.setAttribute("allow", "autoplay");
    frame.setAttribute("scrolling", "no");
    frame.setAttribute("tabindex", "-1");
    frame.style.cssText = "display:block;width:100%;height:100%;border:0;background:#000;";
    el.appendChild(frame);
  }

  frame.srcdoc = buildSrcDoc(p.src || "", fit, key);
  el._nfState = { mounted: true, fit: fit };
}

export function update(el, t, params) {
  if (!el || !el._nfState) return;
  const p = params || {};
  const fit = computeFit(p);
  if (fit === el._nfState.fit) return;
  const frame = el.querySelector && el.querySelector("iframe[data-nf-video-frame='1']");
  if (!frame || !frame.contentWindow || typeof frame.contentWindow.postMessage !== "function") return;
  try {
    frame.contentWindow.postMessage({
      __nfVideoProxy: true,
      key: el.getAttribute("data-nf-video-key") || stableKey(p.src || ""),
      type: "set-fit",
      fit: fit,
    }, "*");
    el._nfState.fit = fit;
  } catch (_e) {
    // noop
  }
}

export function unmount(el) {
  if (!el) return;
  if (typeof window !== "undefined" && window.removeEventListener && el.__nfVideoProxyHandler) {
    window.removeEventListener("message", el.__nfVideoProxyHandler);
  }
  delete el.__nfVideoProxyHandler;
  const frame = el.querySelector && el.querySelector("iframe[data-nf-video-frame='1']");
  if (frame && frame.contentWindow && typeof frame.contentWindow.postMessage === "function") {
    try {
      frame.contentWindow.postMessage({
        __nfVideoProxy: true,
        key: el.getAttribute("data-nf-video-key") || "",
        type: "pause",
      }, "*");
    } catch (_e) {
      // noop
    }
  }
  if (frame && frame.parentNode === el) {
    el.removeChild(frame);
  }
  el._nfState = null;
}
