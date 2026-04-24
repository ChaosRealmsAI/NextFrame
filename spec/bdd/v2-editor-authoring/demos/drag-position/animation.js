import { scenario } from "./mock.js";

const root = document.querySelector("#demo");
root.innerHTML = `
  <section class="top"><strong>${scenario.track}</strong><span>preview drag writes style.x/y</span></section>
  <section class="preview"><div class="box"><h1>Motion Layers</h1><p>selected component root</p></div><div class="cursor"></div></section>
  <aside><label>style.x</label><output>${scenario.before.x}</output><label>style.y</label><output>${scenario.before.y}</output><button>Save</button></aside>
  <div class="progress"></div><div class="toast">本轮完成</div>
`;

const outputs = root.querySelectorAll("output");
setInterval(() => {
  outputs[0].textContent = scenario.before.x;
  outputs[1].textContent = scenario.before.y;
  root.classList.remove("play");
  void root.offsetWidth;
  root.classList.add("play");
  setTimeout(() => {
    outputs[0].textContent = scenario.after.x;
    outputs[1].textContent = scenario.after.y;
  }, 5600);
}, 10000);
root.classList.add("play");
setTimeout(() => { outputs[0].textContent = scenario.after.x; outputs[1].textContent = scenario.after.y; }, 5600);
