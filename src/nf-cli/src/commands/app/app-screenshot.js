// Forwards the app-screenshot command to the shared desktop app command handler.
import { run as runApp } from "./app.js";

export async function run(argv) {
  return runApp(["screenshot", ...argv]);
}
