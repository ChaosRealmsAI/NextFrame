import "./components/nf-demo";
import "./components/nf-track";
import { adoptedStyleSheetsSupported } from "./components/nf-perf";
import "./components/nf-perf";

type TestKey = "A" | "B" | "C" | "D";
type Status = "pass" | "fail";

interface PocResult {
  key: TestKey;
  status: Status;
  title: string;
  values: Record<string, string | number | boolean>;
}

declare global {
  interface Window {
    runPocTest: (key: TestKey) => Promise<PocResult>;
    runPocTests: () => Promise<Record<TestKey, PocResult>>;
    cleanupGlobalPollution: () => void;
  }
}

const expected = {
  purple: "rgb(167, 139, 250)",
  red: "rgb(255, 0, 0)",
  amber: "rgb(224, 183, 108)",
  teal: "rgb(123, 201, 181)",
};

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function flushStyle() {
  await nextFrame();
  await nextFrame();
}

function setAccent(value: string) {
  document.documentElement.style.setProperty("--accent", value);
}

function resetAccent() {
  document.documentElement.style.removeProperty("--accent");
}

function styleOf<T extends Element>(element: T | null, property: keyof CSSStyleDeclaration) {
  if (!element) {
    throw new Error(`Missing element for ${String(property)}`);
  }

  return getComputedStyle(element)[property] as string;
}

function panel(key: TestKey) {
  const element = document.querySelector<HTMLElement>(`[data-test="${key}"]`);
  if (!element) {
    throw new Error(`Missing panel ${key}`);
  }
  return element;
}

function writeResult(result: PocResult) {
  const element = panel(result.key);
  element.dataset.status = result.status;

  const status = element.querySelector<HTMLElement>("[data-role='status']");
  if (status) {
    status.textContent = result.status.toUpperCase();
  }

  const rows = element.querySelector<HTMLElement>("[data-role='values']");
  if (rows) {
    rows.innerHTML = Object.entries(result.values)
      .map(([name, value]) => `<div><span>${name}</span><code>${String(value)}</code></div>`)
      .join("");
  }

  return result;
}

function shadowQuery<T extends Element>(selector: string, inner: string): T {
  const host = document.querySelector<HTMLElement>(selector);
  const found = host?.shadowRoot?.querySelector<T>(inner);
  if (!found) {
    throw new Error(`Missing ${selector} ${inner}`);
  }
  return found;
}

function cleanupGlobalPollution() {
  document.getElementById("global-pollution-style")?.remove();
}

async function testA(): Promise<PocResult> {
  cleanupGlobalPollution();
  setAccent("#a78bfa");
  await flushStyle();

  const box = shadowQuery<HTMLElement>("nf-demo", ".box");
  const initialBackground = styleOf(box, "backgroundColor");

  setAccent("#ff0000");
  await flushStyle();

  const liveBackground = styleOf(box, "backgroundColor");
  const pass = initialBackground === expected.purple && liveBackground === expected.red;

  return writeResult({
    key: "A",
    title: "Shadow var(--accent) penetration and live :root update",
    status: pass ? "pass" : "fail",
    values: {
      initialBackground,
      expectedInitial: expected.purple,
      liveBackground,
      expectedLive: expected.red,
    },
  });
}

async function testB(): Promise<PocResult> {
  cleanupGlobalPollution();

  const style = document.createElement("style");
  style.id = "global-pollution-style";
  style.textContent = "* { color: red !important; }";
  document.head.append(style);
  await flushStyle();

  const tab = shadowQuery<HTMLElement>("nf-demo", ".tab.cur");
  const shadowTabColor = styleOf(tab, "color");
  const documentProbeColor = styleOf(document.querySelector("[data-global-probe]"), "color");
  const pass = shadowTabColor !== expected.red && documentProbeColor === expected.red;

  return writeResult({
    key: "B",
    title: "Global * red !important does not penetrate shadow text",
    status: pass ? "pass" : "fail",
    values: {
      documentProbeColor,
      shadowTabColor,
      forbiddenColor: expected.red,
    },
  });
}

async function testC(): Promise<PocResult> {
  cleanupGlobalPollution();
  setAccent("#a78bfa");
  await flushStyle();

  const scene = shadowQuery<HTMLElement>('nf-track[kind="scene"]', ".stripe");
  const text = shadowQuery<HTMLElement>('nf-track[kind="text"]', ".stripe");
  const audio = shadowQuery<HTMLElement>('nf-track[kind="audio"]', ".stripe");

  const sceneBackground = styleOf(scene, "backgroundColor");
  const textBackground = styleOf(text, "backgroundColor");
  const audioBackground = styleOf(audio, "backgroundColor");
  const pass =
    sceneBackground === expected.purple &&
    textBackground === expected.amber &&
    audioBackground === expected.teal;

  return writeResult({
    key: "C",
    title: ":host([kind]) switches scene/text/audio stripe backgrounds",
    status: pass ? "pass" : "fail",
    values: {
      sceneBackground,
      textBackground,
      audioBackground,
    },
  });
}

async function measureCreate(tagName: "nf-perf-root" | "nf-perf-adopted", label: string) {
  const lab = document.querySelector<HTMLElement>("#perf-lab");
  if (!lab) {
    throw new Error("Missing #perf-lab");
  }

  const samples: number[] = [];
  for (let sample = 0; sample < 12; sample += 1) {
    lab.replaceChildren();
    performance.mark(`${label}-start`);
    for (let index = 0; index < 10; index += 1) {
      lab.append(document.createElement(tagName));
    }
    forcePerfRead(lab);
    performance.mark(`${label}-end`);
    performance.measure(`${label}-${sample}`, `${label}-start`, `${label}-end`);
    const entries = performance.getEntriesByName(`${label}-${sample}`);
    samples.push(entries[entries.length - 1]?.duration ?? 0);
  }

  samples.sort((a, b) => a - b);
  return Number(samples[Math.floor(samples.length / 2)].toFixed(3));
}

function forcePerfRead(lab: HTMLElement) {
  for (const child of Array.from(lab.children)) {
    const chip = child.shadowRoot?.querySelector<HTMLElement>(".chip");
    if (chip) {
      getComputedStyle(chip).backgroundColor;
    }
  }
  lab.offsetHeight;
}

async function measureRepaint(tagName: "nf-perf-root" | "nf-perf-adopted", label: string) {
  const lab = document.querySelector<HTMLElement>("#perf-lab");
  if (!lab) {
    throw new Error("Missing #perf-lab");
  }

  lab.replaceChildren();
  for (let index = 0; index < 10; index += 1) {
    lab.append(document.createElement(tagName));
  }
  setAccent("#a78bfa");
  await flushStyle();

  performance.mark(`${label}-repaint-start`);
  setAccent("#ff0000");
  forcePerfRead(lab);
  const firstChip = lab.firstElementChild?.shadowRoot?.querySelector<HTMLElement>(".chip");
  const firstChipBackground = styleOf(firstChip ?? null, "backgroundColor");
  performance.mark(`${label}-repaint-end`);
  performance.measure(`${label}-repaint`, `${label}-repaint-start`, `${label}-repaint-end`);
  const repaintEntries = performance.getEntriesByName(`${label}-repaint`);

  return {
    duration: Number((repaintEntries[repaintEntries.length - 1]?.duration ?? 0).toFixed(3)),
    firstChipBackground,
  };
}

async function testD(): Promise<PocResult> {
  cleanupGlobalPollution();
  resetAccent();
  await flushStyle();

  const rootCreateMs = await measureCreate("nf-perf-root", "root-link-style");
  const adoptedCreateMs = await measureCreate("nf-perf-adopted", "adopted-sheet");
  const rootRepaint = await measureRepaint("nf-perf-root", "root-link-style");
  const adoptedRepaint = await measureRepaint("nf-perf-adopted", "adopted-sheet");
  const pass =
    rootRepaint.firstChipBackground === expected.red &&
    adoptedRepaint.firstChipBackground === expected.red &&
    adoptedStyleSheetsSupported();

  resetAccent();

  return writeResult({
    key: "D",
    title: "adoptedStyleSheets vs root-var style performance",
    status: pass ? "pass" : "fail",
    values: {
      adoptedStyleSheetsSupported: adoptedStyleSheetsSupported(),
      rootCreate10MedianMs: rootCreateMs,
      adoptedCreate10MedianMs: adoptedCreateMs,
      rootRepaint10Ms: rootRepaint.duration,
      adoptedRepaint10Ms: adoptedRepaint.duration,
      repaintColor: adoptedRepaint.firstChipBackground,
    },
  });
}

const tests = {
  A: testA,
  B: testB,
  C: testC,
  D: testD,
};

window.cleanupGlobalPollution = cleanupGlobalPollution;

window.runPocTest = async (key: TestKey) => {
  const result = await tests[key]();
  document.body.dataset.lastTest = key;
  return result;
};

window.runPocTests = async () => {
  const results = {} as Record<TestKey, PocResult>;
  for (const key of ["A", "B", "C", "D"] as TestKey[]) {
    results[key] = await window.runPocTest(key);
    if (key === "B") {
      cleanupGlobalPollution();
    }
  }
  return results;
};
