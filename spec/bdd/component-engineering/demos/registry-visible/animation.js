import { demo } from "./mock.js";

const root = document.querySelector("[data-demo]");
root.innerHTML = `
  <section class="header">
    <div><div class="kicker">${demo.kicker}</div><h1>${demo.title}</h1></div>
    <div class="summary"><span class="pill">ok=true</span><span>${demo.summary}</span></div>
  </section>
  <section class="grid">
    <article class="panel"><h2>${demo.leftTitle}</h2>${demo.left.map((item, index) => `<div class="row ${index < 3 ? "active" : ""}"><strong>${item}</strong><span>.js</span></div>`).join("")}</article>
    <article class="panel"><h2>${demo.rightTitle}</h2>${demo.right.map(([track, component]) => `<div class="row active"><strong>${track}</strong><span>${component}</span></div>`).join("")}</article>
  </section>
  <div class="progress"><div class="bar"></div></div>
  <div class="toast">本轮完成</div>
`;
