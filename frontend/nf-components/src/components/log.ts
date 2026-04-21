import { makeSheet, NfBase } from "../_base.js";
import { escapeHtml, getEpisode } from "../storage.js";

const sheet = makeSheet(`
  :host {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    font-family: var(--font);
  }
  .panel-head {
    height: 38px; flex-shrink: 0;
    padding: 0 16px;
    display: flex; align-items: center; gap: 10px;
    border-bottom: 1px solid var(--bd);
    background: rgba(0, 0, 0, 0.22);
  }
  .panel-head .live {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--ok);
  }
  .panel-head .t {
    font-size: 10.5px; font-weight: 700;
    color: var(--fg); letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .panel-head .c {
    margin-left: auto;
    font-family: var(--mono); font-size: 10px;
    color: var(--amber-l); letter-spacing: 0.05em;
  }
  .ops-log {
    flex: 1; overflow-y: auto;
    padding: 10px 14px 16px;
    display: flex; flex-direction: column-reverse; gap: 6px;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.08) transparent;
  }
  .ops-log::-webkit-scrollbar { width: 3px; }
  .ops-log::-webkit-scrollbar-track { background: transparent; }
  .ops-log::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.08); }
  .log {
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--bd);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
    display: flex; flex-direction: column; gap: 7px;
    transition: background 0.15s, border-color 0.15s;
  }
  .log:hover {
    background: rgba(255, 255, 255, 0.038);
    border-color: rgba(255, 255, 255, 0.11);
  }
  .log-hd {
    display: flex; align-items: center; gap: 8px;
    font-family: var(--mono); font-size: 10px;
    color: var(--fg-2); letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .log-kind {
    font-weight: 700;
    padding: 1px 6px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: var(--fg-2);
    letter-spacing: 0.12em;
  }
  .log-kind.ai {
    color: var(--accent-l);
    border-color: rgba(167, 139, 250, 0.3);
    background: rgba(167, 139, 250, 0.06);
  }
  .log-time { margin-left: auto; color: var(--amber); opacity: 0.75; }
  .log-desc {
    font-size: 12px; color: var(--fg); line-height: 1.55;
  }
  .log-desc b { color: var(--fg); font-weight: 600; }
  .log-desc code {
    font-family: var(--mono); font-size: 10.5px;
    color: var(--accent-l);
    padding: 0 4px;
    background: var(--accent-t);
    border: 1px solid var(--bd-2);
  }
  .log-cli {
    font-family: var(--mono); font-size: 10.5px;
    padding: 6px 10px;
    background: rgba(0, 0, 0, 0.38);
    border: 1px solid var(--bd-2);
    color: var(--fg-2);
    overflow-x: auto; white-space: nowrap;
    scrollbar-width: none;
  }
  .log-cli::-webkit-scrollbar { display: none; }
  .log-cli::before { content: "$ "; color: var(--amber); }
  .log-cli .c { color: var(--accent-l); font-weight: 500; }
  .log-cli .f { color: var(--fg-3); }
  .log.pending {
    border-color: var(--amber-b);
    background: var(--amber-t);
  }
  .log.pending .log-cli::before { color: var(--amber); }
  .log.pending .log-time { color: var(--amber-l); opacity: 1; }
`);

export class NfLog extends NfBase {
  static get observedAttributes(): string[] {
    return ["reversed", "count"];
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
    const count = Number(this.getAttribute("count") ?? episode.log.length);
    const reversed = this.getAttribute("reversed") !== "false";
    const entries = [...episode.log].slice(-count);
    if (reversed) entries.reverse();
    this.root.innerHTML = `
      <div class="panel-head">
        <span class="live"></span>
        <span class="t">AI 操作日志</span>
        <span class="c">${episode.log.length} 条</span>
      </div>
      <div class="ops-log">
        ${entries.map((entry) => `
          <div class="log ${entry.pending ? "pending" : ""}">
            <div class="log-hd"><span class="log-kind ${entry.accent ? "ai" : ""}">${entry.actor}</span><span class="log-time">${entry.time}</span></div>
            <div class="log-desc">${entry.desc}</div>
            <div class="log-cli">${this.cliHtml(entry.cli)}</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  private cliHtml(cli: string): string {
    const parts = escapeHtml(cli).split(" ");
    const command = parts.slice(0, 2).join(" ");
    const rest = parts.slice(2).map((part) => part.startsWith("--") || part.startsWith("-")
      ? `<span class="f">${part}</span>`
      : part).join(" ");
    return `<span class="c">${command}</span>${rest ? ` ${rest}` : ""}`;
  }
}
