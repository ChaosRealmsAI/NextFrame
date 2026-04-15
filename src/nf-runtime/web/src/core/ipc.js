"use strict";
// IPC bridge compatibility layer for direct browser loading.
// The native shell injects the real bridge at document start. This file keeps
// preview and standalone browser loads from failing when that injection is absent.
function createUnavailableResult(method) {
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
    const fallbackBridgeCall = async function (method) {
        return createUnavailableResult(method);
    };
    window.bridgeCall = fallbackBridgeCall;
}
