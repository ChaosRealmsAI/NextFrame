"use strict";

(function () {
    const DEFAULT_RATIO = "16:9";
    const DEFAULT_VIEWPORT = {
        "16:9": { width: 1920, height: 1080 },
        "9:16": { width: 1080, height: 1920 },
        "1:1": { width: 1080, height: 1080 }
    };

    function asNumber(value, fallback) {
        return Number.isFinite(value) ? Number(value) : fallback;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function ratioNumber(ratio) {
        if (typeof ratio !== "string" || ratio.indexOf(":") < 0) {
            return DEFAULT_VIEWPORT[DEFAULT_RATIO].width / DEFAULT_VIEWPORT[DEFAULT_RATIO].height;
        }
        const parts = ratio.split(":").map(Number);
        if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1]) || parts[1] === 0) {
            return DEFAULT_VIEWPORT[DEFAULT_RATIO].width / DEFAULT_VIEWPORT[DEFAULT_RATIO].height;
        }
        return parts[0] / parts[1];
    }

    function viewportForRatio(ratio) {
        return DEFAULT_VIEWPORT[ratio] || DEFAULT_VIEWPORT[DEFAULT_RATIO];
    }

    function emptyParams() {
        return {};
    }

    function normalizeLayout(raw) {
        const source = raw || {};
        return {
            x: asNumber(source.x, 0),
            y: asNumber(source.y, 0),
            w: asNumber(source.w, asNumber(source.width, 100)),
            h: asNumber(source.h, asNumber(source.height, 100))
        };
    }

    function normalizeLayer(layer, index) {
        const raw = layer || {};
        const params = raw.params && typeof raw.params === "object" ? raw.params : emptyParams();
        return {
            id: typeof raw.id === "string" && raw.id.length ? raw.id : "layer-" + index,
            scene: typeof raw.scene === "string" && raw.scene.length ? raw.scene : "unknown",
            start: Math.max(0, asNumber(raw.start, 0)),
            dur: Math.max(0, asNumber(raw.dur, asNumber(raw.duration, 0))),
            layout: normalizeLayout(raw.layout || raw),
            params: params
        };
    }

    function normalizeTimeline(input) {
        const raw = typeof input === "string" ? JSON.parse(input) : (input || {});
        const ratio = typeof raw.ratio === "string" && raw.ratio.length ? raw.ratio : DEFAULT_RATIO;
        const viewport = viewportForRatio(ratio);
        const layers = Array.isArray(raw.layers) ? raw.layers.map(normalizeLayer) : [];
        const computedDuration = layers.reduce(function (maxEnd, layer) {
            return Math.max(maxEnd, layer.start + layer.dur);
        }, 0);
        return {
            version: typeof raw.version === "string" ? raw.version : "0.7",
            ratio: ratio,
            width: Math.max(1, Math.round(asNumber(raw.width, viewport.width))),
            height: Math.max(1, Math.round(asNumber(raw.height, viewport.height))),
            fps: Math.max(1, Math.round(asNumber(raw.fps, 30))),
            duration: Math.max(0, asNumber(raw.duration, computedDuration)),
            layers: layers
        };
    }

    function createNode(tag, className) {
        const node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        return node;
    }

    function setRootVar(name, value, stage) {
        document.documentElement.style.setProperty(name, value);
        if (stage) {
            stage.style.setProperty(name, value);
        }
    }

    function sceneTextSize(params, fallback) {
        const size = asNumber(params && params.fontSize, fallback);
        return Math.max(0.8, size) + "cqw";
    }

    function subtitleTextForTime(layer, time) {
        const relativeTime = time - layer.start;
        const cues = Array.isArray(layer.params && layer.params.srt) ? layer.params.srt : [];
        for (let i = 0; i < cues.length; i += 1) {
            const cue = cues[i] || {};
            const start = asNumber(cue.s, 0);
            const end = asNumber(cue.e, start);
            if (relativeTime >= start && relativeTime <= end) {
                return typeof cue.t === "string" ? cue.t : "";
            }
        }
        return "";
    }

    function buildSceneContent(layer) {
        const params = layer.params || emptyParams();
        if (layer.scene === "darkGradient") {
            const fill = createNode("div", "nf-scene-fill");
            fill.style.background = "radial-gradient(circle at 58% 28%, rgba(218,119,86,0.16), transparent 48%), linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.22) 100%), #12131a";
            return { node: fill, subtitleNode: null };
        }
        if (layer.scene === "videoClip") {
            const content = createNode("div", "nf-scene-content");
            content.textContent = typeof params.label === "string" && params.label.length ? params.label : "[video]";
            content.style.fontSize = "2cqw";
            return { node: content, subtitleNode: null };
        }
        if (layer.scene === "subtitleBar") {
            const content = createNode("div", "nf-subtitle-text");
            content.style.fontSize = sceneTextSize(params, 2.4);
            return { node: content, subtitleNode: content };
        }
        if (typeof params.text === "string" && params.text.length) {
            const content = createNode("div", "nf-scene-content");
            content.innerHTML = params.text;
            content.style.fontSize = sceneTextSize(params, 4.8);
            return { node: content, subtitleNode: null };
        }
        const fallback = createNode("div", "nf-scene-content");
        fallback.textContent = layer.scene;
        fallback.style.fontSize = "1.8cqw";
        return { node: fallback, subtitleNode: null };
    }

    function createWysiwygEngine(options) {
        const config = options || {};
        const state = {
            stage: config.stage || null,
            timeline: normalizeTimeline({ layers: [], duration: 0, ratio: DEFAULT_RATIO }),
            renderedLayers: [],
            currentTime: 0,
            isPlaying: false,
            ratio: DEFAULT_RATIO,
            rafId: 0,
            lastFrameAt: 0
        };

        function ensureStage() {
            if (!state.stage) {
                return null;
            }
            state.stage.classList.add("stage");
            state.stage.dataset.wysiwyg = "true";
            return state.stage;
        }

        function layerVisibleAt(layer, time) {
            return time >= layer.start && time <= layer.start + layer.dur;
        }

        function emitState() {
            if (typeof api.onStateChange === "function") {
                api.onStateChange(api.getState());
            }
        }

        function applyRatio(ratio) {
            state.ratio = typeof ratio === "string" && ratio.length ? ratio : DEFAULT_RATIO;
            const value = String(ratioNumber(state.ratio));
            document.body.dataset.ratio = state.ratio;
            setRootVar("--nf-ratio-num", value, state.stage);
        }

        function renderStage() {
            const stage = ensureStage();
            state.renderedLayers = [];
            if (!stage) {
                return;
            }
            stage.innerHTML = "";
            state.timeline.layers.forEach(function (layer, index) {
                const element = createNode("div", "nf-layer scene-" + layer.scene);
                const built = buildSceneContent(layer);
                const layout = layer.layout;
                element.dataset.index = String(index);
                element.dataset.layerId = layer.id;
                element.style.left = layout.x + "%";
                element.style.top = layout.y + "%";
                element.style.width = layout.w + "%";
                element.style.height = layout.h + "%";
                element.appendChild(built.node);
                stage.appendChild(element);
                state.renderedLayers.push({
                    element: element,
                    layer: layer,
                    subtitleNode: built.subtitleNode
                });
            });
        }

        function syncTime(seconds) {
            const duration = state.timeline.duration || 0;
            state.currentTime = clamp(asNumber(seconds, 0), 0, duration);
            setRootVar("--nf-time", state.currentTime + "s", state.stage);
            setRootVar("--nf-time-num", String(state.currentTime), state.stage);
            state.renderedLayers.forEach(function (entry) {
                const visible = layerVisibleAt(entry.layer, state.currentTime);
                entry.element.dataset.visible = visible ? "true" : "false";
                if (entry.subtitleNode) {
                    entry.subtitleNode.textContent = visible ? subtitleTextForTime(entry.layer, state.currentTime) : "";
                }
            });
            emitState();
            return api.getState();
        }

        function cancelPlayback() {
            if (state.rafId) {
                cancelAnimationFrame(state.rafId);
                state.rafId = 0;
            }
            state.lastFrameAt = 0;
        }

        function tick(now) {
            if (!state.isPlaying) {
                return;
            }
            if (!state.lastFrameAt) {
                state.lastFrameAt = now;
            }
            const nextTime = state.currentTime + Math.max(0, now - state.lastFrameAt) / 1000;
            state.lastFrameAt = now;
            if (nextTime >= state.timeline.duration) {
                syncTime(state.timeline.duration);
                api.pause();
                return;
            }
            syncTime(nextTime);
            state.rafId = requestAnimationFrame(tick);
        }

        const api = {
            onStateChange: null,
            loadTimeline(json) {
                try {
                    api.pause();
                    state.timeline = normalizeTimeline(json);
                    renderStage();
                    applyRatio(state.timeline.ratio || state.ratio);
                    syncTime(0);
                    return {
                        ok: true,
                        stats: {
                            duration: state.timeline.duration,
                            fps: state.timeline.fps,
                            ratio: state.ratio,
                            layerCount: state.timeline.layers.length,
                            sceneIds: state.timeline.layers.map(function (layer) { return layer.scene; })
                        }
                    };
                }
                catch (error) {
                    return {
                        ok: false,
                        stats: { duration: 0, fps: 0, ratio: state.ratio, layerCount: 0, sceneIds: [] },
                        error: error instanceof Error ? error.message : String(error)
                    };
                }
            },
            setTime(seconds) {
                return syncTime(seconds);
            },
            setRatio(ratio) {
                applyRatio(ratio);
                emitState();
                return api.getState();
            },
            play() {
                if (state.isPlaying) {
                    return api.getState();
                }
                if (state.currentTime >= state.timeline.duration) {
                    syncTime(0);
                }
                state.isPlaying = true;
                emitState();
                state.rafId = requestAnimationFrame(tick);
                return api.getState();
            },
            pause() {
                cancelPlayback();
                if (!state.isPlaying) {
                    return api.getState();
                }
                state.isPlaying = false;
                emitState();
                return api.getState();
            },
            toggle() {
                return state.isPlaying ? api.pause() : api.play();
            },
            getState() {
                return {
                    currentTime: state.currentTime,
                    duration: state.timeline.duration,
                    isPlaying: state.isPlaying,
                    ratio: state.ratio,
                    layerCount: state.timeline.layers.length
                };
            },
            diagnose() {
                return {
                    currentTime: state.currentTime,
                    duration: state.timeline.duration,
                    isPlaying: state.isPlaying,
                    ratio: state.ratio,
                    layerCount: state.timeline.layers.length,
                    stageChildren: state.stage ? state.stage.children.length : 0,
                    sceneIds: state.timeline.layers.map(function (layer) { return layer.scene; }),
                    mode: document.body.dataset.mode || "preview",
                    selected: -1
                };
            }
        };

        ensureStage();
        applyRatio(state.ratio);
        syncTime(0);
        window.__lastWysiwygEngine = api;
        window.__wysiwygDiagnose = function () {
            return JSON.stringify(api.diagnose());
        };
        return api;
    }

    window.createWysiwygEngine = window.createWysiwygEngine || createWysiwygEngine;
})();
