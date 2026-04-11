import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

if (typeof vm.SourceTextModule !== "function") {
  if (process.env.NEXTFRAME_WEB_LINT_VM_MODULES === "1") {
    console.error("error: node:vm SourceTextModule is unavailable in this Node runtime");
    process.exit(1);
  }

  const result = spawnSync(
    process.execPath,
    ["--experimental-vm-modules", process.argv[1], ...process.argv.slice(2)],
    {
      env: {
        ...process.env,
        NEXTFRAME_WEB_LINT_VM_MODULES: "1",
        NODE_NO_WARNINGS: process.env.NODE_NO_WARNINGS ?? "1",
      },
      stdio: "inherit",
    },
  );

  process.exit(result.status ?? 1);
}

const ROOT_DIR = path.resolve(process.cwd(), "runtime/web/src");
const FAILURES = [];
const TODO_WARNINGS = [];

const files = await collectJsFiles(ROOT_DIR);

for (const filePath of files) {
  const source = await readFile(filePath, "utf8");
  checkSyntax(filePath, source);
  scanLines(filePath, source);
}

const todoCount = TODO_WARNINGS.length;

for (const warning of TODO_WARNINGS) {
  console.warn(`warning: ${warning}`);
}

if (FAILURES.length > 0) {
  for (const failure of FAILURES) {
    console.error(`error: ${failure}`);
  }
  process.exit(1);
}

process.stdout.write(
  `Checked ${files.length} JavaScript file(s) under runtime/web/src with ${todoCount} TODO warning(s).\n`,
);

async function collectJsFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJsFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(entryPath);
    }
  }

  return files;
}

function checkSyntax(filePath, source) {
  try {
    new vm.SourceTextModule(source, {
      identifier: pathToFileURL(filePath).href,
    });
  } catch (error) {
    FAILURES.push(`${relativePath(filePath)} syntax error: ${error.message}`);
  }
}

function scanLines(filePath, source) {
  const relPath = relativePath(filePath);
  const lines = source.split("\n");

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;

    if (line.includes("console.log(")) {
      FAILURES.push(`${relPath}:${lineNumber} contains console.log(`);
    }

    if (line.includes("debugger")) {
      FAILURES.push(`${relPath}:${lineNumber} contains debugger`);
    }

    if (line.includes("TODO")) {
      TODO_WARNINGS.push(`${relPath}:${lineNumber} contains TODO`);
    }
  }
}

function relativePath(filePath) {
  return path.relative(process.cwd(), filePath);
}
