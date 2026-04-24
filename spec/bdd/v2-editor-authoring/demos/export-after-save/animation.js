import { scenario } from "./mock.js";

const root = document.querySelector("#demo");
root.innerHTML = `
  <section class="top"><strong>Save -> Export -> Open</strong><span>${scenario.output}</span></section>
  <section class="body">
    <section class="preview"><h1>${scenario.title}</h1><div class="scan"></div></section>
    <aside><button class="save">Saved</button><button class="export">Export video</button><div class="bar"><i></i></div><button class="open">Open output</button></aside>
  </section>
  <div class="progress"></div><div class="toast">本轮完成</div>
`;

setInterval(() => {
  root.classList.remove("play");
  void root.offsetWidth;
  root.classList.add("play");
}, 10000);
root.classList.add("play");
