import { edits } from "./mock.js";

const field = document.querySelector("#field");
const caption = document.querySelector("#caption");
let index = 0;

setInterval(() => {
  index = (index + 1) % edits.length;
  field.value = edits[index];
  caption.textContent = edits[index];
}, 2200);
