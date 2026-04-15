// Controls the desktop pipeline view over the local app HTTP API.
import http from "node:http";
import { emit, parseFlags } from "../_helpers/_io.js";
import { defaultFixSuggestion, renderCommandHelp } from "../_helpers/help/index.js";

const HOST = "127.0.0.1";
const PORT = 19820;

export async function run(argv: any) {
  const { positional, flags } = parseFlags(argv);
  const [sub] = positional;

  if (!sub || sub === "help" || sub === "--help" || sub === "-h") {
    process.stdout.write(renderCommandHelp("app-pipeline"));
    return 0;
  }
  if (argv[1] === "--help" || argv[1] === "-h") {
    const help = renderCommandHelp(`app-pipeline ${sub}`);
    if (help) {
      process.stdout.write(help);
      return 0;
    }
    return 0;
  }

  try {
    switch (sub) {
      case "navigate": {
        if (typeof flags.project !== "string" || !flags.project.trim()) {
          emit(
            { ok: false, error: { code: "USAGE", message: "usage: nextframe app-pipeline navigate --project=<name> [--episode=<name>]" } },
            flags,
          );
          return 3;
        }
        const result = await httpPost("/navigate", {
          view: "pipeline",
          project: flags.project,
          episode: typeof flags.episode === "string" ? flags.episode : undefined,
        });
        emit({ ok: true, value: result }, flags);
        return 0;
      }
      case "tab": {
        if (typeof flags.tab !== "string" || !flags.tab.trim()) {
          emit(
            { ok: false, error: { code: "USAGE", message: "usage: nextframe app-pipeline tab --tab=<name>" } },
            flags,
          );
          return 3;
        }
        const result = await httpPost("/eval", `switchPipelineStage(${JSON.stringify(flags.tab)})`);
        emit({ ok: true, value: result }, flags);
        return 0;
      }
      case "status": {
        const result = await httpGet("/pipeline/status");
        emit({ ok: true, value: result }, flags);
        return 0;
      }
      case "play": {
        const index = Number(flags.segment) - 1;
        if (!Number.isInteger(index) || index < 0) {
          emit(
            { ok: false, error: { code: "USAGE", message: "usage: nextframe app-pipeline play --segment=<n>" } },
            flags,
          );
          return 3;
        }
        const script = `(() => {
  const buttons = document.querySelectorAll("[data-audio-path]");
  const target = buttons[${index}];
  if (!target) {
    throw new Error("pipeline audio segment not found: ${index + 1}");
  }
  target.click();
  return { segment: ${index + 1}, ok: true };
})()`;
        const result = await httpPost("/eval", script);
        emit({ ok: true, value: result }, flags);
        return 0;
      }
      case "stop": {
        const result = await httpPost(
          "/eval",
          "document.querySelectorAll('.pl-play-btn.playing').forEach((button) => button.click())",
        );
        emit({ ok: true, value: result }, flags);
        return 0;
      }
      default:
        process.stderr.write(`error: unknown app-pipeline subcommand "${sub}"\n`);
        process.stderr.write('Fix: run "nextframe app-pipeline --help" to see supported app-pipeline subcommands\n');
        return 3;
    }
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    process.stderr.write(`Fix: ${defaultFixSuggestion()}\n`);
    return 2;
  }
}

async function httpPost(path: any, body: any) {
  return request(path, {
    method: "POST",
    body,
  });
}

async function httpGet(path: any) {
  return request(path, { method: "GET" });
}

function request(path: any, options: any) {
  const rawBody = options.body;
  const body =
    typeof rawBody === "string" ? rawBody : rawBody === undefined ? "" : JSON.stringify(rawBody);
  const headers = {};
  if (body) {
    headers["Content-Type"] =
      typeof rawBody === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8";
    headers["Content-Length"] = Buffer.byteLength(body);
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: HOST,
        port: PORT,
        path,
        method: options.method,
        headers,
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
          resolve(parseMaybeJson(data));
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

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function parseMaybeJson(value: any) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return value;
  }
}
