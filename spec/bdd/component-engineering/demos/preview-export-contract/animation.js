import { demo } from "./mock.js";

const root = document.querySelector("[data-demo]");
root.innerHTML = `
  <section><div class="kicker">${demo.kicker}</div><h1>${demo.title}</h1></section>
  <section class="lane">
    ${demo.nodes.map(([name, detail], index) => `
      <article class="node ${index > 0 ? "active" : ""}"><strong>${name}</strong><span>${detail}</span></article>
      ${index < demo.nodes.length - 1 ? "<div class=\"arrow\">→</div>" : ""}
    `).join("")}
  </section>
  <div class="progress"><div class="bar"></div></div>
  <div class="toast">本轮完成</div>
`;
