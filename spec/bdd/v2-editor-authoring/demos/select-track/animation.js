import { scenario } from "./mock.js";

const root = document.querySelector("#demo");
root.innerHTML = `
  <section class="top"><strong>V2 COMPOSITION EDITOR</strong><span>${scenario.title}</span></section>
  <section class="body">
    <aside class="tracks">${scenario.rows.map((row) => `<button class="track ${row === scenario.focusTrack ? "target" : ""}" data-id="${row}">${row}</button>`).join("")}</aside>
    <section class="preview"><div class="terminal">render(showreel-24s)<br>component code is live<br>selected track mounts here</div><div class="cursor"></div></section>
    <aside class="inspector"><h2>Inspector</h2>${scenario.inspector.map((field) => `<label>${field}</label>`).join("")}</aside>
  </section>
  <div class="progress"></div><div class="toast">本轮完成</div>
`;

setInterval(() => {
  root.classList.remove("play");
  void root.offsetWidth;
  root.classList.add("play");
}, 10000);
root.classList.add("play");
