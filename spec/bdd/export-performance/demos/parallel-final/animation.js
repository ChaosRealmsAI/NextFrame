import { demo } from "./mock.js";

document.querySelector("#app").innerHTML = `
  <div class="top"><strong>NextFrame Export</strong><span>${demo.stage}</span></div>
  <section class="body">
    <div class="preview">
      <div class="scene-title">${demo.title}</div><div class="scene-sub">${demo.subtitle}</div>
      <div class="timeline"><i class="track"><b class="clip a"></b></i><i class="track"><b class="clip b"></b></i><i class="track"><b class="clip c"></b></i></div><div class="toast">本轮完成</div>
    </div>
    <aside>
      <div class="label">Fast final</div><div class="profiles"><button class="profile active"><strong>高速最终</strong><span>1080p · 60fps · x4</span></button><button class="profile"><strong>最终</strong><span>1080p · 60fps · x1</span></button></div>
      <div class="progressBox" style="--target:${demo.target}"><div class="meter"><div class="fill"></div></div><div class="stats"><span>${demo.frames}</span><span>${demo.eta}</span></div></div>
      <div class="status">record.parallel.start → segment.done → concat</div>
    </aside>
  </section><div class="loopbar"></div>`;
