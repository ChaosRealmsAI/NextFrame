"use strict";
// Browser DOM preview engine for scene-bundle timelines inside WKWebView.
(function () {
    const state = {
        timeline: { layers: [], duration: 0, width: 1920, height: 1080, fps: 30 },
        currentTime: 0,
        isPlaying: false,
        stageEl: null,
        rafId: 0,
        lastNow: 0,
        selectedIndex: -1,
        _intervalId: 0
    };
    function toFinite(value, fallback) {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
    }
    function getLayerLayout(layer) {
        const layout = layer && typeof layer.layout === 'object' ? layer.layout : {};
        return {
            x: toFinite(layout.x !== undefined ? layout.x : layer && layer.x, 0),
            y: toFinite(layout.y !== undefined ? layout.y : layer && layer.y, 0),
            w: toFinite(layout.w !== undefined ? layout.w : (layer && (layer.w !== undefined ? layer.w : layer.width)), 100),
            h: toFinite(layout.h !== undefined ? layout.h : (layer && (layer.h !== undefined ? layer.h : layer.height)), 100)
        };
    }
    function applyLayoutToLayerData(layer, nextLayout) {
        if (!layer || !nextLayout)
            return;
        if (!layer.layout || typeof layer.layout !== 'object')
            layer.layout = {};
        layer.layout.x = nextLayout.x;
        layer.layout.y = nextLayout.y;
        layer.layout.w = nextLayout.w;
        layer.layout.h = nextLayout.h;
        layer.x = nextLayout.x;
        layer.y = nextLayout.y;
        layer.w = nextLayout.w;
        layer.h = nextLayout.h;
        layer.width = nextLayout.w;
        layer.height = nextLayout.h;
    }
    function applyLayerStyle(el, layer) {
        if (!el)
            return;
        const layout = getLayerLayout(layer);
        el.style.left = layout.x + '%';
        el.style.top = layout.y + '%';
        el.style.width = layout.w + '%';
        el.style.height = layout.h + '%';
    }
    function syncGlobals() {
        window.timeline = state.timeline.layers;
        window.__wysiwygTimeline = state.timeline;
    }
    function emitSelectionChange() {
        const index = state.selectedIndex;
        const layer = index >= 0 ? state.timeline.layers[index] || null : null;
        window.dispatchEvent(new CustomEvent('wysiwyg:selection-changed', {
            detail: { index: index, layer: layer }
        }));
    }
    function emitStageRendered() {
        window.dispatchEvent(new CustomEvent('wysiwyg:stage-rendered', {
            detail: { selectedIndex: state.selectedIndex }
        }));
    }
    function getDuration(layer) {
        const value = Number.isFinite(layer && layer.dur) ? layer.dur : layer && layer.duration;
        return Number.isFinite(value) && value > 0 ? value : 0;
    }
    function clampTime(t) {
        const duration = state.timeline.duration || 0;
        const safe = Number.isFinite(t) ? t : 0;
        return Math.max(0, Math.min(duration, safe));
    }
    function renderTime(t) {
        const safe = clampTime(t);
        if (safe < state.timeline.duration)
            return safe;
        const fps = Math.max(1, state.timeline.fps || 30);
        return Math.max(0, safe - 1 / fps / 1000);
    }
    function viewport() {
        const width = state.timeline.width || 1920;
        const height = state.timeline.height || 1080;
        return { width: width, height: height, fps: state.timeline.fps || 30, aspectRatio: width / Math.max(height, 1) };
    }
    function getState() {
        return { currentTime: state.currentTime, duration: state.timeline.duration || 0, isPlaying: state.isPlaying };
    }
    function emitState() {
        if (window.parent && window.parent !== window)
            window.parent.postMessage(Object.assign({ type: 'nf-state' }, getState()), '*');
        if (typeof api.onStateChange === 'function')
            api.onStateChange(getState());
    }
    function applySelection() {
        if (!state.stageEl)
            return;
        state.stageEl.querySelectorAll('.nf-layer').forEach(function (el) {
            const isSelected = Number(el.dataset.index) === state.selectedIndex;
            el.classList.toggle('is-selected', isSelected);
            el.style.outline = isSelected ? '2px dashed #3b82f6' : '';
        });
    }
    function compose(t) {
        state.currentTime = clampTime(t);
        const active = [];
        const at = renderTime(state.currentTime);
        const layers = state.timeline.layers || [];
        const scenes = window.__scenes || {};
        for (let i = 0; i < layers.length; i += 1) {
            const layer = layers[i] || { start: 0 };
            const start = Number.isFinite(layer.start) ? layer.start : 0;
            const dur = getDuration(layer);
            if (dur <= 0 || at < start || at >= start + dur)
                continue;
            const entry = scenes[layer.scene];
            const html = entry && typeof entry.render === 'function' ? entry.render(at - start, (layer.params || {}), viewport()) : '';
            active.push({ scene: layer.scene || '', index: i, layerData: layer, markup: '' });
            if (state.stageEl) {
                active[active.length - 1].markup =
                    '<div class="nf-layer" data-layer="' + (layer.scene || '') + '" data-index="' + i + '" style="position:absolute;pointer-events:auto;z-index:' + i + '">' +
                        (typeof html === 'string' ? html : '') +
                        '</div>';
            }
        }
        if (state.stageEl) {
            var existing = state.stageEl.querySelectorAll('.nf-layer');
            var activeIndices = {};
            active.forEach(function (item) { activeIndices[item.index] = item; });
            // Remove layers no longer active (skip those with persist elements)
            existing.forEach(function (el) {
                var idx = Number(el.dataset.index);
                if (!activeIndices[idx])
                    el.remove();
            });
            // Update or create each active layer
            active.forEach(function (item) {
                var el = state.stageEl.querySelector('.nf-layer[data-index="' + item.index + '"]');
                if (el) {
                    // Preserve video/audio elements with data-nf-persist
                    var persist = el.querySelector('[data-nf-persist]');
                    if (!persist) {
                        el.innerHTML = item.markup.replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '');
                    }
                }
                else {
                    var tmp = document.createElement('div');
                    tmp.innerHTML = item.markup;
                    if (tmp.firstChild)
                        state.stageEl.appendChild(tmp.firstChild);
                    el = state.stageEl.querySelector('.nf-layer[data-index="' + item.index + '"]');
                }
                applyLayerStyle(el, item.layerData);
            });
            applySelection();
            syncVideos(at, state.isPlaying);
            emitStageRendered();
        }
        return active.map(function (item) { return { scene: item.scene, index: item.index, layerData: item.layerData }; });
    }
    function primeVideoFrame(video, t) {
        if (video.dataset.nfPrimed === '1')
            return;
        var p = video.play();
        if (p && typeof p.then === 'function') {
            p.then(function () {
                setTimeout(function () {
                    video.pause();
                    if (Math.abs(video.currentTime - t) > 0.05)
                        video.currentTime = t;
                    video.dataset.nfPrimed = '1';
                }, 80);
            }).catch(function () { });
        }
    }
    function syncVideos(t, playing) {
        if (!state.stageEl)
            return;
        state.stageEl.querySelectorAll('video[data-nf-persist]').forEach(function (v) {
            if (playing) {
                if (v.paused)
                    v.play().catch(function () { });
            }
            else {
                primeVideoFrame(v, t);
                if (!v.paused)
                    v.pause();
            }
            if (!playing && Math.abs(v.currentTime - t) > 0.2)
                v.currentTime = t;
        });
    }
    function pause() {
        if (state.rafId)
            cancelAnimationFrame(state.rafId);
        state.rafId = 0;
        state.lastNow = 0;
        if (state._intervalId) {
            clearInterval(state._intervalId);
            state._intervalId = 0;
        }
        if (!state.isPlaying)
            return getState();
        state.isPlaying = false;
        emitState();
        return getState();
    }
    function tick(now) {
        if (!state.isPlaying)
            return;
        if (!state.lastNow)
            state.lastNow = now;
        state.currentTime = clampTime(state.currentTime + Math.max(0, now - state.lastNow) / 1000);
        state.lastNow = now;
        compose(state.currentTime);
        emitState();
        if (state.currentTime >= state.timeline.duration) {
            pause();
            return;
        }
        state.rafId = requestAnimationFrame(tick);
    }
    function play() {
        if (state.isPlaying)
            return getState();
        if (state.currentTime >= state.timeline.duration)
            state.currentTime = 0;
        state.isPlaying = true;
        state.lastNow = 0;
        compose(state.currentTime);
        emitState();
        state.rafId = requestAnimationFrame(tick);
        // Fallback: setInterval in case rAF doesn't fire (WKWebView pump_run_loop)
        if (!state._intervalId) {
            state._intervalId = setInterval(function () {
                if (!state.isPlaying) {
                    clearInterval(state._intervalId);
                    state._intervalId = 0;
                    return;
                }
                tick(performance.now());
            }, 33);
        }
        return getState();
    }
    function seek(t) {
        compose(t);
        emitState();
        return getState();
    }
    function toggle() {
        return state.isPlaying ? pause() : play();
    }
    function onStageClick(event) {
        const target = event.target instanceof Element ? event.target : null;
        const layerEl = target ? target.closest('.nf-layer') : null;
        if (!layerEl || !state.stageEl || !state.stageEl.contains(layerEl))
            return;
        if (state.isPlaying)
            pause();
        state.selectedIndex = Number(layerEl.dataset.index);
        applySelection();
        emitSelectionChange();
        const layerData = state.timeline.layers[state.selectedIndex];
        if (typeof api.onSelect === 'function' && layerData) {
            api.onSelect({ scene: layerData.scene, index: state.selectedIndex, layerData: layerData });
        }
    }
    function setStage(el) {
        if (state.stageEl)
            state.stageEl.removeEventListener('click', onStageClick);
        state.stageEl = el || null;
        if (!state.stageEl)
            return;
        if (window.getComputedStyle(state.stageEl).position === 'static')
            state.stageEl.style.position = 'relative';
        if (!state.stageEl.style.overflow)
            state.stageEl.style.overflow = 'hidden';
        state.stageEl.addEventListener('click', onStageClick);
        compose(state.currentTime);
    }
    function loadTimeline(json) {
        const source = typeof json === 'string' ? JSON.parse(json) : (json || {});
        const layers = Array.isArray(source.layers) ? source.layers.slice() : [];
        const duration = Number.isFinite(source.duration) ? source.duration : layers.reduce(function (maxEnd, layer) {
            const start = Number.isFinite(layer && layer.start) ? layer.start : 0;
            return Math.max(maxEnd, start + getDuration(layer));
        }, 0);
        state.timeline = {
            layers: layers,
            duration: duration,
            width: source.width || (source.project && source.project.width) || 1920,
            height: source.height || (source.project && source.project.height) || 1080,
            fps: source.fps || (source.project && source.project.fps) || 30
        };
        syncGlobals();
        state.currentTime = 0;
        state.selectedIndex = -1;
        pause();
        compose(0);
        emitState();
        return { duration: duration, layerCount: layers.length, width: state.timeline.width, height: state.timeline.height };
    }
    function select(index) {
        const next = Number(index);
        state.selectedIndex = Number.isFinite(next) && next >= 0 && next < state.timeline.layers.length ? next : -1;
        applySelection();
        emitSelectionChange();
    }
    const api = {
        loadTimeline: loadTimeline,
        compose: compose,
        play: play,
        pause: pause,
        seek: seek,
        toggle: toggle,
        select: select,
        getState: getState,
        setStage: setStage,
        onStateChange: null,
        onSelect: null
    };
    window.previewEngine = api;
    window.__wysiwygGetSelected = getSelected;
    window.__wysiwygSelect = select;
    window.__nfPlay = play;
    window.__nfPause = pause;
    window.__nfSeek = seek;
    window.__nfToggle = toggle;
    window.__nfState = getState;
    function getSelected() {
        return state.selectedIndex;
    }
    window.addEventListener('wysiwyg:layout-changed', function (event) {
        const detail = event.detail || {};
        const index = Number(detail.index);
        const layer = state.timeline.layers[index];
        if (!layer)
            return;
        const nextLayout = {
            x: toFinite(detail.layout && detail.layout.x, getLayerLayout(layer).x),
            y: toFinite(detail.layout && detail.layout.y, getLayerLayout(layer).y),
            w: toFinite(detail.layout && detail.layout.w, getLayerLayout(layer).w),
            h: toFinite(detail.layout && detail.layout.h, getLayerLayout(layer).h)
        };
        applyLayoutToLayerData(layer, nextLayout);
        syncGlobals();
        if (state.stageEl) {
            applyLayerStyle(state.stageEl.querySelector('.nf-layer[data-index="' + index + '"]'), layer);
        }
    });
    window.addEventListener('wysiwyg:text-changed', function (event) {
        const detail = event.detail || {};
        const index = Number(detail.index);
        const layer = state.timeline.layers[index];
        if (!layer)
            return;
        const text = typeof detail.text === 'string' ? detail.text : '';
        if (typeof layer.text === 'string' && (!layer.params || typeof layer.params !== 'object' || layer.params.text === undefined)) {
            layer.text = text;
        }
        else {
            if (!layer.params || typeof layer.params !== 'object')
                layer.params = {};
            layer.params.text = text;
        }
        syncGlobals();
    });
    window.addEventListener('message', function (event) {
        const data = event.data || {};
        if (data.type !== 'nf-cmd')
            return;
        if (data.action === 'seek')
            seek(data.time);
        if (data.action === 'play')
            play();
        if (data.action === 'pause')
            pause();
        if (data.action === 'toggle')
            toggle();
    });
})();
