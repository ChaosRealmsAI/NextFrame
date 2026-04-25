import { demo } from "./mock.js";

const spans = demo.spans
  .map(([kind, left, width]) => `<b class="span ${kind}" style="left:${left};width:${width}"></b>`)
  .join("");

document.querySelector("#app").innerHTML = `
  <div class="top"><strong>NextFrame Export Diagnostics</strong><span>${demo.stage}</span></div>
  <section class="body">
    <div class="map">
      <div class="headline">${demo.title}</div>
      <div class="sub">${demo.subtitle}</div>
      <div class="timeline"><div class="rail">${spans}</div><div class="legend"><div><b>JSON</b>report path</div><div><b>SLOW</b>grouped spans</div><div><b>TOP</b>slow frames</div></div></div>
      <div class="toast">本轮完成</div>
    </div>
    <aside><div class="label">diagnostics summary</div>${demo.metrics.map(([value, label]) => `<div class="metric"><strong>${value}</strong><span>${label}</span></div>`).join("")}<div class="button">查看 report</div></aside>
  </section><div class="loopbar"></div>`;
