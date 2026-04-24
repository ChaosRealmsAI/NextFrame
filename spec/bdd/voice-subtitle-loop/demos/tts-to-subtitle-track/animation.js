import { line, words } from "./mock.js";

document.querySelector("#script").textContent = line;
const list = document.querySelector("#words");
list.innerHTML = words.map((word, index) => `<span class="word" data-index="${index}">${word}</span>`).join("");

let active = 0;
setInterval(() => {
  list.querySelectorAll(".word").forEach((node, index) => {
    node.classList.toggle("active", index === active);
  });
  active = (active + 1) % words.length;
}, 850);
