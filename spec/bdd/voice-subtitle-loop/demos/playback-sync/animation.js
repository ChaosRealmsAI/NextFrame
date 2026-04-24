import { captions } from "./mock.js";

const subtitle = document.querySelector("#subtitle");
let index = 0;
subtitle.textContent = captions[0];

setInterval(() => {
  index = (index + 1) % captions.length;
  subtitle.textContent = captions[index];
}, 2500);
