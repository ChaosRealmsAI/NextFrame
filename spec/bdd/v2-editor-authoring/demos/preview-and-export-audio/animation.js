import { tracks } from "./mock.js";

const root = document.querySelector("#demo");

root.innerHTML = `
  <section class="stage">
    <div class="preview">
      <div class="wave">${Array.from({ length: 24 }, (_, index) => `<i style="--i:${index}"></i>`).join("")}</div>
    </div>
    <div class="timeline">
      ${tracks.map((track) => `
        <div class="track" aria-label="${track.label}">
          <div class="clip" style="--left:${track.left};--width:${track.width}"></div>
        </div>
      `).join("")}
    </div>
    <div class="toast">本轮完成：预览有旁白，导出 MP4 有 AAC 音轨。</div>
    <div class="progress" aria-hidden="true"></div>
  </section>
`;
