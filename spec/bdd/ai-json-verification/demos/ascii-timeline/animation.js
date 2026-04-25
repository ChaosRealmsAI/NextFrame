import { lines } from "./mock.js";

const root = document.querySelector("#demo");
root.innerHTML = `
  <div class="top"><b>AI JSON Verify</b><span>ASCII timeline</span></div>
  <section class="body">
    <div class="terminal">${lines.map((line) => `<div class="line">${line}</div>`).join("")}</div>
  </section>
  <div class="progress"></div>
  <div class="toast">本轮完成</div>`;
