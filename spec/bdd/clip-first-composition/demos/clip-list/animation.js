import { demo } from "./mock.js";

document.querySelector("#demo").innerHTML = `
  <aside>${demo.clips.map((clip, index) => `<button class="${index === 0 ? "active" : ""}">${clip}</button>`).join("")}</aside>
  <section>
    <div class="stage">intro preview</div>
    <div class="tracks">${demo.tracks.map((track) => `<i>${track}</i>`).join("")}</div>
  </section>
  <div class="progress"></div><div class="toast">本轮完成</div>
`;
