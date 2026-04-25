import { demo } from "./mock.js";

const root = document.querySelector("[data-demo]");
root.innerHTML = `
  <section class="header">
    <div><div class="kicker">${demo.kicker}</div><h1>${demo.title}</h1></div>
  </section>
  <section class="terminal">
    ${demo.lines.map((line) => `<div class="line">${line}</div>`).join("")}
    <div class="json">${demo.metrics.map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>
  </section>
  <div class="progress"><div class="bar"></div></div>
  <div class="toast">本轮完成</div>
`;
