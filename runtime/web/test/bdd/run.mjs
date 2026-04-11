import "./index.js";
import { run } from "./runner.js";

const exitCode = await run();
process.exit(exitCode);
