"use strict";

const fixtures = require("./test-fixtures.json");
const { renderGantt } = require("./index.js");

fixtures.forEach((timeline, index) => {
  if (index > 0) {
    process.stdout.write("\n");
  }
  process.stdout.write(`=== Fixture ${index + 1}: ${timeline.title} ===\n`);
  process.stdout.write(`${renderGantt(timeline)}\n`);
});
