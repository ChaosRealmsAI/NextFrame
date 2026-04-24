import { checks } from "./mock.js";

document.querySelector("#panel").innerHTML = `
  <b>Export complete</b>
  ${checks.map((item) => `<code>${item}</code>`).join("")}
`;
