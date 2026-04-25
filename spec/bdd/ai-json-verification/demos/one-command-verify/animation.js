import { command, checks } from "./mock.js";

const root = document.querySelector("#demo");
root.innerHTML = `
  <div class="top"><b>AI JSON Verify</b><span>one command</span></div>
  <section class="body">
    <div class="json"><pre>{
  "track": "final-title",
  "params": { "title": "Edit it live" }
}</pre><div class="cmd">$ ${command}</div></div>
    <div class="report">
      <pre>{
  "ok": true,
  "summary": { "errors": 0, "warnings": 7 },
  "checks": [...]
}</pre>
      ${checks.map(([level, id, text]) => `<div class="check ${level}">${level.toUpperCase()} · ${id} · ${text}</div>`).join("")}
    </div>
  </section>
  <div class="progress"></div>
  <div class="toast">本轮完成</div>`;
