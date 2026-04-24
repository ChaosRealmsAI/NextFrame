/**
 * <nf-track kind="scene|text|audio">
 *   Test C: :host([kind=...]) attribute selector dispatches background.
 */
export class NfTrack extends HTMLElement {
  static get observedAttributes() {
    return ["kind"];
  }

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host {
          display: block;
          margin: 6px 0;
          padding: 10px 14px;
          border: 1px solid var(--bd, #444);
          background: var(--panel, #111);
          font-family: var(--mono);
          font-size: 13px;
          color: var(--fg);
        }
        .stripe {
          display: inline-block;
          width: 120px;
          height: 22px;
          margin-right: 12px;
          vertical-align: middle;
          background: var(--gray);
        }
        :host([kind="scene"]) .stripe { background: var(--accent); }
        :host([kind="text"])  .stripe { background: var(--amber); }
        :host([kind="audio"]) .stripe { background: var(--teal); }
        .label { vertical-align: middle; }
      </style>
      <span class="stripe" part="stripe"></span>
      <span class="label"><slot>track</slot></span>
    `;
  }
}

customElements.define("nf-track", NfTrack);
