// IPC bridge compatibility layer for direct browser loading.
// The native shell injects the real bridge at document start. This file keeps
// preview and standalone browser loads from failing when that injection is absent.

type BridgeError = {
  code: string;
  message: string;
  hint?: string;
};

type BridgeResult<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: BridgeError };

type BridgeCall = <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<BridgeResult<T>>;

function createUnavailableResult<T = unknown>(method: string): BridgeResult<T> {
  return {
    ok: false,
    error: {
      code: 'IPC_UNAVAILABLE',
      message: `IPC bridge unavailable for ${method}`,
      hint: 'Launch NextFrame from nf-shell-mac or inject a compatible bridge before calling bridgeCall().',
    },
  };
}

if (typeof window.bridgeCall !== 'function') {
  const fallbackBridgeCall: BridgeCall = async function(method: string) {
    return createUnavailableResult(method);
  };

  window.bridgeCall = fallbackBridgeCall;
}
