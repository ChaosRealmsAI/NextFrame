"use strict";
// Read-only DOM diagnose helper for AI verification.
(function () {
    if (window.__wysiwygDiagnose) {
        return;
    }
    function getStage() {
        return document.getElementById("stage")
            || document.getElementById("preview-stage")
            || document.querySelector(".ed-preview-stage")
            || document.body;
    }
    function readNumberVar(stage, name) {
        const raw = window.getComputedStyle(stage).getPropertyValue(name).trim();
        const value = Number(raw);
        return Number.isFinite(value) ? value : 0;
    }
    function readBool(value) {
        return value === "true" || value === "1";
    }
    window.__wysiwygDiagnose = function () {
        const body = document.body || document.createElement("body");
        const stage = getStage();
        const layers = Array.prototype.slice.call(document.querySelectorAll(".nf-layer"));
        const selected = typeof window.__wysiwygGetSelected === "function"
            ? window.__wysiwygGetSelected()
            : -1;
        return JSON.stringify({
            ratio: body.dataset.ratio || "",
            mode: body.dataset.mode || "",
            currentTime: readNumberVar(stage, "--nf-time-num"),
            duration: readNumberVar(stage, "--nf-dur-num"),
            isPlaying: readBool(body.dataset.wysiwygPlaying || ""),
            selected: selected,
            layerCount: layers.length,
            stageChildren: layers.length,
            sceneIds: layers.map(function (layer) { return layer.dataset.layerId || ""; }),
        });
    };
})();
