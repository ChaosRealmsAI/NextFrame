import { words } from "./mock.js";
document.querySelector("#demo").innerHTML = `
  <section class="flow"><b>tts</b><i>mp3</i><i>timeline.json</i><b>subtitle_timeline</b><b>subtitle</b></section>
  <section class="caption">${words.map((word, index) => `<span style="--i:${index}">${word}</span>`).join("")}</section>
  <div class="progress"></div><div class="toast">本轮完成</div>
`;
