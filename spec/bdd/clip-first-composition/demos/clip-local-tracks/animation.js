import { tracks } from "./mock.js";

document.querySelector("#app").innerHTML = `
  <section class="timeline">
    <header>proof · anchors: in / panel-in / out</header>
    ${tracks.map((track, index) => `<div class="row"><b>${track}</b><span style="--i:${index}"></span></div>`).join("")}
    <div class="toast">本轮完成</div>
  </section>
`;
