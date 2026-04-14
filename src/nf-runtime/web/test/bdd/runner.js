import { inspect, isDeepStrictEqual } from "node:util";

const suites = [];
let currentSuite = null;

class AssertionError extends Error {
  constructor(message, { actual, expected, operator } = {}) {
    super(message);
    this.name = "AssertionError";
    this.actual = actual;
    this.expected = expected;
    this.operator = operator;
  }
}

class SkipTestError extends Error {
  constructor(message) {
    super(message);
    this.name = "SkipTestError";
  }
}

function formatValue(value) {
  return inspect(value, {
    depth: 8,
    breakLength: 80,
    sorted: true,
  });
}

function failAssertion(operator, actual, expected, message) {
  throw new AssertionError(
    message || `Expected ${formatValue(actual)} ${operator} ${formatValue(expected)}`,
    { actual, expected, operator },
  );
}

function ensureSuiteContext() {
  if (!currentSuite) {
    throw new Error("it(name, fn) must be called inside describe(name, fn)");
  }
}

export function describe(name, fn) {
  if (typeof name !== "string" || name.length === 0) {
    throw new TypeError("describe(name, fn) requires a non-empty string name");
  }

  if (typeof fn !== "function") {
    throw new TypeError(`describe("${name}", fn) requires a function`);
  }

  const suite = {
    name,
    tests: [],
  };
  const parentSuite = currentSuite;

  suites.push(suite);
  currentSuite = suite;
  try {
    fn();
  } finally {
    currentSuite = parentSuite;
  }
}

export function it(name, fn) {
  ensureSuiteContext();

  if (typeof name !== "string" || name.length === 0) {
    throw new TypeError("it(name, fn) requires a non-empty string name");
  }

  if (typeof fn !== "function") {
    throw new TypeError(`it("${name}", fn) requires a function`);
  }

  currentSuite.tests.push({
    name,
    fn,
    skipped: false,
  });
}

it.skip = function skipCase(name, fn = () => {}) {
  ensureSuiteContext();

  currentSuite.tests.push({
    name,
    fn,
    skipped: true,
  });
};

export function skip(message = "Skipped") {
  throw new SkipTestError(message);
}

export function expect(actual) {
  return {
    toBe(expected, message) {
      if (!Object.is(actual, expected)) {
        failAssertion("to be", actual, expected, message);
      }
    },
    toEqual(expected, message) {
      if (!isDeepStrictEqual(actual, expected)) {
        failAssertion("to equal", actual, expected, message);
      }
    },
    toBeTruthy(message) {
      if (!actual) {
        failAssertion("to be truthy", actual, true, message);
      }
    },
    toBeGreaterThan(expected, message) {
      if (!(actual > expected)) {
        failAssertion("to be greater than", actual, expected, message);
      }
    },
  };
}

export async function run() {
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const suite of suites) {
    console.log(suite.name);

    for (const test of suite.tests) {
      if (test.skipped) {
        skipped += 1;
        console.log(`  - ${test.name} (skipped)`);
        continue;
      }

      try {
        await test.fn();
        passed += 1;
        console.log(`  ✓ ${test.name}`);
      } catch (error) {
        if (error instanceof SkipTestError) {
          skipped += 1;
          console.log(`  - ${test.name} (skipped: ${error.message})`);
          continue;
        }

        failed += 1;
        console.log(`  ✗ ${test.name}`);
        console.log(`    ${error?.message || String(error)}`);

        if (error instanceof AssertionError) {
          console.log(`    expected: ${formatValue(error.expected)}`);
          console.log(`    actual:   ${formatValue(error.actual)}`);
        }
      }
    }
  }

  const summary = failed > 0
    ? `✗ ${failed} failed, ${passed} passed${skipped > 0 ? `, ${skipped} skipped` : ""}`
    : `✓ ${passed} passed, 0 failed${skipped > 0 ? `, ${skipped} skipped` : ""}`;

  console.log(summary);
  return failed > 0 ? 1 : 0;
}
