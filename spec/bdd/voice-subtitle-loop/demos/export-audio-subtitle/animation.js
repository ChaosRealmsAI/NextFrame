import { checks } from "./mock.js";

const list = document.querySelector("#checks");
list.innerHTML = checks.map((check) => `<li>${check}</li>`).join("");

let count = 0;
setInterval(() => {
  const items = [...list.querySelectorAll("li")];
  items.forEach((item, index) => item.classList.toggle("done", index <= count));
  count = (count + 1) % checks.length;
}, 1800);
