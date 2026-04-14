// Minimal HTTP preview server for nextframe-cli.
// Routes:
//   GET  /                              → preview.html
//   GET  /app.js                        → app.js
//   GET  /api/scenes                    → list scene metadata
//   GET  /api/timeline?path=...         → load timeline
//   POST /api/timeline?path=...         → save timeline (body JSON)
//   GET  /api/frame?path=...&t=...      → render single frame PNG
//   POST /api/render {path, out}        → render full mp4
//   GET  /api/mp4?path=...              → serve mp4 file
//   GET  /api/gantt?path=...            → ascii gantt
//   POST /api/ai {path, prompt}         → call sonnet via claude -p to edit timeline

import { createServer } from "node:http";
import { readFile, writeFile, stat } from "node:fs/promises";
import { resolve as resolvePath, dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { resolveTimeline } from "../src/engine/legacy/time.js";
import { listSources, readSourceJson } from "../src/commands/_helpers/_source.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, "..");
const PORT = Number(process.env.PORT || 5173);
const WORKSPACE_ROOT = resolvePath(process.env.NEXTFRAME_WORKSPACE_ROOT || process.cwd());

const MIME = {
  html: "text/html; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  png: "image/png",
  mp4: "video/mp4",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
};

async function loadLegacyRenderer() {
  return import("../src/engine/legacy/render.js");
}

async function loadMp4Exporter() {
  return import("../src/targets/ffmpeg-mp4.js");
}

async function loadSceneRegistry() {
  return import("../src/scenes/index.js");
}

async function loadLegacyValidator() {
  return import("../src/engine/legacy/validate.js");
}

function json(res, code, obj) {
  res.writeHead(code, { "content-type": MIME.json });
  res.end(JSON.stringify(obj));
}

function ok(res, obj) {
  json(res, 200, { ok: true, value: obj });
}

function err(res, code, message, hint) {
  json(res, code, { ok: false, error: { message, hint } });
}

async function serveFile(res, abs, ext) {
  try {
    const body = await readFile(abs);
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
    res.end(body);
  } catch (e) {
    err(res, 404, `not found: ${abs}`);
  }
}

async function readBody(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) return resolvePromise({});
      try {
        resolvePromise(JSON.parse(text));
      } catch (e) {
        rejectPromise(new Error(`bad json: ${e.message}`));
      }
    });
    req.on("error", rejectPromise);
  });
}

function resolveTimelinePath(q) {
  const p = q.path;
  if (!p) return null;
  const abs = resolvePath(WORKSPACE_ROOT, p);
  const relPath = relative(WORKSPACE_ROOT, abs);
  if (relPath !== "" && (relPath.startsWith("..") || isAbsolute(relPath))) return "__BLOCKED__";
  return abs;
}

function assertSafePath(res, abs) {
  if (!abs) { err(res, 400, "missing path"); return false; }
  if (abs === "__BLOCKED__") { err(res, 403, "path outside workspace", `allowed root: ${WORKSPACE_ROOT}`); return false; }
  return true;
}

function resolveAbsoluteInput(raw) {
  if (!raw) return null;
  return isAbsolute(raw) ? raw : resolvePath(WORKSPACE_ROOT, raw);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;
    const q = Object.fromEntries(url.searchParams);
    const method = req.method || "GET";

    // Static
    if (method === "GET" && path === "/") {
      return serveFile(res, join(HERE, "preview.html"), "html");
    }
    if (method === "GET" && path === "/app.js") {
      return serveFile(res, join(HERE, "app.js"), "js");
    }
    if (method === "GET" && path === "/app.css") {
      return serveFile(res, join(HERE, "app.css"), "css");
    }

    // Gallery + scene preview
    if (method === "GET" && path === "/gallery") {
      return serveFile(res, join(HERE, "gallery.html"), "html");
    }
    if (method === "GET" && path.startsWith("/gallery/")) {
      return serveFile(res, join(HERE, "scene-detail.html"), "html");
    }
    if (method === "GET" && path === "/scene-detail") {
      return serveFile(res, join(HERE, "scene-detail.html"), "html");
    }
    if (method === "GET" && path === "/scene-editor") {
      return serveFile(res, join(HERE, "scene-editor-prototype.html"), "html");
    }
    if (method === "GET" && path.startsWith("/thumbs/")) {
      const file = path.replace("/thumbs/", "");
      if (file.includes("..") || file.includes("/")) return err(res, 403, "bad path");
      return serveFile(res, join(HERE, "thumbs", file), "png");
    }

    // Scene preview: render a single scene with custom params
    if (method === "GET" && path === "/api/scene-preview") {
      const sceneId = q.id;
      if (!sceneId) return err(res, 400, "missing id");
      const { REGISTRY, META_TABLE } = await loadSceneRegistry();
      const entry = REGISTRY.get(sceneId);
      if (!entry) return err(res, 404, `unknown scene: ${sceneId}`);
      const t = Number(q.t ?? (entry.META.duration_hint || 5) * 0.4);
      const width = Number(q.w) || 960;
      const height = Math.round(width / (16/9));
      const params = {};
      const meta = META_TABLE[sceneId];
      if (meta && meta.params) {
        for (const p of meta.params) {
          if (q[p.name] !== undefined) {
            if (p.type === "number") params[p.name] = Number(q[p.name]);
            else if (p.type === "boolean") params[p.name] = q[p.name] === "true";
            else params[p.name] = q[p.name];
          }
        }
      }
      // Build a minimal single-clip timeline and use renderAt
      const miniTimeline = {
        schema: "nextframe/v0.1",
        duration: (entry.META.duration_hint || 10),
        background: "#1a1510",
        project: { width, height, fps: 30 },
        tracks: [{ id: "v1", kind: "video", clips: [{ id: "preview", start: 0, dur: (entry.META.duration_hint || 10), scene: sceneId, params }] }],
      };
      const { renderAt } = await loadLegacyRenderer();
      const frame = renderAt(miniTimeline, t, { width, height });
      if (!frame.ok) return err(res, 500, frame.error.message);
      const buf = await frame.canvas.encode("png");
      res.writeHead(200, { "content-type": MIME.png, "cache-control": "no-store" });
      res.end(buf);
      return;
    }

    // API
    if (method === "GET" && path === "/api/scenes") {
      const { listScenes } = await loadSceneRegistry();
      return ok(res, { scenes: listScenes() });
    }

    if (method === "GET" && path === "/api/timeline") {
      const abs = resolveTimelinePath(q);
      if (!assertSafePath(res, abs)) return;
      const text = await readFile(abs, "utf8");
      const timeline = JSON.parse(text);
      const { validateTimeline } = await loadLegacyValidator();
      const validation = validateTimeline(timeline, { projectDir: dirname(abs) });
      return ok(res, { path: abs, timeline, validation });
    }

    if (method === "GET" && path === "/api/source") {
      const abs = resolveAbsoluteInput(q.path);
      if (!abs) return err(res, 400, "missing path");
      const source = await readSourceJson(abs);
      return ok(res, source);
    }

    if (method === "GET" && path === "/api/source-list") {
      const library = resolveAbsoluteInput(q.library);
      if (!library) return err(res, 400, "missing library");
      const rows = await listSources(library);
      return ok(res, rows);
    }

    if (method === "POST" && path === "/api/timeline") {
      const abs = resolveTimelinePath(q);
      if (!assertSafePath(res, abs)) return;
      const body = await readBody(req);
      if (!body.timeline) return err(res, 400, "body.timeline required");
      const { validateTimeline } = await loadLegacyValidator();
      const validation = validateTimeline(body.timeline, { projectDir: dirname(abs) });
      if (!validation.ok) return json(res, 200, { ok: false, validation });
      await writeFile(abs, JSON.stringify(body.timeline, null, 2) + "\n");
      return ok(res, { path: abs, validation });
    }

    if (method === "GET" && path === "/api/frame") {
      const abs = resolveTimelinePath(q);
      if (!assertSafePath(res, abs)) return;
      const t = Number(q.t ?? 0);
      if (!Number.isFinite(t)) return err(res, 400, "bad t");
      const text = await readFile(abs, "utf8");
      const timeline = JSON.parse(text);
      const r = resolveTimeline(timeline);
      if (!r.ok) return err(res, 400, r.error.message, r.error.hint);
      const width = Number(q.w) || 960;
      const height = Math.round(width / 1.7777);
      const { renderAt } = await loadLegacyRenderer();
      const frame = renderAt(r.value, t, { width, height });
      if (!frame.ok) return err(res, 500, frame.error.message);
      const buf = await frame.canvas.encode("png");
      res.writeHead(200, { "content-type": MIME.png, "cache-control": "no-store" });
      res.end(buf);
      return;
    }

    if (method === "GET" && path === "/api/gantt") {
      const abs = resolveTimelinePath(q);
      if (!assertSafePath(res, abs)) return;
      const text = await readFile(abs, "utf8");
      const timeline = JSON.parse(text);
      const r = resolveTimeline(timeline);
      if (!r.ok) return err(res, 400, r.error.message);
      const { renderGantt } = await import("../src/views/gantt.js").catch(() => ({ renderGantt: null }));
      let chart = "(gantt view missing)";
      if (renderGantt) chart = renderGantt(r.value, { width: Number(q.width) || 80 });
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end(chart);
      return;
    }

    if (method === "POST" && path === "/api/render") {
      const body = await readBody(req);
      const abs = resolveTimelinePath({ path: body.path });
      if (!assertSafePath(res, abs)) return;
      const outPath = resolveTimelinePath({
        path: body.out || join(dirname(abs), `nextframe-${Date.now()}.mp4`),
      });
      if (!assertSafePath(res, outPath)) return;
      const text = await readFile(abs, "utf8");
      const timeline = JSON.parse(text);
      const start = Date.now();
      const { exportMP4 } = await loadMp4Exporter();
      const r = await exportMP4(timeline, outPath);
      if (!r.ok) return err(res, 500, r.error.message, r.error.hint);
      const st = await stat(outPath);
      return ok(res, {
        path: outPath,
        size: st.size,
        elapsed_ms: Date.now() - start,
        frames: r.value.framesRendered,
        fps: r.value.fps,
        duration: r.value.duration,
        url: `/api/mp4?path=${encodeURIComponent(outPath)}`,
      });
    }

    if (method === "GET" && path === "/api/mp4") {
      const abs = resolveTimelinePath(q);
      if (!assertSafePath(res, abs)) return;
      return serveFile(res, abs, "mp4");
    }

    if (method === "POST" && path === "/api/ai") {
      const body = await readBody(req);
      const prompt = body.prompt || "";
      const tlPath = resolveTimelinePath({ path: body.path });
      if (!assertSafePath(res, tlPath)) return;
      if (!prompt) return err(res, 400, "prompt required");
      // Kick off a background claude -p subprocess with a constrained system prompt
      // that tells sonnet to edit the timeline via shell commands. Return immediately
      // with a job id; client polls /api/ai-status.
      const jobId = `job-${Date.now()}`;
      aiJobs[jobId] = { status: "running", logs: [], done: false };
      runSonnetEdit(tlPath, prompt, jobId);
      return ok(res, { jobId });
    }

    if (method === "GET" && path === "/api/ai-status") {
      const jobId = q.id;
      const job = aiJobs[jobId];
      if (!job) return err(res, 404, "unknown job");
      return ok(res, job);
    }

    // ─── Pipeline display page ───────────────────────────────────────────
    if (method === "GET" && (path === "/pipeline" || path.startsWith("/pipeline/"))) {
      return serveFile(res, join(HERE, "pipeline.html"), "html");
    }

    // ─── Pipeline API (read-only) ─────────────────────────────────────────
    if (method === "GET" && path === "/api/pipeline") {
      const project = q.project;
      const episode = q.episode;
      if (!project || !episode) return err(res, 400, "project and episode required");
      const projectRoot = resolvePath(
        process.env.NEXTFRAME_PROJECT_ROOT || join(homedir(), "NextFrame", "projects"),
        project, episode
      );
      try {
        const text = await readFile(join(projectRoot, "pipeline.json"), "utf8");
        return ok(res, JSON.parse(text));
      } catch (e) {
        // Return empty pipeline if file doesn't exist
        return ok(res, { version: "0.4", script: { principles: {}, arc: [], segments: [] }, audio: { voice: null, speed: 1.0, segments: [] }, atoms: [], outputs: [] });
      }
    }

    if (method === "GET" && path === "/api/project-config") {
      const project = q.project;
      if (!project) return err(res, 400, "project required");
      const projectFile = resolvePath(
        process.env.NEXTFRAME_PROJECT_ROOT || join(homedir(), "NextFrame", "projects"),
        project, "project.json"
      );
      try {
        const text = await readFile(projectFile, "utf8");
        return ok(res, JSON.parse(text));
      } catch (e) {
        return ok(res, { name: project, shared: {} });
      }
    }

    return err(res, 404, `no route for ${method} ${path}`);
  } catch (e) {
    return err(res, 500, e.message, e.stack?.split("\n").slice(0, 3).join(" "));
  }
});

// ─── Sonnet subprocess wrapper ─────────────────────────────────────────────
const aiJobs = {};

function runSonnetEdit(tlPath, userPrompt, jobId) {
  const sysPrompt = buildSonnetSystemPrompt(tlPath);
  const fullPrompt = `${sysPrompt}\n\nUser request: ${userPrompt}\n\nEdit the timeline at ${tlPath} to match the request. Use nextframe-cli commands via Bash. When done, print exactly DONE on its own line.`;
  // Use claude CLI; run from /tmp to avoid repo-level hooks.
  const proc = spawn(
    "claude",
    [
      "-p",
      "--model", "sonnet",
      "--max-turns", "30",
      "--allowedTools", "Bash Read Write Edit",
      "--append-system-prompt", sysPrompt,
      fullPrompt,
    ],
    {
      cwd: "/tmp",
      env: { ...process.env, CLAUDE_CODE_SIMPLE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  aiJobs[jobId].pid = proc.pid;
  proc.stdout.on("data", (chunk) => {
    aiJobs[jobId].logs.push({ stream: "stdout", text: chunk.toString("utf8") });
  });
  proc.stderr.on("data", (chunk) => {
    aiJobs[jobId].logs.push({ stream: "stderr", text: chunk.toString("utf8") });
  });
  proc.on("close", (code) => {
    aiJobs[jobId].done = true;
    aiJobs[jobId].exitCode = code;
    aiJobs[jobId].status = code === 0 ? "done" : "failed";
  });
  proc.on("error", (e) => {
    aiJobs[jobId].done = true;
    aiJobs[jobId].status = "failed";
    aiJobs[jobId].error = e.message;
  });
}

function buildSonnetSystemPrompt(tlPath) {
  return `You are an AI video director using nextframe-cli.

TOOLS AVAILABLE (via Bash):
  node ${ROOT}/bin/nextframe.js scenes                              # list all 33 scenes + META
  node ${ROOT}/bin/nextframe.js validate <timeline.json>             # 6-gate safety
  node ${ROOT}/bin/nextframe.js frame <timeline.json> <t> <png>     # single frame
  node ${ROOT}/bin/nextframe.js describe <timeline.json> <t>        # what is visible at t (JSON)
  node ${ROOT}/bin/nextframe.js gantt <timeline.json>               # ASCII timeline view
  node ${ROOT}/bin/nextframe.js render <timeline.json> <mp4>        # full mp4 export

TIMELINE SCHEMA: see ${ROOT}/spec/architecture/04-interfaces.md (tracks[].clips[] with start/dur/scene/params).
Symbolic time allowed: {at:'marker-id'} | {after:'clip-id', gap:0.5} etc.

PROCESS (follow exactly):
  1. Read the current timeline at ${tlPath}
  2. Think about what scenes + params + timing match the user's request
  3. Edit the timeline (Write tool) — only change JSON
  4. Validate with 'nextframe validate'
  5. If warnings exist, list them
  6. Render a low-res probe frame at t=duration/2 to sanity-check
  7. Print DONE on its own line when finished

RULES:
  - Never touch src/ or bin/ — only the user timeline JSON
  - Preserve schema:"nextframe/v0.1" and project fields
  - Keep duration ≥ 6s for meaningful output
  - Always re-validate after any edit`;
}

export { server, WORKSPACE_ROOT, resolveTimelinePath };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => {
    process.stdout.write(`nextframe preview server at http://localhost:${PORT}\n`);
  });
}
