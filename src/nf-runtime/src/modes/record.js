// Record mode — externally driven. Reads `globalThis.__nfTick` set by host.

export function startRecord() {
  return {
    mode: "record",
    tick() {
      const t = globalThis.__nfTick ?? 0;
      return { t };
    },
  };
}
