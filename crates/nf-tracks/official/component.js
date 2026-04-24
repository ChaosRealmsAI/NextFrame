// Official "component" Track — v2 composition host.
// It stays pure and only emits a stable DOM root. Arbitrary component JS runs
// through runtime lifecycle hooks after diffAndMount, without iframe isolation.

export function describe() {
  return {
    id: "component",
    kind: "component",
    name: "Component Host",
    description: "V2 composition component host · DOM lifecycle without iframe",
    use_cases: ["HTML/CSS/JS components", "canvas", "SVG", "DOM animation"],
    viewport: "any",
    t0_visibility: 1.0,
    z_order_hint: 10,
    visual_channels: ["dom"],
    params: {
      type: "object",
      required: ["component"],
      additionalProperties: true,
    },
  };
}

export function sample() {
  return {
    component: "html.hero-title",
    params: {},
    style: {},
    track: { id: "hero", z: 10 },
  };
}

function escapeAttr(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function encodeJson(value) {
  try {
    return escapeAttr(JSON.stringify(value == null ? {} : value));
  } catch (_err) {
    return "{}";
  }
}

export function render(t, params, viewport) {
  const p = params || {};
  const component = typeof p.component === "string" ? p.component : "";
  const track = p.track && typeof p.track === "object" ? p.track : {};
  const z = Number.isFinite(track.z) ? track.z : 10;
  const trackId = typeof track.id === "string" ? track.id : component || "component";
  const w = viewport && Number.isFinite(viewport.w) ? viewport.w : 1920;
  const h = viewport && Number.isFinite(viewport.h) ? viewport.h : 1080;
  const key = "component:" + trackId + ":" + component;
  return (
    '<div data-layout="component" data-nf-component-root="1"' +
      ' data-nf-persist="' + escapeAttr(key) + '"' +
      ' data-nf-component="' + escapeAttr(component) + '"' +
      ' data-nf-component-track="' + escapeAttr(trackId) + '"' +
      ' data-nf-component-params="' + encodeJson(p.params) + '"' +
      ' data-nf-component-style="' + encodeJson(p.style) + '"' +
      ' data-nf-component-t="' + escapeAttr(t) + '"' +
      ' style="position:absolute;inset:0;width:' + w + 'px;height:' + h + 'px;z-index:' + z + ';pointer-events:auto;overflow:hidden;">' +
    '</div>'
  );
}
