import { bad, warning, fix } from "./mock.js";
const root = document.querySelector("#demo");
root.innerHTML = `<div class="top"><b>Raw Time Warning</b><span>anchor-aware verify</span></div>
<section class="body"><div class="panel"><div class="bad">${bad}<br><br>${warning}</div></div><div class="panel"><div class="good">${fix}<br><br>AI uses anchors automatically</div></div></section>
<div class="progress"></div><div class="toast">本轮完成</div>`;
