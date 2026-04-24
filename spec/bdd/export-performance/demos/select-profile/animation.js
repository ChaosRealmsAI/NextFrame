import { demo } from "./mock.js";

document.querySelector("#app").innerHTML = `
  <div class="top"><strong>NextFrame Export</strong><span>${demo.stage}</span></div>
  <section class="body">
    <div class="preview">
      <div class="scene-title">${demo.title}</div>
      <div class="scene-sub">${demo.subtitle}</div>
      <div class="timeline"><i class="track"><b class="clip a"></b></i><i class="track"><b class="clip b"></b></i><i class="track"><b class="clip c"></b></i></div>
      <div class="toast">本轮完成</div>
    </div>
    <aside>
      <div class="label">Profile</div>
      <div class="profiles"><button class="profile active"><strong>草稿</strong><span>720p · 30fps · x1</span></button><button class="profile"><strong>标准</strong><span>1080p · 30fps · x1</span></button><button class="profile"><strong>最终</strong><span>1080p · 60fps · x1</span></button><button class="profile"><strong>高速最终</strong><span>1080p · 60fps · x4</span></button></div>
      <div class="button">导出草稿</div><div class="status">profile=draft · fps=30 · resolution=720p</div>
    </aside>
  </section><div class="loopbar"></div>`;
