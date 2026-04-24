import { scenario } from "./mock.js";

const root = document.querySelector("#demo");
root.innerHTML = `
  <section class="top"><strong>${scenario.track}</strong><span>dirty state follows JSON params</span></section>
  <section class="body">
    <section class="preview"><h1 class="title">${scenario.before}</h1><p>preview reads live source</p></section>
    <aside class="inspector"><label>${scenario.field}</label><input value="${scenario.before}" aria-label="title input"><button>Save</button><span class="state">clean</span></aside>
  </section>
  <div class="progress"></div><div class="toast">本轮完成</div>
`;

const input = root.querySelector("input");
setInterval(() => {
  input.value = scenario.before;
  root.classList.remove("play");
  void root.offsetWidth;
  root.classList.add("play");
  setTimeout(() => { input.value = scenario.after; }, 4300);
}, 10000);
root.classList.add("play");
setTimeout(() => { input.value = scenario.after; }, 4300);
