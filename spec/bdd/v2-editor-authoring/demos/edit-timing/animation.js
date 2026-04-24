import { scenario } from "./mock.js";

const root = document.querySelector("#demo");
root.innerHTML = `
  <section class="top"><strong>${scenario.track}</strong><span>time anchors reshape the row</span></section>
  <section class="timeline"><div class="ruler">0s 4s 8s 12s 16s 20s 24s</div><div class="clip"></div><div class="head"></div></section>
  <aside><label>time.begin</label><input value="${scenario.before[0]}"><label>time.end</label><input value="${scenario.before[1]}"><span class="active">active window: intro to outro</span></aside>
  <div class="progress"></div><div class="toast">本轮完成</div>
`;

const inputs = root.querySelectorAll("input");
setInterval(() => {
  inputs[0].value = scenario.before[0];
  inputs[1].value = scenario.before[1];
  root.classList.remove("play");
  void root.offsetWidth;
  root.classList.add("play");
  setTimeout(() => {
    inputs[0].value = scenario.after[0];
    inputs[1].value = scenario.after[1];
  }, 4300);
}, 10000);
root.classList.add("play");
setTimeout(() => { inputs[0].value = scenario.after[0]; inputs[1].value = scenario.after[1]; }, 4300);
