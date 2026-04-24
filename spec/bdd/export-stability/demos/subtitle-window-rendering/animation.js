import { words } from "./mock.js";

document.querySelector("#full").textContent = words.join(" ");
document.querySelector("#visible").innerHTML = words
  .slice(4, 9)
  .map((word, index) => `<span class="${index === 2 ? "active" : ""}">${word}</span>`)
  .join(" ");
