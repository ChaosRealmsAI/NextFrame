// Forwards the app-eval command to the shared desktop app command handler.
import { run as runApp } from "./app.js";

export async function run(argv: any) {
  return runApp(["eval", ...argv]);
}
