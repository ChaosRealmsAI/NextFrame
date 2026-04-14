import { run as runApp } from "./app.js";

export async function run(argv) {
  return runApp(["eval", ...argv]);
}
