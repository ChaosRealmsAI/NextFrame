import { attrs, esc, num, slug } from "../shared.js";
// TODO: tune normalized SVG geometry for marquee if spec shifts
const meta = {
  name: "marquee",
  category: "text",
  description: "Clipped marquee-style text strip",
  params: [
    {
      name: "text",
      type: "string",
      default: "Marquee text",
      semantic: "text content",
    },
    {
      name: "width",
      type: "number",
      default: 240,
      semantic: "clip width in px",
    },
    {
      name: "height",
      type: "number",
      default: 54,
      semantic: "clip height in px",
    },
    {
      name: "fontSize",
      type: "number",
      default: 34,
      semantic: "font size in px",
    },
    {
      name: "font",
      type: "string",
      default: "system-ui, sans-serif",
      semantic: "font-family value",
    },
    {
      name: "fill",
      type: "color",
      default: "#da7756",
      semantic: "text fill color",
    },
  ],
};
function marquee(layer = {}) {
  const value = esc(layer.text ?? "Marquee text");
  const width = Math.max(1, num(layer.width, 240));
  const height = Math.max(1, num(layer.height, 54));
  const fontSize = num(layer.fontSize, 34);
  const font = layer.font ?? "system-ui, sans-serif";
  const fill = layer.fill ?? "#da7756";
  const loop = `${value} \u2022 ${value}`;
  const gap = fontSize * 1.5;
  const textWidth = Math.max(width, loop.length * fontSize * 0.58);
  const id = slug(`${value}-${width}-${height}-${fontSize}`);
  const clipRect = attrs({
    x: -width / 2,
    y: -height / 2,
    width,
    height,
    rx: height / 2,
    ry: height / 2,
  });
  const textAttrs = {
    fill,
    "font-size": fontSize,
    "font-family": font,
    "dominant-baseline": "middle",
    "xml:space": "preserve",
  };
  const first = `<text${attrs({
    x: -textWidth / 2,
    y: 0,
    ...textAttrs,
  })}>${loop}</text>`;
  const second = `<text${attrs({
    x: -textWidth / 2 + textWidth + gap,
    y: 0,
    ...textAttrs,
  })}>${loop}</text>`;
  return `<g><defs><clipPath${attrs({ id })}><rect${clipRect}/></clipPath></defs><g${attrs({ "clip-path": `url(#${id})` })}>${first}${second}</g></g>`;
}
marquee.meta = meta;
export default marquee;
