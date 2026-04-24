import { tracks } from "./mock.js";

const timeline = document.querySelector("#timeline");
const selected = document.querySelector("#selected");
const field = document.querySelector("#field");

timeline.innerHTML = tracks.map(([id, name]) => `
  <div class="row" data-track="${id}">
    <div class="label">${id}</div>
    <div class="clip">${name}</div>
  </div>
`).join("");

let i = 0;
setInterval(() => {
  i = (i + 1) % tracks.length;
  const [id, name] = tracks[i];
  selected.textContent = id;
  field.textContent = id.includes("subtitle") ? "params.words[0].text: One JSON..." : `track: ${name}`;
}, 1500);
