import { makeSheet, NfBase } from "../_base.js";
import type { FieldEditDetail } from "../events.js";
import { getClip, getEpisode } from "../storage.js";

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
  .progress {
    height: 3px;
    margin: -6px 0 10px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .progress .bar {
    width: 42%;
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--teal));
    animation: export-run 1s linear infinite;
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
      "export-path",
      "export-error",
      "export-open-status",
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
    const exportPath = this.getAttribute("export-path") ?? "";
    const exportError = this.getAttribute("export-error") ?? "";
    const exportOpenStatus = this.getAttribute("export-open-status") ?? "";
    this.root.innerHTML = `
      <div class="insp">
        <button class="export-btn" type="button" data-field="export">
          ${exportStatus === "running" ? "导出中" : exportStatus === "succeeded" ? "导出完成" : "导出视频"}
          <span class="sub">1080p · H264</span>
        </button>
        ${exportStatus === "running" ? `<div class="progress" aria-label="export progress"><div class="bar"></div></div>` : ""}
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
            <div class="k"><span>类型</span></div>
            <div class="v">画面 · 视频</div>
          </div>
          <div class="insp-f insp-field">
            <div class="k"><span>起点</span><span class="tag">锚点</span></div>
            <div class="v accent">${fields.timing.startAnchor}</div>
          </div>
          <div class="insp-f insp-field">
            <div class="k"><span>时长</span><span class="tag">表达式</span></div>
            <div class="v accent">${fields.timing.expression}</div>
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
      this.emit<FieldEditDetail>("field-edit", { field: "export", value: "1080p H264" });
    });
    this.root.querySelector("[data-action='open-export']")?.addEventListener("click", () => {
      this.emit<FieldEditDetail>("field-edit", { field: "open-export", value: exportPath });
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
