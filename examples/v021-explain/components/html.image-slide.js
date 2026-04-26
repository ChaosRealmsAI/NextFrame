export function mount(root, ctx) {
  root.innerHTML = [
    '<div data-image-slide-root="1" style="position:absolute;inset:0;width:100%;height:100%;overflow:hidden;background:#000;">',
    '  <img data-image-slide-img="1" alt="" draggable="false" style="display:block;width:100%;height:100%;object-fit:cover;">',
    '</div>'
  ].join("");
  update(root, ctx);
}

export function update(root, ctx) {
  if (!root) return;
  const params = (ctx && typeof ctx === "object" && ctx.params && typeof ctx.params === "object") ? ctx.params : {};
  const frame = root.querySelector('[data-image-slide-root="1"]');
  const img = root.querySelector('[data-image-slide-img="1"]');
  if (!frame || !img) return;

  const fit = params.fit === "contain" ? "contain" : "cover";
  const bgColor = typeof params.bg_color === "string" && params.bg_color.trim() ? params.bg_color : "#000";
  const rawSrc = typeof params.src === "string" ? params.src.trim() : "";
  frame.style.background = bgColor;
  img.style.objectFit = fit;

  if (!rawSrc) {
    img.removeAttribute("src");
    delete root.dataset.imageSlideSrc;
    return;
  }

  const nextSrc = playableImageSrc(rawSrc);
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

export function destroy(root) {
  if (root) root.innerHTML = "";
}

function playableImageSrc(src) {
  if (!src.startsWith("file://")) return src;
  try {
    if (typeof window === "undefined" || window.location.protocol !== "nextframe:") return src;
    const path = decodeURIComponent(new URL(src).pathname);
    return `nextframe://media/?path=${encodeURIComponent(path)}`;
  } catch (_e) {
    return src;
  }
}
