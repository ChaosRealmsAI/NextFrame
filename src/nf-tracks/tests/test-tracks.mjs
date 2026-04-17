import { test } from "node:test";
import assert from "node:assert/strict";
import { installDomMock, isFakeElement } from "./_dom-mock.mjs";
import { validateTrack, validateDescribe } from "../abi/index.js";
import { validateProps } from "../scripts/validate-props.mjs";

installDomMock();

const tracks = ["text", "shape", "image", "video"];

for (const name of tracks) {
  test(`${name}: describe() is a valid draft-07 object schema`, async () => {
    const mod = await import(`../official/${name}.js`);
    const desc = mod.describe();
    const res = validateDescribe(desc);
    assert.equal(res.ok, true, JSON.stringify(res.errors));
    assert.equal(desc.type, "object");
  });

  test(`${name}: sample() output validates against describe()`, async () => {
    const mod = await import(`../official/${name}.js`);
    const res = validateProps(mod, mod.sample());
    assert.equal(res.valid, true, JSON.stringify(res.errors));
  });

  test(`${name}: render() returns a DOM element`, async () => {
    const mod = await import(`../official/${name}.js`);
    const out = mod.render(0, [mod.sample()], { w: 1920, h: 1080 });
    assert.ok(out && out.dom, "render() must return { dom }");
    assert.ok(isFakeElement(out.dom), "dom must be an element instance");
  });

  test(`${name}: validateTrack passes`, async () => {
    const mod = await import(`../official/${name}.js`);
    const res = validateTrack(mod);
    assert.equal(res.ok, true, JSON.stringify(res.errors));
  });
}

test("video: rendered element carries data-nf-persist=1", async () => {
  const mod = await import("../official/video.js");
  const out = mod.render(0, [mod.sample()], { w: 1920, h: 1080 });
  assert.equal(out.dom.getAttribute("data-nf-persist"), "1");
});

test("text: interpolates fontSize between two keyframes", async () => {
  const mod = await import("../official/text.js");
  const kfs = [
    { t: 0, text: "x", fontSize: 20 },
    { t: 1, text: "x", fontSize: 80 },
  ];
  const mid = mod.render(0.5, kfs, { w: 100, h: 100 });
  // fontSize="50px" → style.fontSize is "50px"
  assert.equal(mid.dom.style.fontSize, "50px");
});

test("shape: renders svg with child shape element", async () => {
  const mod = await import("../official/shape.js");
  const out = mod.render(0, [mod.sample()], { w: 200, h: 200 });
  assert.equal(out.dom.tagName, "SVG");
  assert.equal(out.dom.children.length, 1);
});

test("image: rendered element has src attribute", async () => {
  const mod = await import("../official/image.js");
  const out = mod.render(0, [mod.sample()], { w: 100, h: 100 });
  assert.equal(out.dom.tagName, "IMG");
  assert.ok(out.dom.getAttribute("src"));
});
