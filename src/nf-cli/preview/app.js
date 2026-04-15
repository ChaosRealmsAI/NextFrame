// Preview UI controller. Pure vanilla ES module.
const $ = (sel) => document.querySelector(sel);
let state = {
    path: "examples/launch.timeline.json",
    timeline: null,
    selected: null,
    t: 0,
};
function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = (sec - m * 60).toFixed(1);
    return `${m}:${s.padStart(4, "0")}`;
}
async function loadTimeline() {
    state.path = $("#tl-path").value.trim();
    const r = await fetch(`/api/timeline?path=${encodeURIComponent(state.path)}`).then((x) => x.json());
    if (!r.ok)
        return logErr(r.error?.message || "load failed");
    state.timeline = r.value.timeline;
    state.t = 0;
    $("#scrub").max = String(state.timeline.duration);
    $("#scrub").value = "0";
    renderMeta();
    renderClips();
    renderValidation(r.value.validation);
    await refreshFrame();
    await refreshGantt();
    $("#mp4-player").hidden = true;
    $("#mp4-player").removeAttribute("src");
}
async function saveTimeline() {
    const r = await fetch(`/api/timeline?path=${encodeURIComponent(state.path)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timeline: state.timeline }),
    }).then((x) => x.json());
    if (!r.ok)
        return logErr(r.error?.message || "save failed");
    if (r.validation && !r.validation.ok) {
        renderValidation(r.validation);
        return;
    }
    renderValidation(r.value.validation);
}
async function refreshFrame() {
    if (!state.timeline)
        return;
    const url = `/api/frame?path=${encodeURIComponent(state.path)}&t=${state.t}&w=960&_=${Date.now()}`;
    $("#preview-placeholder").style.display = "none";
    $("#preview-img").src = url;
    $("#time-label").textContent = `${fmtTime(state.t)} / ${fmtTime(state.timeline.duration)}`;
}
async function refreshGantt() {
    const r = await fetch(`/api/gantt?path=${encodeURIComponent(state.path)}`);
    if (!r.ok)
        return;
    const text = await r.text();
    $("#gantt").textContent = text;
}
async function renderMP4() {
    const btn = $("#btn-render");
    btn.disabled = true;
    btn.textContent = "Rendering…";
    try {
        const r = await fetch("/api/render", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ path: state.path }),
        }).then((x) => x.json());
        if (!r.ok)
            return logErr(r.error?.message || "render failed");
        const v = $("#mp4-player");
        v.src = r.value.url;
        v.hidden = false;
        v.play();
        $("#preview-placeholder").textContent = `mp4 ready: ${(r.value.size / 1024).toFixed(0)}KB in ${r.value.elapsed_ms}ms`;
    }
    finally {
        btn.disabled = false;
        btn.textContent = "Export MP4";
    }
}
function renderMeta() {
    const t = state.timeline;
    $("#timeline-meta").innerHTML = `
    <div>${t.schema} · ${t.project.width}×${t.project.height} @ ${t.project.fps}fps · ${t.duration}s</div>
    <div>${t.tracks.length} tracks · ${totalClips(t)} clips</div>
  `;
}
function totalClips(t) {
    let n = 0;
    for (const tr of t.tracks)
        n += (tr.clips || []).length;
    return n;
}
function renderClips() {
    const list = $("#clip-list");
    list.innerHTML = "";
    for (const trk of state.timeline.tracks) {
        for (const clip of trk.clips || []) {
            const row = document.createElement("div");
            row.className = "clip-row";
            row.dataset.id = clip.id;
            row.innerHTML = `
        <span class="track">${trk.id}</span>
        <span class="id">${clip.id} · ${clip.scene}</span>
        <span class="time">${typeof clip.start === "number" ? fmtTime(clip.start) : "sym"}+${clip.dur}s</span>
      `;
            row.addEventListener("click", () => selectClip(clip.id, trk.id));
            list.appendChild(row);
        }
    }
}
function selectClip(clipId, trackId) {
    state.selected = { clipId, trackId };
    document.querySelectorAll(".clip-row").forEach((r) => r.classList.toggle("selected", r.dataset["id"] === clipId));
    const track = state.timeline.tracks.find((t) => t.id === trackId);
    const clip = track.clips.find((c) => c.id === clipId);
    renderClipInspector(clip, track);
    // jump scrubber to clip start
    if (typeof clip.start === "number") {
        state.t = clip.start;
        $("#scrub").value = String(clip.start);
        refreshFrame();
    }
}
function renderClipInspector(clip, track) {
    const el = $("#clip-inspector");
    el.innerHTML = "";
    const mkField = (label, value, type, onChange) => {
        const d = document.createElement("div");
        d.className = "field";
        const l = document.createElement("label");
        l.textContent = label;
        const i = document.createElement("input");
        i.type = type;
        i.value = String(value);
        i.addEventListener("change", () => onChange(type === "number" ? Number(i.value) : i.value));
        d.appendChild(l);
        d.appendChild(i);
        el.appendChild(d);
    };
    const hdr = (txt) => {
        const h = document.createElement("div");
        h.className = "hdr";
        h.textContent = txt;
        el.appendChild(h);
    };
    hdr(`${clip.id} · ${clip.scene}`);
    mkField("track", track.id, "text", () => { });
    mkField("start", clip.start, "number", (v) => { clip.start = v; onClipEdit(); });
    mkField("dur", clip.dur, "number", (v) => { clip.dur = v; onClipEdit(); });
    hdr("params");
    const params = clip.params || (clip.params = {});
    for (const [k, v] of Object.entries(params)) {
        mkField(k, v, typeof v === "number" ? "number" : "text", (nv) => { params[k] = nv; onClipEdit(); });
    }
}
async function onClipEdit() {
    renderClips();
    await saveTimeline();
    await refreshFrame();
    await refreshGantt();
}
function renderValidation(v) {
    if (!v)
        return;
    const el = $("#validation");
    if (v.ok) {
        el.innerHTML = `<div class="v-ok">✓ ok</div>` + (v.warnings?.length ? v.warnings.map((w) => `<div class="v-warn">⚠︎ ${w.message}</div>`).join("") : "");
    }
    else {
        el.innerHTML = (v.errors || []).map((e) => `<div class="v-err">✗ ${e.code}: ${e.message}</div>`).join("");
    }
}
async function askAI() {
    const prompt = $("#ai-prompt").value.trim();
    if (!prompt)
        return;
    const log = $("#ai-log");
    log.textContent = "Starting sonnet…";
    const r = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: state.path, prompt }),
    }).then((x) => x.json());
    if (!r.ok) {
        log.textContent = `error: ${r.error?.message}`;
        return;
    }
    const jobId = r.value.jobId;
    log.textContent = `job ${jobId} running…`;
    // Poll
    const poll = async () => {
        const s = await fetch(`/api/ai-status?id=${jobId}`).then((x) => x.json());
        if (!s.ok) {
            log.textContent = `poll error: ${s.error?.message}`;
            return;
        }
        const job = s.value;
        log.textContent = job.logs.map((l) => `[${l.stream}] ${l.text}`).join("");
        if (job.done) {
            log.textContent += `\n--- ${job.status} (exit=${job.exitCode}) ---`;
            await loadTimeline();
            return;
        }
        setTimeout(poll, 1500);
    };
    poll();
}
function logErr(msg) {
    $("#validation").innerHTML = `<div class="v-err">${msg}</div>`;
}
// Wire up
$("#btn-load").addEventListener("click", loadTimeline);
$("#btn-save").addEventListener("click", saveTimeline);
$("#btn-render").addEventListener("click", renderMP4);
$("#btn-ai").addEventListener("click", askAI);
$("#scrub").addEventListener("input", (e) => { state.t = Number(e.target.value); refreshFrame(); });
$("#btn-prev").addEventListener("click", () => { state.t = Math.max(0, state.t - 0.1); $("#scrub").value = String(state.t); refreshFrame(); });
$("#btn-next").addEventListener("click", () => { state.t = Math.min(state.timeline?.duration || 0, state.t + 0.1); $("#scrub").value = String(state.t); refreshFrame(); });
// auto-load on start
loadTimeline();
export {};
