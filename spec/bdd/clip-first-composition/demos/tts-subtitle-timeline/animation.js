import { words } from "./mock.js";

document.querySelector("#app").innerHTML = `
  <section class="stage">
    <div class="wave"></div>
    <p>${words.map((word, index) => `<span style="--i:${index}">${word}</span>`).join(" ")}</p>
    <div class="toast">本轮完成</div>
  </section>
`;
