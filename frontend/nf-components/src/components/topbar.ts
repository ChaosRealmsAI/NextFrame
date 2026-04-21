import { makeSheet, NfBase } from "../_base.js";
import type { LangChangeDetail, LangId, TabChangeDetail, TabId } from "../events.js";
import { getMockData } from "../storage.js";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "script", label: "脚本" },
  { id: "slice", label: "视频切片" },
  { id: "voice", label: "语音生成" },
  { id: "edit", label: "视频制作" },
];

const sheet = makeSheet(`
  :host {
    height: 46px;
    flex-shrink: 0;
    color: var(--fg-2);
    font-family: var(--font);
  }
  :host(.native) {
    height: 48px;
    -webkit-app-region: drag;
  }
  button {
    appearance: none;
    border: none;
    background: none;
    font: inherit;
    color: inherit;
    cursor: pointer;
    -webkit-app-region: no-drag;
  }
  .topbar {
    height: 46px;
    display: flex; align-items: center;
    padding: 0 18px;
    background: rgba(10, 10, 14, 0.65);
    border-bottom: 1px solid var(--bd);
    gap: 16px;
  }
  .topbar.native {
    height: 48px;
    padding: 0 18px 0 80px;
    background: transparent;
    -webkit-app-region: drag;
  }
  .tb-dots { display: flex; gap: 7px; flex-shrink: 0; }
  .tb-dots span {
    width: 11px; height: 11px; border-radius: 50%;
  }
  .tb-dots .r { background: #ff5f57; }
  .tb-dots .y { background: #febc2e; }
  .tb-dots .g { background: #28c840; }
  .tb-sep { width: 1px; height: 18px; background: var(--bd); flex-shrink: 0; }
  .tb-crumb {
    display: flex; align-items: center; gap: 4px;
    font-size: 12.5px; flex-shrink: 0;
    position: relative;
  }
  .tb-crumb .slash { color: var(--fg-4); font-weight: 300; padding: 0 2px; }
  .tb-home {
    display: inline-flex; align-items: center; justify-content: center;
    width: 26px; height: 26px;
    color: var(--fg-3);
    transition: color 0.15s, background 0.15s;
  }
  .tb-home:hover { color: var(--fg); background: rgba(255, 255, 255, 0.05); }
  .tb-home svg { width: 15px; height: 15px; }
  .tb-drop {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 3px 8px;
    color: var(--fg-2);
    font-weight: 500;
    border: 1px solid transparent;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .tb-drop:hover,
  .tb-drop.open {
    color: var(--fg);
    background: rgba(255, 255, 255, 0.045);
    border-color: var(--bd);
  }
  .tb-drop.ep { color: var(--fg); font-weight: 600; }
  .tb-drop .chev,
  .tb-lang .chev {
    font-size: 10px; color: var(--fg-4);
    font-family: var(--mono); margin-top: 1px;
  }
  .tb-drop:hover .chev { color: var(--fg-2); }
  .tb-tabs {
    display: flex; align-items: stretch;
    height: 100%;
    margin-left: 2px;
  }
  .tb-tab {
    display: inline-flex; align-items: center;
    padding: 0 14px;
    color: var(--fg-3);
    font-size: 12.5px; font-weight: 500;
    letter-spacing: 0.01em;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: color 0.15s, border-color 0.15s;
  }
  .tb-tab:hover { color: var(--fg-2); }
  .tb-tab.cur {
    color: var(--fg);
    border-bottom-color: var(--accent);
  }
  .tb-right {
    margin-left: auto;
    display: flex; align-items: center; gap: 10px;
    flex-shrink: 0;
  }
  .tb-lang {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 4px 10px 4px 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--bd);
    color: var(--fg);
    font-size: 11.5px; font-weight: 500;
    letter-spacing: 0.02em;
    transition: background 0.15s, border-color 0.15s;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }
  .tb-lang:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.16);
  }
  .dropdown-menu {
    position: absolute;
    top: 34px;
    min-width: 170px;
    visibility: hidden;
    opacity: 0;
    background: rgba(10, 10, 14, 0.92);
    border: 1px solid var(--bd);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.42);
    z-index: 20;
    padding: 4px;
    -webkit-app-region: no-drag;
  }
  .dropdown-menu.project { left: 52px; }
  .dropdown-menu.episode { left: 176px; }
  .dropdown-menu.open {
    visibility: visible;
    opacity: 1;
  }
  .dropdown-item {
    padding: 6px 8px;
    color: var(--fg-2);
    font-size: 11.5px;
    white-space: nowrap;
  }
  .dropdown-item:hover {
    color: var(--fg);
    background: rgba(255, 255, 255, 0.05);
  }
`);

export class NfTopbar extends NfBase {
  static get observedAttributes(): string[] {
    return ["project-id", "episode-id", "current-tab", "current-lang"];
  }

  private openMenu: "project" | "episode" | null = null;

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

  private get currentTab(): TabId {
    const value = this.getAttribute("current-tab");
    return value === "script" || value === "slice" || value === "voice" || value === "edit" ? value : "edit";
  }

  private get currentLang(): LangId {
    return this.getAttribute("current-lang") === "en" ? "en" : "zh";
  }

  private readonly handleDataReady = (): void => {
    this.render();
  };

  private render(): void {
    const nativeShell = isNativeShell();
    this.classList.toggle("native", nativeShell);
    const data = getMockData();
    const episode = data.episodes.find((item) => item.id === this.getAttribute("episode-id")) ?? data.episodes[0]!;
    const episodeLabel = episode?.name ?? this.getAttribute("episode-id") ?? "EP";
    const projectLabel = data.source === "ipc" ? data.project.id : "NextFrame";
    const projectMenu = data.source === "ipc" && data.project.name !== data.project.id
      ? `${data.project.id} · ${data.project.name}`
      : data.project.name;
    const episodePrefix = data.source === "ipc"
      ? this.getAttribute("episode-id") ?? episode?.id ?? "ep"
      : "EP-01";
    this.root.innerHTML = `
      <div class="topbar ${nativeShell ? "native" : ""}">
        ${nativeShell ? "" : `<div class="tb-dots"><span class="r"></span><span class="y"></span><span class="g"></span></div><div class="tb-sep"></div>`}
        <div class="tb-crumb">
          <button class="tb-home" type="button" title="返回首页" data-action="home">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 11 L12 3 L21 11"></path>
              <path d="M5 10 V21 H19 V10"></path>
              <path d="M10 21 V14 H14 V21"></path>
            </svg>
          </button>
          <span class="slash">/</span>
          <button class="tb-drop ${this.openMenu === "project" ? "open" : ""}" type="button" title="切换项目" data-action="project">
            <span>${projectLabel}</span><span class="chev">˅</span>
          </button>
          <span class="slash">/</span>
          <button class="tb-drop ep ${this.openMenu === "episode" ? "open" : ""}" type="button" title="切换集" data-action="episode">
            <span>${episodePrefix} · ${episodeLabel}</span><span class="chev">˅</span>
          </button>
          <div class="dropdown-menu project ${this.openMenu === "project" ? "open" : ""}">
            <div class="dropdown-item">${projectMenu}</div>
            ${data.source === "ipc" ? "" : `<div class="dropdown-item">NextFrame Demo</div>`}
          </div>
          <div class="dropdown-menu episode ${this.openMenu === "episode" ? "open" : ""}">
            <div class="dropdown-item">${episodePrefix} · ${episodeLabel}</div>
            ${data.source === "ipc" ? "" : `<div class="dropdown-item">EP-02 · 产品演示</div>`}
          </div>
        </div>
        <div class="tb-sep"></div>
        <div class="tb-tabs">
          ${TABS.map((tab) => `<button class="tb-tab ${tab.id === this.currentTab ? "cur" : ""}" type="button" data-tab="${tab.id}">${tab.label}</button>`).join("")}
        </div>
        <div class="tb-right">
          <button class="tb-lang" type="button" data-action="lang">
            <span>${this.currentLang === "zh" ? "中文" : "English"}</span><span class="chev">˅</span>
          </button>
        </div>
      </div>
    `;
    this.bind();
  }

  private bind(): void {
    this.root.querySelectorAll<HTMLButtonElement>(".tb-tab").forEach((button) => {
      button.addEventListener("click", () => {
        const old = this.currentTab;
        const next = button.dataset.tab as TabId;
        this.setAttribute("current-tab", next);
        this.emit<TabChangeDetail>("tab-change", { old, new: next });
      });
    });
    this.root.querySelector<HTMLButtonElement>('[data-action="home"]')?.addEventListener("click", () => {
      this.emit("home-click", {});
    });
    this.root.querySelector<HTMLButtonElement>('[data-action="project"]')?.addEventListener("click", () => {
      this.openMenu = this.openMenu === "project" ? null : "project";
      this.emit("project-dropdown-open", {});
      this.render();
    });
    this.root.querySelector<HTMLButtonElement>('[data-action="episode"]')?.addEventListener("click", () => {
      this.openMenu = this.openMenu === "episode" ? null : "episode";
      this.emit("episode-dropdown-open", {});
      this.render();
    });
    this.root.querySelector<HTMLButtonElement>('[data-action="lang"]')?.addEventListener("click", () => {
      const old = this.currentLang;
      const next: LangId = old === "zh" ? "en" : "zh";
      this.setAttribute("current-lang", next);
      this.emit<LangChangeDetail>("lang-change", { old, new: next });
    });
  }
}

function isNativeShell(): boolean {
  return document.documentElement.getAttribute("data-nextframe-native") === "true";
}
