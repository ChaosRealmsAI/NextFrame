import { anchors, rule } from "./mock.js";
const root = document.querySelector("#demo");
root.innerHTML = `<div class="top"><b>Anchor Contract</b><span>AI time API</span></div>
<section class="body"><div class="rail">${anchors.map((a,i)=>`<div class="anchor" style="left:${8+i*14}%"><span>${a}</span></div>`).join("")}<div class="track"></div><div class="track"></div><div class="track"></div></div><aside class="guide">${rule}<br><br>anchor.contract: ok<br>13 track ranges use anchors</aside></section>
<div class="progress"></div><div class="toast">本轮完成</div>`;
