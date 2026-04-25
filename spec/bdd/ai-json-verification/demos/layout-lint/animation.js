import { checks } from "./mock.js";

const root = document.querySelector("#demo");
root.innerHTML = `
  <div class="top"><b>AI JSON Verify</b><span>layout lint</span></div>
  <section class="body">
    <div class="canvas">
      <div class="box a">main-title</div>
      <div class="box b">layer-stack</div>
    </div>
    <aside class="checks">${checks.map(([level, id, text]) => `<div class="check ${level}">${level.toUpperCase()} · ${id}<br>${text}</div>`).join("")}</aside>
  </section>
  <div class="progress"></div>
  <div class="toast">本轮完成</div>`;
