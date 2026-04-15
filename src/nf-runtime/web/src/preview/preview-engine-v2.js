"use strict";
// Browser WYSIWYG preview engine skeleton for the v0.7 DOM-first path.
(function () {
    function createWysiwygEngine(options) {
        const config = options || {};
        const state = {
            stage: config.stage || null,
            timeline: null,
            time: 0,
            selectedLayer: -1,
            ratio: "",
        };
        const api = {
            loadTimeline(timeline) {
                state.timeline = timeline || null;
                emitState();
                return api.getState();
            },
            setTime(time) {
                state.time = Number.isFinite(time) ? time : 0;
                emitState();
                return api.getState();
            },
            selectLayer(layer) {
                state.selectedLayer = Number.isInteger(layer) ? layer : -1;
                emitState();
                return api.getState();
            },
            setRatio(ratio) {
                state.ratio = typeof ratio === "string" ? ratio : "";
                emitState();
                return api.getState();
            },
            getState() {
                return {
                    stage: state.stage,
                    timeline: state.timeline,
                    time: state.time,
                    selectedLayer: state.selectedLayer,
                    ratio: state.ratio,
                };
            },
            diagnose() {
                return {
                    status: "stub",
                    mode: "v0.7-walking-skeleton",
                    hasStage: Boolean(state.stage),
                    hasTimeline: Boolean(state.timeline),
                    selectedLayer: state.selectedLayer,
                    time: state.time,
                    ratio: state.ratio,
                };
            },
            onStateChange: null,
        };
        function emitState() {
            if (typeof api.onStateChange === "function") {
                api.onStateChange(api.getState());
            }
        }
        return api;
    }
    window.createWysiwygEngine = window.createWysiwygEngine || createWysiwygEngine;
})();
