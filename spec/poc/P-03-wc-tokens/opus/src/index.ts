import "./components/nf-demo.js";
import "./components/nf-track.js";
import "./components/nf-perf.js";

// Tiny helper exposed on window for runtime tests (see test-harness.ts calls).
declare global {
  interface Window {
    __POC__: {
      readAccentFromShadow: () => string;
      readTabColor: () => string;
      readStripeBg: (kind: string) => string;
      injectRedAll: () => void;
      removeRedAll: () => void;
      flipAccent: (v: string) => void;
      benchInline: (n: number) => number;
      benchAdopted: (n: number) => number;
      benchRepaint: () => number;
    };
  }
}

function q<T extends Element = Element>(sel: string): T {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`missing selector: ${sel}`);
  return el as T;
}

function shadowQ(host: string, inner: string): Element {
  const h = q(host) as HTMLElement & { shadowRoot: ShadowRoot | null };
  if (!h.shadowRoot) throw new Error(`no shadow on ${host}`);
  const el = h.shadowRoot.querySelector(inner);
  if (!el) throw new Error(`no ${inner} inside ${host}`);
  return el;
}

window.__POC__ = {
  readAccentFromShadow(): string {
    const box = shadowQ("nf-demo#d1", ".box");
    return getComputedStyle(box).backgroundColor;
  },
  readTabColor(): string {
    const tab = shadowQ("nf-demo#d1", ".tab.cur");
    return getComputedStyle(tab).color;
  },
  readStripeBg(kind: string): string {
    const stripe = shadowQ(`nf-track[kind="${kind}"]`, ".stripe");
    return getComputedStyle(stripe).backgroundColor;
  },
  injectRedAll(): void {
    const s = document.createElement("style");
    s.id = "red-all";
    s.textContent = "* { color: red !important }";
    document.head.appendChild(s);
  },
  removeRedAll(): void {
    document.getElementById("red-all")?.remove();
  },
  flipAccent(v: string): void {
    document.documentElement.style.setProperty("--accent", v);
  },

  /** D1: 内联 <style> 方案 — 每组件自带一份 CSS 文本 */
  benchInline(n: number): number {
    const host = q<HTMLDivElement>("#perf-host-inline");
    host.innerHTML = "";
    performance.mark("inline-start");
    for (let i = 0; i < n; i++) {
      const el = document.createElement("nf-demo");
      el.id = `inl-${i}`;
      host.appendChild(el);
    }
    // force layout
    void host.offsetHeight;
    performance.mark("inline-end");
    const m = performance.measure("inline", "inline-start", "inline-end");
    return m.duration;
  },
  /** D2: adoptedStyleSheets 方案 */
  benchAdopted(n: number): number {
    const host = q<HTMLDivElement>("#perf-host-adopted");
    host.innerHTML = "";
    performance.mark("adopted-start");
    for (let i = 0; i < n; i++) {
      const el = document.createElement("nf-perf");
      el.id = `ado-${i}`;
      host.appendChild(el);
    }
    void host.offsetHeight;
    performance.mark("adopted-end");
    const m = performance.measure("adopted", "adopted-start", "adopted-end");
    return m.duration;
  },
  /** D3: repaint on var switch — 两组都应联动 */
  benchRepaint(): number {
    performance.mark("rp-start");
    document.documentElement.style.setProperty("--accent", "#ff3355");
    // trigger paint
    void document.body.offsetHeight;
    performance.mark("rp-end");
    const m = performance.measure("rp", "rp-start", "rp-end");
    return m.duration;
  },
};

// dev signal
console.log("[POC] components registered:", {
  "nf-demo": customElements.get("nf-demo") != null,
  "nf-track": customElements.get("nf-track") != null,
  "nf-perf": customElements.get("nf-perf") != null,
});
