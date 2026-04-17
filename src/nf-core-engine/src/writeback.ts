// Structural diff + byte-stable write-back. Walking stub: string-equality no-op.

export interface WriteBackResult {
  changed: boolean;
  bytes: number;
}

export function writeBack(prevSource: string, nextSource: string): WriteBackResult {
  return {
    changed: prevSource !== nextSource,
    bytes: nextSource.length,
  };
}
