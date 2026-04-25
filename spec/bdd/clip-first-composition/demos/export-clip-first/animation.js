import { stages } from "./mock.js";

document.querySelector("#app").innerHTML = `
  <section class="flow">
    ${stages.map((stage, index) => `<div class="node" style="--i:${index}">${stage}</div>`).join("")}
    <div class="toast">本轮完成</div>
  </section>
`;
