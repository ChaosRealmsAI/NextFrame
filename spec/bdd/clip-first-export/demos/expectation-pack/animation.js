import { checks, contracts, slides, tracks } from "./mock.js";

const stage = document.querySelector("#stage");
const caption = document.querySelector("#caption");
const checkRoot = document.querySelector("#checks");
const contractRoot = document.querySelector("#contracts");
const trackRoot = document.querySelector("#tracks");
const voice = document.querySelector("#voice");
const voiceBtn = document.querySelector("#voiceBtn");

checkRoot.innerHTML = checks.map((item, index) => `
  <article class="check" data-index="${index}">
    <b>${item[0]}</b>
    <span>${item[1]}</span>
  </article>
`).join("");

contractRoot.innerHTML = contracts.map((item, index) => `
  <article class="contract" data-index="${index}">
    <span>${item[0]}</span>
    <code>${item[1]}</code>
  </article>
`).join("");

trackRoot.innerHTML = tracks.map((track) => `
  <div class="clip ${track.kind}" style="left:${track.left}%;width:${track.width}%">${track.label}</div>
`).join("");

function renderSlide(index) {
  const slide = slides[index % slides.length];
  stage.innerHTML = `
    <div class="grid"></div>
    <section class="hero">
      <em>${slide.tag}</em>
      <h1>${slide.title}</h1>
      <p>${slide.caption}</p>
    </section>
    <div class="source-card">
      <strong>${index < 2 ? "composition.json" : "render_source.json"}</strong>
      <span>${index < 2 ? "AI 写创作协议" : "recorder 吃渲染协议"}</span>
    </div>
    <div class="frame-card">
      <strong>${index < 3 ? "preview" : "verify-export"}</strong>
      <span>${index < 3 ? "same runtime" : "sample clip frames"}</span>
    </div>
  `;
  caption.textContent = slide.caption;
  document.querySelectorAll(".check").forEach((el) => el.toggleAttribute("active", Number(el.dataset.index) === slide.activeCheck));
  document.querySelectorAll(".contract").forEach((el) => el.toggleAttribute("active", Number(el.dataset.index) === slide.activeContract));
}

let current = 0;
renderSlide(current);
setInterval(() => {
  current += 1;
  renderSlide(current);
}, 6500);

voiceBtn.addEventListener("click", async () => {
  if (voice.paused) {
    await voice.play();
    voiceBtn.textContent = "暂停语音";
  } else {
    voice.pause();
    voiceBtn.textContent = "播放语音";
  }
});

voice.addEventListener("ended", () => {
  voiceBtn.textContent = "重播语音";
});

setTimeout(() => {
  voice.play().then(() => {
    voiceBtn.textContent = "暂停语音";
  }).catch(() => {
    voiceBtn.textContent = "播放语音";
  });
}, 600);
