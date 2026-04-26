import { tracks } from "./mock.js";
document.querySelector("#demo").innerHTML = `
  <header><b>intro</b><span>local anchors · in / voice / out</span></header>
  <section>${tracks.map((track) => `<div class="row"><label>${track.kind}</label><i style="left:${track.left};width:${track.width}">${track.id}</i></div>`).join("")}<em></em></section>
  <div class="progress"></div><div class="toast">本轮完成</div>
`;
