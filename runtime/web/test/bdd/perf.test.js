import { createPerfMonitor } from "../../src/preview/perf.js";
import { describe, expect, it } from "./runner.js";

describe("Preview perf monitor", () => {
  it("reports fps percentiles and drops across the latest frame window", () => {
    const perf = createPerfMonitor();

    for (let index = 0; index < 100; index += 1) {
      perf.tick(16);
    }

    for (let index = 0; index < 20; index += 1) {
      perf.tick(40);
    }

    const stats = perf.getStats();
    expect(stats.fps).toBe(50);
    expect(stats.p50Ms).toBe(16);
    expect(stats.p95Ms).toBe(40);
    expect(stats.p99Ms).toBe(40);
    expect(stats.drops).toBe(20);
  });

  it("keeps only the most recent 120 frames and reset clears the monitor", () => {
    const perf = createPerfMonitor();

    for (let index = 0; index < 10; index += 1) {
      perf.tick(40);
    }

    for (let index = 0; index < 120; index += 1) {
      perf.tick(16);
    }

    const rollingStats = perf.getStats();
    expect(rollingStats.p99Ms).toBe(16);
    expect(rollingStats.drops).toBe(0);

    perf.reset();

    expect(perf.getStats()).toEqual({
      fps: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      drops: 0,
    });
  });
});
