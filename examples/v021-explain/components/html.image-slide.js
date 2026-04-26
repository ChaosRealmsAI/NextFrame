export function mount(root, params, ctx) {
  const context = normalizeContext(params, ctx);
  root.innerHTML = [
    '<div data-image-slide-root="1" style="position:absolute;inset:0;width:100%;height:100%;overflow:hidden;background:#000;">',
    '  <img data-image-slide-img="1" alt="" draggable="false" style="display:block;width:100%;height:100%;object-fit:cover;">',
    '</div>'
  ].join("");
  const instance = { root };
  update(instance, context.params, context);
  return instance;
}

export function update(instance, params, ctx) {
  const root = instance && instance.root ? instance.root : instance;
  if (!root) return;
  const context = normalizeContext(params, ctx);
  const p = context.params;
  const frame = root.querySelector('[data-image-slide-root="1"]');
  const img = root.querySelector('[data-image-slide-img="1"]');
  if (!frame || !img) return;

  const fit = p.fit === "contain" ? "contain" : "cover";
  const bgColor = typeof p.bg_color === "string" && p.bg_color.trim() ? p.bg_color : "#000";
  const src = typeof p.src === "string" ? p.src.trim() : "";
  frame.style.background = bgColor;
  img.style.objectFit = fit;

  if (!src) {
    img.removeAttribute("src");
    root.dataset.imageSlideSrc = "";
    return;
  }

  const nextSrc = resolveSrc(src, context);
  if (root.dataset.imageSlideSrc === nextSrc) return;
  root.dataset.imageSlidePending = nextSrc;
  const preload = new Image();
  preload.onload = function () {
    if (root.dataset.imageSlidePending !== nextSrc) return;
    img.src = nextSrc;
    root.dataset.imageSlideSrc = nextSrc;
    delete root.dataset.imageSlidePending;
  };
  preload.onerror = function () {
    if (root.dataset.imageSlidePending === nextSrc) delete root.dataset.imageSlidePending;
  };
  preload.src = nextSrc;
}

export function unmount(instance) {
  const root = instance && instance.root ? instance.root : instance;
  if (root) root.innerHTML = "";
}

export function destroy(root) {
  unmount(root);
}

function normalizeContext(params, ctx) {
  if (ctx && typeof ctx === "object") {
    return { params: params && typeof params === "object" ? params : {}, ctx };
  }
  if (params && typeof params === "object" && params.params) {
    return { params: params.params || {}, ctx: params };
  }
  return { params: params && typeof params === "object" ? params : {}, ctx: {} };
}

function resolveSrc(src, context) {
  if (/^(file:|data:|blob:|https?:)/.test(src) || src.startsWith("/")) return src;
  const base = resolveBaseUrl(context.ctx);
  if (!base) return src;
  try {
    return new URL(src, base).href;
  } catch (_err) {
    return src;
  }
}

function resolveBaseUrl(ctx) {
  const keys = ["assetBaseUrl", "assetsBaseUrl", "projectBaseUrl", "baseUrl", "base_url"];
  for (const key of keys) {
    if (ctx && typeof ctx[key] === "string" && ctx[key]) return ctx[key];
  }
  if (ctx && ctx.ctx) return resolveBaseUrl(ctx.ctx);
  if (typeof document !== "undefined" && document.baseURI) return document.baseURI;
  return "";
}
