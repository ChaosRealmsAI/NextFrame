import http from "node:http";
import { existsSync } from "node:fs";
import { emit, parseFlags } from "../_helpers/_io.js";

const APP_HOST = "127.0.0.1";
const APP_PORT = 19820;
const DEFAULT_TIMEOUT_MS = 10000;

const HELP = `usage: nextframe app <subcommand>

Subcommands:
  nextframe app eval <js>
  nextframe app screenshot [--out=path.png]
  nextframe app diagnose
  nextframe app navigate <project> <episode> <segment>
  nextframe app click <x> <y>
  nextframe app status`;

export async function run(argv) {
  const subcommand = argv[0];
  if (!subcommand || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    process.stdout.write(HELP + "\n");
    return 0;
  }

  try {
    if (subcommand === "eval") return await runEval(argv.slice(1));
    if (subcommand === "screenshot") return await runScreenshot(argv.slice(1));
    if (subcommand === "diagnose") return await runDiagnose(argv.slice(1));
    if (subcommand === "navigate") return await runNavigate(argv.slice(1));
    if (subcommand === "click") return await runClick(argv.slice(1));
    if (subcommand === "status") return await runStatus(argv.slice(1));

    process.stderr.write(`unknown app subcommand: ${subcommand}\n\n${HELP}\n`);
    return 3;
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    return 2;
  }
}

async function runEval(argv) {
  const { positional, flags } = parseFlags(argv);
  const script = positional.join(" ").trim();
  if (!script) {
    emit(
      {
        ok: false,
        error: {
          code: "USAGE",
          message: "usage: nextframe app eval <js>",
        },
      },
      flags,
    );
    return 3;
  }

  const timeoutMs = parseTimeout(flags.timeout);
  const result = await appRequest("/eval", {
    method: "POST",
    body: script,
    contentType: "text/plain; charset=utf-8",
    timeoutMs,
  });

  emit({ ok: true, value: result }, flags);
  return 0;
}

async function runScreenshot(argv) {
  const { flags } = parseFlags(argv);
  const outPath = typeof flags.out === "string" ? flags.out : "/tmp/nf-screenshot.png";
  const query = `?out=${encodeURIComponent(outPath)}`;
  const result = await appJsonRequest(`/screenshot${query}`);

  if (!existsSync(outPath)) {
    emit(
      {
        ok: false,
        error: {
          code: "CAPTURE_FAILED",
          message: `screenshot request completed but ${outPath} was not written`,
        },
      },
      flags,
    );
    return 2;
  }

  if (flags.json) {
    emit({ ok: true, value: result }, flags);
  } else {
    process.stdout.write(`${result.path || outPath}\n`);
  }
  return 0;
}

async function runDiagnose(argv) {
  const { flags } = parseFlags(argv);
  const result = await appJsonRequest("/diagnose");
  emit({ ok: true, value: result }, flags);
  return 0;
}

async function runNavigate(argv) {
  const { positional, flags } = parseFlags(argv);
  const [project, episode, segment] = positional;
  const view = typeof flags.view === "string" ? flags.view : "editor";

  if (!project) {
    emit(
      {
        ok: false,
        error: {
          code: "USAGE",
          message: "usage: nextframe app navigate <project> <episode> <segment> [--view=editor|project]",
        },
      },
      flags,
    );
    return 3;
  }

  const payload = { view, project, episode: episode || null, segment: segment || null };
  const result = await appJsonRequest("/navigate", {
    method: "POST",
    body: JSON.stringify(payload),
    contentType: "application/json; charset=utf-8",
    timeoutMs: parseTimeout(flags.timeout),
  });

  emit({ ok: true, value: result }, flags);
  return 0;
}

async function runClick(argv) {
  const { positional, flags } = parseFlags(argv);
  const x = Number(positional[0]);
  const y = Number(positional[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    emit(
      {
        ok: false,
        error: {
          code: "USAGE",
          message: "usage: nextframe app click <x> <y>",
        },
      },
      flags,
    );
    return 3;
  }

  const js = `(function() {
    var x = ${JSON.stringify(x)};
    var y = ${JSON.stringify(y)};
    var target = document.elementFromPoint(x, y);
    if (!target) {
      throw new Error("no element at point " + x + "," + y);
    }
    var init = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
    ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach(function(type) {
      var eventCtor = type.startsWith("pointer") && typeof PointerEvent === "function" ? PointerEvent : MouseEvent;
      target.dispatchEvent(new eventCtor(type, init));
    });
    return {
      tagName: target.tagName || null,
      id: target.id || null,
      className: typeof target.className === "string" ? target.className : ""
    };
  })()`;
  const result = await appRequest("/eval", {
    method: "POST",
    body: js,
    contentType: "text/plain; charset=utf-8",
    timeoutMs: parseTimeout(flags.timeout),
  });

  emit({ ok: true, value: parseMaybeJson(result) }, flags);
  return 0;
}

async function runStatus(argv) {
  const { flags } = parseFlags(argv);
  const result = await appJsonRequest("/status");
  const value = {
    running: true,
    view: result.viewActive || "unknown",
    title: result.title || null,
    project: result.currentProject ?? null,
    episode: result.currentEpisode ?? null,
    segment: result.currentSegment ?? null,
  };
  emit({ ok: true, value }, flags);
  return 0;
}

function parseTimeout(value) {
  const timeoutMs = Number(value);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
}

async function appJsonRequest(path, options = {}) {
  const text = await appRequest(path, options);
  const parsed = parseMaybeJson(text);
  if (typeof parsed === "string") {
    throw new Error(parsed);
  }
  return parsed;
}

function parseMaybeJson(value) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return value;
  }
}

function appRequest(path, options = {}) {
  const body = typeof options.body === "string" ? options.body : "";
  const method = options.method || (body ? "POST" : "GET");
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const headers = {};
  if (body) {
    headers["Content-Type"] = options.contentType || "text/plain; charset=utf-8";
    headers["Content-Length"] = Buffer.byteLength(body);
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: APP_HOST,
        port: APP_PORT,
        path,
        method,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if ((res.statusCode || 500) >= 400) {
            reject(new Error(data || `desktop app returned HTTP ${res.statusCode}`));
            return;
          }
          resolve(data);
        });
      },
    );

    req.on("error", (error) => {
      if (error.code === "ECONNREFUSED") {
        reject(new Error("desktop app not running on port 19820"));
        return;
      }
      reject(error);
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`desktop app request timed out after ${timeoutMs}ms`));
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}
