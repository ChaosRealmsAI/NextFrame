export function describe() {
  return {
    id: "hello-world",
    kind: "hello-world",
    name: "Hello World Plugin",
    description: "示例用户插件轨道 · 用来验证 ~/.nextframe/plugins 扫描与 resolve",
    viewport: "any",
    t0_visibility: 1.0,
    params: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string", maxLength: 120 },
        subtitle: { type: "string", maxLength: 200 },
        accent_color: {
          type: "string",
          pattern: "^#[0-9a-fA-F]{6}$"
        }
      }
    }
  };
}

export function sample() {
  return {
    title: "Hello Plugin",
    subtitle: "Loaded from ~/.nextframe/plugins",
    accent_color: "#5eead4"
  };
}

function esc(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function render(_t, params, viewport) {
  const vp =
    viewport && typeof viewport.w === "number" && typeof viewport.h === "number"
      ? viewport
      : { w: 1920, h: 1080 };
  const accent =
    typeof params?.accent_color === "string" && /^#[0-9a-fA-F]{6}$/.test(params.accent_color)
      ? params.accent_color
      : "#5eead4";
  const title = esc(params?.title || "Hello Plugin");
  const subtitle = esc(params?.subtitle || "Loaded from ~/.nextframe/plugins");
  const titleSize = Math.round(vp.h * 0.11);
  const subtitleSize = Math.round(vp.h * 0.035);

  return (
    '<div data-plugin-kind="hello-world" style="' +
      "position:absolute;inset:0;" +
      "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
      "background:radial-gradient(circle at 50% 35%, " + accent + "33 0%, #04121a 58%, #02070b 100%);" +
      "color:#e6fffb;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
      '">' +
      '<div style="' +
        "font-size:" + titleSize + "px;" +
        "font-weight:800;" +
        "letter-spacing:-0.04em;" +
        "margin-bottom:18px;" +
        '">' + title + "</div>" +
      '<div style="' +
        "font-size:" + subtitleSize + "px;" +
        "letter-spacing:0.04em;" +
        "text-transform:uppercase;" +
        "color:" + accent + ";" +
        '">' + subtitle + "</div>" +
    "</div>"
  );
}
