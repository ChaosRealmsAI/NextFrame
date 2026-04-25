import { shots } from "./mock.js";

const root = document.querySelector("#demo");
root.innerHTML = `
  <div class="top"><b>AI JSON Verify</b><span>typical screenshot plan</span></div>
  <section class="body">
    ${shots.map(([label, t]) => `<article class="shot"><div class="thumb">${label}</div><div class="meta">T=${t}ms<br>capture ${label}.png</div></article>`).join("")}
  </section>
  <div class="progress"></div>
  <div class="toast">本轮完成</div>`;
