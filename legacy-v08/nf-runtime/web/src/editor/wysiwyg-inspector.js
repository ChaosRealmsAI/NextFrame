"use strict";
(function () {
    const PANEL_ID = 'ed-wysiwyg-inspector';
    const STYLE_ID = 'ed-wysiwyg-inspector-style';
    function injectStyles() {
        if (document.getElementById(STYLE_ID))
            return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent =
            '.ed-panel-wysiwyg{width:280px;flex:0 0 280px;display:flex;flex-direction:column;gap:12px;padding:12px;border-radius:12px;background:rgba(0,0,0,0.34);border:1px solid rgba(255,255,255,0.08);overflow:auto}' +
                '.ed-wysiwyg-title{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--t50)}' +
                '.ed-wysiwyg-empty{font-size:13px;color:var(--t50);line-height:1.6}' +
                '.ed-wysiwyg-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 8px}' +
                '.ed-wysiwyg-field{display:flex;flex-direction:column;gap:4px}' +
                '.ed-wysiwyg-field.ed-wide{grid-column:1 / -1}' +
                '.ed-wysiwyg-field label{font-size:11px;color:var(--t50)}' +
                '.ed-wysiwyg-field input{width:100%;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);color:var(--t100);font:500 12px var(--mono,ui-monospace,monospace)}' +
                '@media (max-width: 960px){.ed-body{flex-direction:column}.ed-panel-wysiwyg{width:auto;flex:0 0 auto;max-height:32vh}}';
        (document.head || document.documentElement).appendChild(style);
    }
    function ensurePanel() {
        injectStyles();
        const body = document.querySelector('.ed-body');
        if (!body)
            return null;
        let panel = document.getElementById(PANEL_ID);
        if (!panel) {
            panel = document.createElement('aside');
            panel.id = PANEL_ID;
            panel.className = 'ed-panel-wysiwyg';
            body.appendChild(panel);
        }
        return panel;
    }
    function toFinite(value, fallback) {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
    }
    function ensureLayout(layer) {
        if (!layer || typeof layer !== 'object')
            return { x: 0, y: 0, w: 100, h: 100 };
        if (!layer.layout || typeof layer.layout !== 'object')
            layer.layout = {};
        layer.layout.x = toFinite(layer.layout.x !== undefined ? layer.layout.x : layer.x, 0);
        layer.layout.y = toFinite(layer.layout.y !== undefined ? layer.layout.y : layer.y, 0);
        layer.layout.w = toFinite(layer.layout.w !== undefined ? layer.layout.w : (layer.w !== undefined ? layer.w : layer.width), 100);
        layer.layout.h = toFinite(layer.layout.h !== undefined ? layer.layout.h : (layer.h !== undefined ? layer.h : layer.height), 100);
        return layer.layout;
    }
    function applyLayerStyle(index) {
        const layers = Array.isArray(window.timeline) ? window.timeline : [];
        const layer = layers[index];
        const layerEl = document.querySelector('.nf-layer[data-index="' + index + '"]');
        if (!layer || !layerEl)
            return;
        const layout = ensureLayout(layer);
        layer.x = layout.x;
        layer.y = layout.y;
        layer.w = layout.w;
        layer.h = layout.h;
        layer.width = layout.w;
        layer.height = layout.h;
        layerEl.style.left = layout.x + '%';
        layerEl.style.top = layout.y + '%';
        layerEl.style.width = layout.w + '%';
        layerEl.style.height = layout.h + '%';
    }
    function escapeAttr(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
    function renderField(name, label, value, type, step, wide) {
        return '<div class="ed-wysiwyg-field' + (wide ? ' ed-wide' : '') + '">' +
            '<label for="' + name + '">' + label + '</label>' +
            '<input id="' + name + '" name="' + name + '" type="' + type + '" value="' + escapeAttr(value) + '"' +
            (step ? ' step="' + step + '"' : '') + '>' +
            '</div>';
    }
    function renderInspector() {
        const panel = ensurePanel();
        if (!panel)
            return null;
        const index = typeof window.__wysiwygGetSelected === 'function'
            ? Number(window.__wysiwygGetSelected())
            : -1;
        const layers = Array.isArray(window.timeline) ? window.timeline : [];
        const layer = layers[index];
        if (!layer) {
            panel.innerHTML = '<div class="ed-wysiwyg-title">Inspector</div><div class="ed-wysiwyg-empty">选择一个图层后可直接编辑位置、尺寸和时间。</div>';
            return panel;
        }
        const layout = ensureLayout(layer);
        panel.innerHTML =
            '<div class="ed-wysiwyg-title">Inspector</div>' +
                '<form class="ed-wysiwyg-grid">' +
                renderField('layer-id', 'id', layer.id || '', 'text', '', true) +
                renderField('layer-start', 'start', toFinite(layer.start, 0), 'number', '0.1', false) +
                renderField('layer-dur', 'dur', toFinite(layer.dur !== undefined ? layer.dur : layer.duration, 0), 'number', '0.1', false) +
                renderField('layer-x', 'x %', layout.x, 'number', '0.1', false) +
                renderField('layer-y', 'y %', layout.y, 'number', '0.1', false) +
                renderField('layer-w', 'w %', layout.w, 'number', '0.1', false) +
                renderField('layer-h', 'h %', layout.h, 'number', '0.1', false) +
                '</form>';
        const form = panel.querySelector('form');
        if (!form)
            return panel;
        form.addEventListener('input', function (event) {
            const target = event.target;
            if (!(target instanceof HTMLInputElement))
                return;
            const nextIndex = typeof window.__wysiwygGetSelected === 'function'
                ? Number(window.__wysiwygGetSelected())
                : -1;
            const nextLayer = layers[nextIndex];
            if (!nextLayer)
                return;
            const nextLayout = ensureLayout(nextLayer);
            if (target.name === 'layer-id')
                nextLayer.id = target.value;
            if (target.name === 'layer-start')
                nextLayer.start = toFinite(target.value, nextLayer.start || 0);
            if (target.name === 'layer-dur') {
                const duration = toFinite(target.value, nextLayer.dur !== undefined ? nextLayer.dur : nextLayer.duration);
                nextLayer.dur = duration;
                nextLayer.duration = duration;
            }
            if (target.name === 'layer-x')
                nextLayout.x = toFinite(target.value, nextLayout.x);
            if (target.name === 'layer-y')
                nextLayout.y = toFinite(target.value, nextLayout.y);
            if (target.name === 'layer-w')
                nextLayout.w = toFinite(target.value, nextLayout.w);
            if (target.name === 'layer-h')
                nextLayout.h = toFinite(target.value, nextLayout.h);
            applyLayerStyle(nextIndex);
        });
        return panel;
    }
    window.addEventListener('wysiwyg:selection-changed', renderInspector);
    window.addEventListener('wysiwyg:layout-changed', renderInspector);
    window.addEventListener('wysiwyg:text-changed', renderInspector);
    window.wysiwygInspector = {
        render: renderInspector,
        applyLayerStyle: applyLayerStyle
    };
    window.renderEditorInspector = renderInspector;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderInspector, { once: true });
    }
    else {
        renderInspector();
    }
})();
