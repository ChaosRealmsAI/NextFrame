import { layers, policy } from "./mock.js";
const root = document.querySelector("#demo");
root.innerHTML = `<div class="top"><b>Intent Verify</b><span>overlap is not a bug</span></div>
<section class="stage"><div class="layer a">${layers[0]}</div><div class="layer b">${layers[1]}</div><div class="policy">${policy}<br>layout.overlap checks: []</div></section>
<div class="progress"></div><div class="toast">本轮完成</div>`;
