// Aggregator for node --test — some Node versions don't auto-discover
// multiple files when given a directory. Importing here ensures the
// whole suite runs with `node --test test/` or `node --test test/index.js`.
import "./smoke.test.js";
import "./architecture.test.js";
import "./scene-contract.test.js";
import "./cli-render.test.js";
import "./cli-export.test.js";
import "./safety-gates.test.js";
import "./cli-timeline-ops.test.js";
import "./ai-tools.test.js";
import "./video-scene.test.js";
