/* === export-log.js — Recording report tab on home page === */

let exportLogCache = [];

function switchHomeTab(tab) {
  const projTab = document.getElementById("home-tab-projects");
  const expTab = document.getElementById("home-tab-exports");
  const projContent = document.getElementById("home-projects-content");
  const expContent = document.getElementById("home-exports-content");
  if (!projTab || !expTab || !projContent || !expContent) return;

  if (tab === "exports") {
    projTab.classList.remove("active");
    expTab.classList.add("active");
    projContent.style.display = "none";
    expContent.style.display = "";
    void loadExportLog();
  } else {
    expTab.classList.remove("active");
    projTab.classList.add("active");
    expContent.style.display = "none";
    projContent.style.display = "";
  }
}

async function loadExportLog() {
  const root = document.getElementById("export-log-root");
  if (!root) return;
  root.innerHTML = '<div class="el-empty"><div class="el-empty-title">Loading...</div></div>';

  // Try multiple perf.jsonl locations
  const paths = ["/tmp/recorder-perf.jsonl"];

  // Try the user home NextFrame exports
  try {
    const homeResult = await bridgeCall("fs.read", { path: "~/NextFrame/perf.jsonl" }, 2000);
    if (homeResult && homeResult.contents) {
      exportLogCache = parseJsonl(homeResult.contents);
      renderExportLog(root);
      return;
    }
  } catch (_e) { /* try next */ }

  for (let i = 0; i < paths.length; i++) {
    try {
      const result = await bridgeCall("fs.read", { path: paths[i] }, 2000);
      if (result && result.contents) {
        exportLogCache = parseJsonl(result.contents);
        renderExportLog(root);
        return;
      }
    } catch (_e) { /* try next */ }
  }

  // Also try via export.log bridge method
  try {
    const logResult = await bridgeCall("export.log", { path: "/tmp/recorder-perf.jsonl" }, 3000);
    if (logResult && Array.isArray(logResult.entries)) {
      exportLogCache = logResult.entries.reverse();
      renderExportLog(root);
      return;
    }
  } catch (_e) { /* ignore */ }

  root.innerHTML = '<div class="el-empty"><div class="el-empty-title">No recordings yet</div><div>Record a video to see timing data here.</div></div>';
}

function parseJsonl(text) {
  return text.split("\n")
    .filter(function(line) { return line.trim().length > 0; })
    .map(function(line) { try { return JSON.parse(line); } catch(_e) { return null; } })
    .filter(function(entry) { return entry !== null; })
    .reverse();
}

function elFmtDuration(secs) {
  if (typeof secs !== "number" || !isFinite(secs) || secs <= 0) return "-";
  if (secs < 60) return secs.toFixed(1) + "s";
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m + "m" + (s > 0 ? s + "s" : "");
}

function elFmtDate(ts) {
  if (!ts) return "-";
  const d = new Date(ts * 1000);
  const mon = d.getMonth() + 1;
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return mon + "/" + day + " " + h + ":" + min;
}

function elFmtSize(mb) {
  if (typeof mb !== "number" || !isFinite(mb) || mb <= 0) return "-";
  if (mb >= 1000) return (mb / 1000).toFixed(1) + " GB";
  return mb.toFixed(1) + " MB";
}

function elSpeedClass(x) {
  if (typeof x !== "number" || !isFinite(x)) return "el-speed-normal";
  if (x >= 1.5) return "el-speed-fast";
  if (x >= 0.8) return "el-speed-normal";
  return "el-speed-slow";
}

function elShortenPath(p) {
  if (typeof p !== "string") return "-";
  const home = "/Users/" + (p.split("/Users/")[1] || "").split("/")[0];
  if (home.length > 7) p = p.replace(home, "~");
  const parts = p.split("/");
  if (parts.length > 3) return ".../" + parts.slice(-2).join("/");
  return p;
}

function renderExportLog(root) {
  const entries = exportLogCache;
  if (!entries.length) {
    root.innerHTML = '<div class="el-empty"><div class="el-empty-title">No recordings yet</div><div>Record a video to see timing data here.</div></div>';
    return;
  }

  let totalContentS = 0, totalWallS = 0, totalSizeMb = 0, totalFrames = 0;
  const count = entries.length;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    totalContentS += (typeof e.content_s === "number" ? e.content_s : 0);
    totalWallS += (typeof e.total_s === "number" ? e.total_s : 0);
    totalSizeMb += (typeof e.size_mb === "number" ? e.size_mb : 0);
    totalFrames += (typeof e.frames === "number" ? e.frames : 0);
  }
  const avgSpeed = totalWallS > 0 ? (totalContentS / totalWallS) : 0;
  const savedS = totalContentS - totalWallS;

  let html = '';

  // Summary
  html += '<div class="el-summary">';
  html += '<div class="el-stat"><div class="el-stat-value" style="color:var(--warm)">' + elFmtDuration(totalContentS) + '</div><div class="el-stat-label">Video Produced</div><div class="el-stat-sub" style="color:var(--ink-dim)">' + count + ' recordings</div></div>';
  html += '<div class="el-stat"><div class="el-stat-value" style="color:#6e9ecf">' + elFmtDuration(totalWallS) + '</div><div class="el-stat-label">Wall Time</div><div class="el-stat-sub" style="color:#6e9ecf">actual recording</div></div>';
  html += '<div class="el-stat"><div class="el-stat-value" style="color:#7cb37a">' + elFmtDuration(savedS > 0 ? savedS : 0) + '</div><div class="el-stat-label">Time Saved</div><div class="el-stat-sub" style="color:#7cb37a">vs realtime</div></div>';
  html += '<div class="el-stat"><div class="el-stat-value" style="color:#c9a94e">' + avgSpeed.toFixed(1) + 'x</div><div class="el-stat-label">Avg Speed</div><div class="el-stat-sub" style="color:var(--ink-dim)">' + elFmtSize(totalSizeMb) + ' total</div></div>';
  html += '</div>';

  // Table header
  html += '<div class="el-header"><span class="el-title">Recording History</span><span class="el-count">' + count + ' entries</span></div>';
  html += '<div style="overflow-x:auto">';
  html += '<table class="el-table">';
  html += '<thead><tr>';
  html += '<th style="width:24px"></th>';
  html += '<th>Time</th>';
  html += '<th>File</th>';
  html += '<th class="num">Video</th>';
  html += '<th class="num">Wall</th>';
  html += '<th class="num">Speed</th>';
  html += '<th>Breakdown</th>';
  html += '<th class="num">Frames</th>';
  html += '<th class="num">Skip%</th>';
  html += '<th class="num">FPS</th>';
  html += '<th>Resolution</th>';
  html += '<th class="num">CRF</th>';
  html += '<th class="num">Size</th>';
  html += '<th>Encoder</th>';
  html += '<th>Source</th>';
  html += '<th>Output</th>';
  html += '</tr></thead>';
  html += '<tbody>';

  for (let j = 0; j < entries.length; j++) {
    const entry = entries[j];
    const status = entry.status || "done";
    const contentS = typeof entry.content_s === "number" ? entry.content_s : 0;
    const recordS = typeof entry.record_s === "number" ? entry.record_s : 0;
    const overlayS = typeof entry.overlay_s === "number" ? entry.overlay_s : 0;
    const totalS = typeof entry.total_s === "number" ? entry.total_s : 0;
    const realtimeX = typeof entry.realtime_x === "number" ? entry.realtime_x : 0;
    const capturePct = totalS > 0 ? (recordS / totalS * 100) : 0;
    const encodePct = totalS > 0 ? (overlayS / totalS * 100) : 0;
    let muxPct = 100 - capturePct - encodePct;
    if (muxPct < 0) muxPct = 0;

    html += '<tr class="' + (status === "failed" ? "failed" : "") + '">';
    html += '<td><span class="el-status el-status-' + escapeHtml(status) + '"></span></td>';
    html += '<td class="mono">' + escapeHtml(elFmtDate(entry.ts)) + '</td>';
    html += '<td>' + escapeHtml(entry.file || "-") + '</td>';
    html += '<td class="num" style="color:var(--warm);font-weight:600">' + elFmtDuration(contentS) + '</td>';
    html += '<td class="num" style="color:#6e9ecf">' + elFmtDuration(totalS) + '</td>';
    html += '<td class="num"><span class="el-speed ' + elSpeedClass(realtimeX) + '">' + realtimeX.toFixed(1) + 'x</span></td>';
    html += '<td><div class="el-bar">';
    html += '<div class="el-bar-capture" style="width:' + capturePct.toFixed(0) + '%"></div>';
    html += '<div class="el-bar-encode" style="width:' + encodePct.toFixed(0) + '%"></div>';
    html += '<div class="el-bar-mux" style="width:' + muxPct.toFixed(0) + '%"></div>';
    html += '</div></td>';
    html += '<td class="num">' + (typeof entry.frames === "number" ? entry.frames.toLocaleString() : "-") + '</td>';
    html += '<td class="num">' + (typeof entry.skip_pct === "number" ? entry.skip_pct.toFixed(0) + "%" : "-") + '</td>';
    html += '<td class="num">' + (typeof entry.fps === "number" ? entry.fps.toFixed(0) : "-") + '</td>';
    html += '<td class="mono">' + escapeHtml(entry.resolution || "-") + '</td>';
    html += '<td class="num">' + (typeof entry.crf === "number" ? entry.crf : "-") + '</td>';
    html += '<td class="num">' + elFmtSize(entry.size_mb) + '</td>';
    html += '<td class="mono">' + escapeHtml(entry.encoder || "-") + '</td>';
    html += '<td><span class="el-path" title="' + escapeHtml(Array.isArray(entry.html_files) ? entry.html_files.join(", ") : "-") + '">' + escapeHtml(Array.isArray(entry.html_files) ? entry.html_files[0] || "-" : "-") + '</span></td>';
    html += '<td><span class="el-path" title="' + escapeHtml(entry.output_path || "-") + '">' + escapeHtml(elShortenPath(entry.output_path)) + '</span></td>';
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  root.innerHTML = html;
}
