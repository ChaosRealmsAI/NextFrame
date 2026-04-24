import { lines } from "./mock.js";

document.querySelector("#terminal").innerHTML = lines
  .map((line, index) => `<div class="${index === lines.length - 1 ? "ok" : ""}">$ ${line}</div>`)
  .join("");
