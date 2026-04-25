import { rows } from "./mock.js";

document.querySelector("#app").innerHTML = `
  <section class="shell">
    <aside>${rows.map((row, index) => `<div class="clip c${index}">${row}</div>`).join("")}</aside>
    <div class="stage"><div class="cursor"></div><div class="toast">本轮完成</div></div>
  </section>
`;
