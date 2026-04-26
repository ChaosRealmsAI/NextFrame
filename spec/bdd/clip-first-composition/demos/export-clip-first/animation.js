import { stages } from "./mock.js";
document.querySelector("#demo").innerHTML = `
  <section>${stages.map((stage, index) => `<b style="--i:${index}">${stage}</b>`).join("")}</section>
  <div class="video">showreel-clip-first.mp4</div>
  <div class="progress"></div><div class="toast">本轮完成</div>
`;
