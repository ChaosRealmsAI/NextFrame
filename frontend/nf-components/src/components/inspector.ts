import { makeSheet, NfBase } from "../_base.js";
import type { FieldEditDetail } from "../events.js";
import { getClip, getCompositionTrack, getEpisode } from "../storage.js";

const sheet = makeSheet(`
  :host {
    flex: 1;
    display: block;
    min-height: 0;
    font-family: var(--font);
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  .insp {
    height: 100%;
    overflow-y: auto;
    padding: 14px 14px 20px;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.08) transparent;
  }
  .insp::-webkit-scrollbar { width: 3px; }
  .insp::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.08); }
  .export-btn {
    width: 100%;
    display: flex; align-items: center; justify-content: center; gap: 10px;
    padding: 10px 14px;
    margin-bottom: 14px;
    background: var(--fg);
    color: var(--bg);
    border: 1px solid var(--fg);
    font-size: 12.5px; font-weight: 600;
    letter-spacing: 0.02em;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .export-btn:hover {
    background: var(--accent-l);
    border-color: var(--accent-l);
  }
  .export-btn .sub {
    font-family: var(--mono);
    font-size: 10px; font-weight: 500;
    opacity: 0.6; letter-spacing: 0.08em;
    padding-left: 10px;
    border-left: 1px solid currentColor;
  }
  .export-profiles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin: -4px 0 10px;
  }
  .profile-btn {
    min-height: 46px;
    padding: 7px 8px;
    background: rgba(255,255,255,0.025);
    border: 1px solid var(--bd);
    color: var(--fg-2);
    text-align: left;
    font-size: 10.5px;
    display: grid;
    gap: 3px;
  }
  .profile-btn strong {
    font-size: 11px;
    color: var(--fg);
  }
  .profile-btn span {
    font-family: var(--mono);
    font-size: 9px;
    color: var(--fg-4);
  }
  .profile-btn.active {
    border-color: rgba(125,211,252,0.55);
    background: rgba(125,211,252,0.12);
  }
  .insp-sel {
    padding: 8px 12px; margin-bottom: 14px;
    background: rgba(167, 139, 250, 0.06);
    border: 1px solid rgba(167, 139, 250, 0.2);
    border-left: 2px solid var(--accent);
    display: flex; align-items: center; gap: 8px;
    font-size: 11px;
  }
  .insp-sel .l {
    font-family: var(--mono); font-size: 9.5px;
    color: var(--fg-4); letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .insp-sel .n { color: var(--fg); font-weight: 600; }
  .insp-sel .m {
    margin-left: auto;
    font-family: var(--mono); font-size: 10px;
    color: var(--fg-4); letter-spacing: 0.05em;
  }
  .insp-card {
    padding: 14px 0;
    border-top: 1px solid var(--bd);
  }
  .insp-card:first-of-type { border-top: none; padding-top: 4px; }
  .insp-card h4 {
    margin: 0 0 12px;
    font-size: 10px; font-weight: 700;
    color: var(--accent-l); letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  .insp-f { margin-bottom: 10px; }
  .insp-f:last-child { margin-bottom: 0; }
  .insp-f .k {
    font-size: 10px; color: var(--accent-l);
    margin-bottom: 5px; opacity: 0.75;
    letter-spacing: 0.1em; text-transform: uppercase;
    display: flex; justify-content: space-between; align-items: center;
  }
  .insp-f .k .tag {
    font-family: var(--mono); text-transform: none;
    font-size: 9.5px; color: var(--accent-l);
    letter-spacing: 0.02em;
  }
  .insp-f .v {
    font-family: var(--mono); font-size: 11.5px;
    color: var(--fg);
    padding: 6px 10px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--bd);
    letter-spacing: 0.01em;
  }
  .insp-f .v.accent { color: var(--accent-l); }
  .insp-tags { display: flex; gap: 5px; flex-wrap: wrap; }
  .insp-tags .tg {
    padding: 3px 8px;
    font-family: var(--mono); font-size: 9.5px;
    color: var(--fg-2);
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--bd);
    letter-spacing: 0.02em;
  }
  .insp-kf {
    position: relative; height: 32px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--bd);
    padding: 0 10px;
  }
  .insp-kf .line {
    position: absolute; top: 50%; left: 10px; right: 10px;
    height: 1px; background: rgba(255, 255, 255, 0.12);
  }
  .insp-kf .kk {
    position: absolute; top: 50%;
    transform: translate(-50%, -50%) rotate(45deg);
    width: 7px; height: 7px;
    background: var(--accent);
  }
  .insp-kf .cur {
    position: absolute; top: 3px; bottom: 3px; width: 1px;
    background: var(--fg);
  }
  .edit-row {
    display: flex; gap: 6px;
  }
  .pos-grid {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 6px;
  }
  .edit-input {
    min-width: 0; flex: 1;
    padding: 7px 9px;
    background: rgba(0, 0, 0, 0.32);
    border: 1px solid var(--bd);
    color: var(--fg);
    font: 11.5px var(--font);
  }
  textarea.edit-input {
    min-height: 74px;
    resize: vertical;
    line-height: 1.45;
  }
  .pos-grid .edit-input {
    width: 100%;
    box-sizing: border-box;
    font-family: var(--mono);
  }
  .mini-btn {
    padding: 0 10px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid var(--bd);
    color: var(--fg);
    font-size: 11px;
  }
  .status {
    margin-top: 8px;
    font-family: var(--mono);
    font-size: 10px;
    color: var(--fg-4);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .status.ok { color: var(--teal); }
  .status.err { color: #fb7185; }
  .export-actions {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 8px;
    margin: -4px 0 12px;
  }
  .export-actions .status {
    margin-top: 0;
    min-width: 0;
  }
  .open-btn {
    padding: 7px 10px;
    background: rgba(123, 201, 181, 0.16);
    border: 1px solid rgba(123, 201, 181, 0.45);
    color: var(--teal);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .open-btn:hover {
    background: rgba(123, 201, 181, 0.26);
  }
  .voice-btn {
    width: 100%;
    padding: 9px 10px;
    background: rgba(251, 191, 36, 0.14);
    border: 1px solid rgba(251, 191, 36, 0.42);
    color: #fbbf24;
    font-size: 11.5px;
    font-weight: 650;
  }
  .voice-btn:hover {
    background: rgba(251, 191, 36, 0.22);
  }
  .progress {
    height: 7px;
    margin: -6px 0 6px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .progress .bar {
    width: var(--export-progress, 0%);
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--teal));
    transition: width 0.2s ease;
  }
  .progress-text {
    margin: 0 0 12px;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-family: var(--mono);
    font-size: 9.5px;
    color: var(--fg-4);
  }
  .diagnostics {
    margin: 0 0 12px;
    padding: 10px;
    border: 1px solid var(--bd);
    background: rgba(255, 255, 255, 0.025);
  }
  .diag-head {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 10px;
    color: var(--accent-l);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .diag-head span {
    max-width: 170px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--fg-4);
    font-family: var(--mono);
    letter-spacing: 0;
    text-transform: none;
  }
  .diag-map {
    position: relative;
    height: 18px;
    margin-bottom: 8px;
    background: rgba(255, 255, 255, 0.06);
    overflow: hidden;
  }
  .diag-span {
    position: absolute;
    top: 0;
    bottom: 0;
    min-width: 3px;
    border: 1px solid var(--amber-b);
    background: rgba(224, 183, 108, 0.32);
  }
  .diag-summary {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }
  .diag-summary div {
    min-width: 0;
    padding: 6px 7px;
    border: 1px solid var(--bd-2);
    background: rgba(0, 0, 0, 0.22);
    font-family: var(--mono);
    font-size: 9.5px;
    color: var(--fg-4);
  }
  .diag-summary b {
    display: block;
    margin-bottom: 2px;
    color: var(--fg);
    font: 12px var(--font);
  }
  @keyframes export-run {
    from { transform: translateX(-110%); }
    to { transform: translateX(260%); }
  }
`);

export class NfInspector extends NfBase {
  static get observedAttributes(): string[] {
    return [
      "clip-id",
      "save-status",
      "save-error",
      "export-status",
      "export-job-id",
      "export-path",
      "export-error",
      "export-open-status",
      "export-profile",
      "export-progress",
      "export-diagnostics",
      "voice-status",
      "voice-error",
      "voice-audio",
    ];
  }

  constructor() {
    super(sheet);
  }

  connectedCallback(): void {
    this.render();
    document.addEventListener("nf-data-ready", this.handleDataReady);
  }

  disconnectedCallback(): void {
    document.removeEventListener("nf-data-ready", this.handleDataReady);
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.render();
  }

  private readonly handleDataReady = (): void => {
    this.render();
  };

  private render(): void {
    const episode = getEpisode();
    const clipId = this.getAttribute("clip-id");
    const fallbackClip = episode.clips.find((item) => item.kind === "scene") ?? episode.clips[0];
    const clip = clipId ? getClip(clipId) ?? fallbackClip : fallbackClip;
    const fields = episode.inspector_fields;
    const name = clip?.label ?? clipId ?? "未选择";
    const position = clip?.position ?? fields.position;
    const duration = clip ? clip.end - clip.start : fields.timing.duration;
    const saveStatus = this.getAttribute("save-status") ?? "";
    const saveError = this.getAttribute("save-error") ?? "";
    const exportStatus = this.getAttribute("export-status") ?? "idle";
    const exportJobId = this.getAttribute("export-job-id") ?? "";
    const exportPath = this.getAttribute("export-path") ?? "";
    const exportError = this.getAttribute("export-error") ?? "";
    const exportOpenStatus = this.getAttribute("export-open-status") ?? "";
    const exportProfile = this.getAttribute("export-profile") ?? "final";
    const exportProgress = exportProgressValue(this.getAttribute("export-progress"));
    const exportDiagnostics = exportDiagnosticsValue(this.getAttribute("export-diagnostics"));
    const voiceStatus = this.getAttribute("voice-status") ?? "idle";
    const voiceError = this.getAttribute("voice-error") ?? "";
    const voiceAudio = this.getAttribute("voice-audio") ?? "";
    const compositionTrackId = clip?.track_id ?? clip?.id ?? clipId ?? "";
    const compositionTrack = compositionTrackId ? getCompositionTrack(compositionTrackId) : undefined;
    if (compositionTrack) {
      this.renderCompositionTrack({
        trackId: compositionTrackId,
        track: compositionTrack,
        clipName: name,
        duration,
        saveStatus,
        saveError,
        exportStatus,
        exportJobId,
        exportPath,
        exportError,
        exportOpenStatus,
        exportProfile,
        exportProgress,
        exportDiagnostics,
      });
      return;
    }
    this.root.innerHTML = `
      <div class="insp">
        ${renderExportPanel({ exportStatus, exportJobId, exportPath, exportError, exportOpenStatus, exportProfile, exportProgress, exportDiagnostics })}
        ${exportStatus === "succeeded" ? `
          <div class="export-actions">
            <div class="status ok">${escapeHtml(exportOpenStatus === "opened" ? "已打开 · " : "")}${escapeHtml(exportPath)}</div>
            <button class="open-btn" type="button" data-action="open-export">打开视频</button>
          </div>
        ` : ""}
        ${exportStatus === "failed" ? `<div class="status err">${exportError || "导出失败"}</div>` : ""}
        <div class="insp-sel">
          <span class="l">已选片段</span>
          <span class="n">${name}</span>
          <span class="m">画面 · ${duration.toFixed(1)}s</span>
        </div>
        <div class="insp-card">
          <h4>属性</h4>
          <div class="insp-f insp-field">
            <div class="k"><span>标题</span><span class="tag">${saveStatus}</span></div>
            <div class="edit-row">
              <input class="edit-input" data-field="label" value="${escapeAttr(name)}">
              <button class="mini-btn" type="button" data-action="save-label">保存</button>
            </div>
            ${saveStatus === "failed" ? `<div class="status err">${saveError}</div>` : ""}
          </div>
          <div class="insp-f insp-field">
            <div class="k"><span>位置</span><span class="tag">%</span></div>
            <div class="pos-grid">
              <input class="edit-input" data-field="pos-x" type="number" min="5" max="95" step="1" value="${position.x.toFixed(0)}">
              <input class="edit-input" data-field="pos-y" type="number" min="5" max="95" step="1" value="${position.y.toFixed(0)}">
              <button class="mini-btn" type="button" data-action="save-position">保存</button>
            </div>
          </div>
          <div class="insp-f insp-field">
            <div class="k"><span>语音</span><span class="tag">${voiceStatus === "running" ? "生成中" : voiceStatus === "succeeded" ? "已接入" : ""}</span></div>
            <button class="voice-btn" type="button" data-action="synth-voice">
              ${voiceStatus === "running" ? "生成语音字幕中" : voiceStatus === "succeeded" ? "重新生成语音字幕" : "生成语音字幕"}
            </button>
            ${voiceStatus === "running" ? `<div class="progress" aria-label="voice progress"><div class="bar"></div></div>` : ""}
            ${voiceStatus === "succeeded" ? `<div class="status ok">${escapeHtml(voiceAudio || "已写入 audio/subtitle 轨道")}</div>` : ""}
            ${voiceStatus === "failed" ? `<div class="status err">${escapeHtml(voiceError || "语音生成失败")}</div>` : ""}
          </div>
          <div class="insp-f insp-field">
            <div class="k"><span>类型</span></div>
            <div class="v">${kindLabel(clip?.kind ?? "scene")}</div>
          </div>
          <div class="insp-f insp-field">
            <div class="k"><span>起点</span><span class="tag">锚点</span></div>
            <div class="v accent">${fields.timing.startAnchor}</div>
          </div>
          <div class="insp-f insp-field">
            <div class="k"><span>时长</span><span class="tag">表达式</span></div>
            <div class="v accent">${duration.toFixed(3)} 秒</div>
          </div>
          <div class="insp-f insp-field">
            <div class="k"><span>实际</span></div>
            <div class="v">${duration.toFixed(3)} 秒</div>
          </div>
        </div>
        <div class="insp-card">
          <h4>效果</h4>
          <div class="insp-f insp-field">
            <div class="k"><span>特效</span></div>
            <div class="insp-tags">
              ${fields.effects.map((effect) => `<span class="tg">${effect}</span>`).join("")}
            </div>
          </div>
          <div class="insp-f insp-field">
            <div class="k"><span>调色</span><span class="tag">LUT</span></div>
            <div class="v">${fields.color}</div>
          </div>
          <div class="insp-f insp-field">
            <div class="k"><span>不透明度 · ${fields.keyframes.length} 个关键帧</span></div>
            <div class="insp-kf">
              <div class="line"></div>
              ${fields.keyframes.map((keyframe) => `<div class="kk" style="left:${keyframe.t * 100}%;"></div>`).join("")}
              <div class="cur" style="left:23%;"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    this.root.querySelector("[data-action='save-label']")?.addEventListener("click", () => {
      const input = this.root.querySelector<HTMLInputElement>("[data-field='label']");
      this.emit<FieldEditDetail>("field-edit", { field: "label", value: input?.value ?? name });
    });
    this.root.querySelector<HTMLInputElement>("[data-field='label']")?.addEventListener("input", (event) => {
      const input = event.currentTarget as HTMLInputElement;
      this.emit<FieldEditDetail>("field-edit", { field: "label-preview", value: input.value });
    });
    this.root.querySelector("[data-action='save-position']")?.addEventListener("click", () => {
      this.emit<FieldEditDetail>("field-edit", { field: "position", value: this.readPosition(position) });
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-field='pos-x'], [data-field='pos-y']").forEach((input) => {
      input.addEventListener("input", () => {
        this.emit<FieldEditDetail>("field-edit", { field: "position-preview", value: this.readPosition(position) });
      });
    });
    this.root.querySelector(".export-btn")?.addEventListener("click", () => {
      this.emit<FieldEditDetail>("field-edit", { field: "export", value: this.getAttribute("export-profile") ?? "final" });
    });
    this.root.querySelectorAll<HTMLElement>("[data-export-profile]").forEach((button) => {
      button.addEventListener("click", () => {
        this.emit<FieldEditDetail>("field-edit", { field: "export-profile", value: button.dataset.exportProfile ?? "final" });
      });
    });
    this.root.querySelector("[data-action='open-export']")?.addEventListener("click", () => {
      this.emit<FieldEditDetail>("field-edit", { field: "open-export", value: exportPath });
    });
    this.root.querySelector("[data-action='cancel-export']")?.addEventListener("click", () => {
      this.emit<FieldEditDetail>("field-edit", { field: "export-cancel", value: this.getAttribute("export-job-id") ?? "" });
    });
    this.root.querySelector("[data-action='synth-voice']")?.addEventListener("click", () => {
      this.emit<FieldEditDetail>("field-edit", { field: "voice", value: voicePayload(clip) });
    });
  }

  private readPosition(fallback: { x: number; y: number }): { x: number; y: number } {
    const x = Number(this.root.querySelector<HTMLInputElement>("[data-field='pos-x']")?.value ?? fallback.x);
    const y = Number(this.root.querySelector<HTMLInputElement>("[data-field='pos-y']")?.value ?? fallback.y);
    return {
      x: clampPercent(x),
      y: clampPercent(y),
    };
  }

  private renderCompositionTrack(state: {
    trackId: string;
    track: Record<string, unknown>;
    clipName: string;
    duration: number;
    saveStatus: string;
    saveError: string;
    exportStatus: string;
    exportJobId: string;
    exportPath: string;
    exportError: string;
    exportOpenStatus: string;
    exportProfile: string;
    exportProgress: ExportProgressState;
    exportDiagnostics: ExportDiagnosticsState | null;
  }): void {
    const kind = stringValue(state.track.kind) ?? "component";
    const component = stringValue(state.track.component) ?? kind;
    const time = recordValue(state.track.time);
    const params = recordValue(state.track.params);
    const style = recordValue(state.track.style);
    const topLevelFields = [
      state.track.src !== undefined ? this.compositionField("src", state.track.src, "src") : "",
      state.track.volume !== undefined ? this.compositionField("volume", state.track.volume, "volume") : "",
    ].join("");
    this.root.innerHTML = `
      <div class="insp" data-inspector-track-id="${escapeAttr(state.trackId)}">
        ${renderExportPanel(state)}
        ${state.exportStatus === "succeeded" ? `
          <div class="export-actions">
            <div class="status ok">${escapeHtml(state.exportOpenStatus === "opened" ? "已打开 · " : "")}${escapeHtml(state.exportPath)}</div>
            <button class="open-btn" type="button" data-action="open-export">打开视频</button>
          </div>
        ` : ""}
        ${state.exportStatus === "failed" ? `<div class="status err">${escapeHtml(state.exportError || "导出失败")}</div>` : ""}
        <div class="insp-sel">
          <span class="l">已选轨道</span>
          <span class="n">${escapeHtml(state.trackId)}</span>
          <span class="m">${escapeHtml(component)} · ${state.duration.toFixed(1)}s</span>
        </div>
        ${topLevelFields ? `
          <div class="insp-card">
            <h4>轨道</h4>
            ${topLevelFields}
          </div>
        ` : ""}
        <div class="insp-card">
          <h4>时间</h4>
          ${this.compositionField("time.start", time.start ?? "", "start")}
          ${this.compositionField("time.end", time.end ?? "", "end")}
          ${this.compositionField("z", state.track.z ?? 0, "z")}
        </div>
        <div class="insp-card">
          <h4>样式</h4>
          ${this.compositionField("style.x", style.x ?? params.x ?? 50, "x")}
          ${this.compositionField("style.y", style.y ?? params.y ?? 50, "y")}
          ${Object.entries(style)
            .filter(([key]) => key !== "x" && key !== "y")
            .map(([key, value]) => this.compositionField(`style.${key}`, value, key))
            .join("")}
        </div>
        <div class="insp-card">
          <h4>参数</h4>
          ${Object.entries(params)
            .map(([key, value]) => this.compositionField(`params.${key}`, value, key))
            .join("")}
        </div>
        ${state.saveStatus ? `<div class="status ${state.saveStatus === "failed" ? "err" : state.saveStatus === "saved" ? "ok" : ""}" data-save-state>${escapeHtml(state.saveStatus)}${state.saveError ? ` · ${escapeHtml(state.saveError)}` : ""}</div>` : `<div class="status" data-save-state>clean</div>`}
      </div>
    `;
    this.root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-field-path]").forEach((input) => {
      input.addEventListener("input", () => {
        this.emit<FieldEditDetail>("field-edit", {
          field: "composition-preview",
          value: {
            track: state.trackId,
            field: input.dataset.fieldPath ?? "",
            value: readInputValue(input),
          },
        });
      });
      input.addEventListener("change", () => {
        this.emit<FieldEditDetail>("field-edit", {
          field: "composition-save",
          value: {
            track: state.trackId,
            field: input.dataset.fieldPath ?? "",
            value: readInputValue(input),
          },
        });
      });
    });
    this.root.querySelector(".export-btn")?.addEventListener("click", () => {
      this.emit<FieldEditDetail>("field-edit", { field: "export", value: this.getAttribute("export-profile") ?? "final" });
    });
    this.root.querySelectorAll<HTMLElement>("[data-export-profile]").forEach((button) => {
      button.addEventListener("click", () => {
        this.emit<FieldEditDetail>("field-edit", { field: "export-profile", value: button.dataset.exportProfile ?? "final" });
      });
    });
    this.root.querySelector("[data-action='open-export']")?.addEventListener("click", () => {
      this.emit<FieldEditDetail>("field-edit", { field: "open-export", value: state.exportPath });
    });
    this.root.querySelector("[data-action='cancel-export']")?.addEventListener("click", () => {
      this.emit<FieldEditDetail>("field-edit", { field: "export-cancel", value: this.getAttribute("export-job-id") ?? state.exportJobId });
    });
  }

  private compositionField(path: string, value: unknown, label: string): string {
    const encodedPath = escapeAttr(path);
    const text = fieldString(value);
    const isComplex = value != null && typeof value === "object";
    return `
      <div class="insp-f insp-field">
        <div class="k"><span>${escapeHtml(label)}</span><span class="tag">${escapeHtml(path)}</span></div>
        ${isComplex
          ? `<textarea class="edit-input" data-field-path="${encodedPath}">${escapeHtml(text)}</textarea>`
          : `<input class="edit-input" data-field-path="${encodedPath}" value="${escapeAttr(text)}">`}
      </div>
    `;
  }
}

interface ExportProgressState {
  stage: string;
  percent: number;
  framesEncoded: number;
  totalFrames: number;
  etaSeconds: number | null;
}

const EXPORT_PROFILES = [
  { id: "draft", label: "草稿", meta: "720p · 30fps · x1" },
  { id: "standard", label: "标准", meta: "1080p · 30fps · x1" },
  { id: "final", label: "最终", meta: "1080p · 60fps · x1" },
  { id: "final-fast", label: "高速最终", meta: "1080p · 60fps · x2" },
];

function renderExportPanel(state: {
  exportStatus: string;
  exportJobId?: string;
  exportPath?: string;
  exportError?: string;
  exportOpenStatus?: string;
  exportProfile: string;
  exportProgress: ExportProgressState;
  exportDiagnostics?: ExportDiagnosticsState | null;
}): string {
  const active = EXPORT_PROFILES.find((profile) => profile.id === state.exportProfile) ?? EXPORT_PROFILES[2];
  const percent = Math.max(0, Math.min(100, state.exportProgress.percent));
  const frames = state.exportProgress.totalFrames > 0
    ? `${state.exportProgress.framesEncoded}/${state.exportProgress.totalFrames}`
    : state.exportProgress.stage;
  const eta = state.exportProgress.etaSeconds == null
    ? "--"
    : `${Math.max(0, Math.round(state.exportProgress.etaSeconds))}s`;
  return `
    <div class="export-profiles" data-export-selected-profile="${escapeAttr(active.id)}">
      ${EXPORT_PROFILES.map((profile) => `
        <button class="profile-btn ${profile.id === active.id ? "active" : ""}" type="button" data-export-profile="${escapeAttr(profile.id)}">
          <strong>${escapeHtml(profile.label)}</strong>
          <span>${escapeHtml(profile.meta)}</span>
        </button>
      `).join("")}
    </div>
    <button class="export-btn" type="button" data-field="export" data-action="export-video" ${state.exportStatus === "running" || state.exportStatus === "cancelling" ? "disabled" : ""}>
      ${state.exportStatus === "running" ? "导出中" : state.exportStatus === "cancelling" ? "取消中" : state.exportStatus === "succeeded" ? "导出完成" : state.exportStatus === "cancelled" ? "已取消" : "导出视频"}
      <span class="sub">${escapeHtml(active.meta)}</span>
    </button>
    ${state.exportStatus === "running" || state.exportStatus === "cancelling" ? `
      <div class="progress" aria-label="export progress" style="--export-progress:${percent.toFixed(1)}%"><div class="bar"></div></div>
      <div class="progress-text"><span>${escapeHtml(state.exportProgress.stage)} · ${percent.toFixed(0)}%</span><span>${escapeHtml(frames)} · ETA ${escapeHtml(eta)}</span></div>
      <button class="open-btn" type="button" data-action="cancel-export" data-export-job="${escapeAttr(state.exportJobId ?? "")}">取消导出</button>
    ` : ""}
    ${state.exportStatus === "cancelled" ? `
      <div class="status err">导出已取消</div>
    ` : ""}
    ${state.exportStatus === "succeeded" && state.exportDiagnostics ? renderDiagnostics(state.exportDiagnostics) : ""}
  `;
}

interface ExportDiagnosticsState {
  path: string;
  summary: Record<string, number>;
  slowSpans: Array<Record<string, number>>;
  topFrames: Array<Record<string, number>>;
}

function exportProgressValue(raw: string | null): ExportProgressState {
  if (!raw) return { stage: "idle", percent: 0, framesEncoded: 0, totalFrames: 0, etaSeconds: null };
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return {
      stage: typeof value.stage === "string" ? value.stage : "running",
      percent: numberOr(value.percent, 0),
      framesEncoded: numberOr(value.frames_encoded, 0),
      totalFrames: numberOr(value.total_frames, 0),
      etaSeconds: value.eta_seconds == null ? null : numberOr(value.eta_seconds, 0),
    };
  } catch {
    return { stage: "running", percent: 0, framesEncoded: 0, totalFrames: 0, etaSeconds: null };
  }
}

function exportDiagnosticsValue(raw: string | null): ExportDiagnosticsState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const summary = recordValue(value.summary);
    return {
      path: typeof value.path === "string" ? value.path : "",
      summary: numbersRecord(summary),
      slowSpans: arrayRecords(value.slow_spans).map(numbersRecord),
      topFrames: arrayRecords(value.top_frames).map(numbersRecord),
    };
  } catch {
    return null;
  }
}

function renderDiagnostics(diagnostics: ExportDiagnosticsState): string {
  const duration = diagnostics.summary.duration_ms || 24_000;
  const spans = diagnostics.slowSpans.slice(0, 8);
  const map = spans.length === 0
    ? `<i class="diag-span" data-diagnostics-slow-span style="left:0;width:0"></i>`
    : spans.map((span) => {
        const left = percentOf(span.start_ms || 0, duration);
        const width = Math.max(2, percentOf(Math.max(1, (span.end_ms || 0) - (span.start_ms || 0)), duration));
        const title = `${msLabel(span.start_ms)}-${msLabel(span.end_ms)} · ${numLabel(span.avg_ms_per_frame)}ms`;
        return `<i class="diag-span" data-diagnostics-slow-span title="${escapeAttr(title)}" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%"></i>`;
      }).join("");
  return `
    <div class="diagnostics" data-export-diagnostics-summary>
      <div class="diag-head">性能地图<span title="${escapeAttr(diagnostics.path)}">${escapeHtml(diagnostics.path)}</span></div>
      <div class="diag-map" data-export-performance-map>${map}</div>
      <div class="diag-summary">
        <div><b>${numLabel(diagnostics.summary.avg_ms_per_frame)}ms</b>avg/frame</div>
        <div><b>${numLabel(diagnostics.summary.max_ms_per_frame)}ms</b>max frame</div>
        <div><b>${numLabel(diagnostics.summary.slow_spans)}</b>slow spans</div>
        <div><b>${numLabel(diagnostics.summary.frames)}</b>frames</div>
      </div>
    </div>
  `;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function numbersRecord(value: Record<string, unknown>): Record<string, number> {
  const result: Record<string, number> = {};
  Object.entries(value).forEach(([key, raw]) => {
    if (typeof raw === "number" && Number.isFinite(raw)) result[key] = raw;
  });
  return result;
}

function arrayRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => item != null && typeof item === "object" && !Array.isArray(item))
    : [];
}

function percentOf(value: number, total: number): number {
  return total > 0 ? Math.max(0, Math.min(100, value / total * 100)) : 0;
}

function msLabel(value: number | undefined): string {
  return `${((value ?? 0) / 1000).toFixed(1)}s`;
}

function numLabel(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "0";
  return value >= 100 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function clampPercent(value: number): number {
  return Number.isFinite(value) ? Math.min(95, Math.max(5, value)) : 50;
}

function readInputValue(input: HTMLInputElement | HTMLTextAreaElement): unknown {
  const value = input.value.trim();
  if (input instanceof HTMLTextAreaElement) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (value !== "" && Number.isFinite(Number(value))) return Number(value);
  return input.value;
}

function fieldString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function recordValue(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function kindLabel(kind: string): string {
  const labels: Record<string, string> = {
    scene: "画面 · 视频",
    text: "文字",
    subtitle: "字幕",
    overlay: "叠加",
    audio: "音频",
    trans: "转场",
  };
  return labels[kind] ?? kind;
}

function voicePayload(clip: ReturnType<typeof getClip> | undefined): Record<string, unknown> {
  const text = clip?.tts?.text ?? [
    clip?.title,
    clip?.subtitle,
    clip?.description,
    clip?.text,
    clip?.label,
  ].filter((value): value is string => Boolean(value && value.trim().length > 0)).join("，");
  return {
    text,
    voice: clip?.tts?.voice,
    backend: clip?.tts?.backend,
    rate: clip?.tts?.rate,
  };
}
