import { demo } from "./mock.js";

const root = document.querySelector("[data-demo]");
root.innerHTML = `
  <section><div class="kicker">${demo.kicker}</div><h1>${demo.title}</h1></section>
  <section class="flow">
    <article class="box"><div class="code">${demo.before}</div></article>
    <div class="arrow">→</div>
    <article class="box"><div class="code">${demo.after}</div><div class="error">${demo.exit}</div></article>
  </section>
  <div class="progress"><div class="bar"></div></div>
  <div class="toast">本轮完成</div>
`;
