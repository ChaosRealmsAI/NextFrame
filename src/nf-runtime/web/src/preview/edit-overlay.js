"use strict";
(function () {
    const HANDLE_CORNERS = ['nw', 'ne', 'sw', 'se'];
    const STYLE_ID = 'nf-edit-overlay-style';
    let dragState = null;
    function injectStyles() {
        if (document.getElementById(STYLE_ID))
            return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent =
            '.nf-layer{transform-origin:0 0}' +
                '.nf-layer.is-selected{outline:2px solid #3b82f6;outline-offset:2px}' +
                '.nf-handle{position:absolute;width:10px;height:10px;background:#fff;border:2px solid #3b82f6;border-radius:3px;display:none;z-index:100;box-shadow:0 4px 10px rgba(0,0,0,0.35)}' +
                '.nf-layer.is-selected>.nf-handle{display:block}' +
                '.nf-handle.nw{left:-5px;top:-5px;cursor:nwse-resize}' +
                '.nf-handle.ne{right:-5px;top:-5px;cursor:nesw-resize}' +
                '.nf-handle.sw{left:-5px;bottom:-5px;cursor:nesw-resize}' +
                '.nf-handle.se{right:-5px;bottom:-5px;cursor:nwse-resize}' +
                '[data-mode="export"] .nf-handle,[data-mode="record"] .nf-handle{display:none !important}';
        (document.head || document.documentElement).appendChild(style);
    }
    function isEditableTarget(target) {
        return !!(target && (target.isContentEditable || target.closest('[contenteditable="true"]')));
    }
    function toPercent(delta, size) {
        return size > 0 ? delta / size * 100 : 0;
    }
    function toNumber(value, fallback) {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
    }
    function readLayoutFromElement(layerEl) {
        return {
            x: toNumber(layerEl.style.left, 0),
            y: toNumber(layerEl.style.top, 0),
            w: toNumber(layerEl.style.width, 100),
            h: toNumber(layerEl.style.height, 100)
        };
    }
    function clampLayout(layout) {
        const next = {
            x: Math.max(0, Math.min(100, layout.x)),
            y: Math.max(0, Math.min(100, layout.y)),
            w: Math.max(1, Math.min(100, layout.w)),
            h: Math.max(1, Math.min(100, layout.h))
        };
        next.x = Math.min(next.x, Math.max(0, 100 - next.w));
        next.y = Math.min(next.y, Math.max(0, 100 - next.h));
        return next;
    }
    function applyLayout(layerEl, layout) {
        const next = clampLayout(layout);
        layerEl.style.left = next.x + '%';
        layerEl.style.top = next.y + '%';
        layerEl.style.width = next.w + '%';
        layerEl.style.height = next.h + '%';
        return next;
    }
    function ensureHandles(layerEl) {
        HANDLE_CORNERS.forEach(function (corner) {
            if (layerEl.querySelector('.nf-handle.' + corner))
                return;
            const handle = document.createElement('div');
            handle.className = 'nf-handle ' + corner;
            handle.dataset.corner = corner;
            layerEl.appendChild(handle);
        });
    }
    function refresh() {
        injectStyles();
        document.querySelectorAll('.nf-layer.is-selected').forEach(function (layerEl) {
            ensureHandles(layerEl);
        });
    }
    function finishDrag() {
        if (!dragState)
            return;
        const detail = {
            index: dragState.index,
            layout: clampLayout(readLayoutFromElement(dragState.layerEl))
        };
        if (dragState.moved) {
            window.dispatchEvent(new CustomEvent('wysiwyg:layout-changed', { detail: detail }));
        }
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        dragState = null;
    }
    function onPointerMove(event) {
        if (!dragState)
            return;
        const dx = toPercent(event.clientX - dragState.startX, dragState.stageRect.width);
        const dy = toPercent(event.clientY - dragState.startY, dragState.stageRect.height);
        const base = dragState.layout;
        const next = {
            x: base.x,
            y: base.y,
            w: base.w,
            h: base.h
        };
        dragState.moved = true;
        if (dragState.kind === 'move') {
            next.x = base.x + dx;
            next.y = base.y + dy;
        }
        else {
            const corner = dragState.corner || '';
            if (corner.indexOf('e') >= 0)
                next.w = base.w + dx;
            if (corner.indexOf('s') >= 0)
                next.h = base.h + dy;
            if (corner.indexOf('w') >= 0) {
                next.x = base.x + dx;
                next.w = base.w - dx;
            }
            if (corner.indexOf('n') >= 0) {
                next.y = base.y + dy;
                next.h = base.h - dy;
            }
        }
        applyLayout(dragState.layerEl, next);
    }
    function onPointerUp() {
        finishDrag();
    }
    function startDrag(layerEl, kind, corner, event) {
        const stage = layerEl.parentElement;
        if (!stage)
            return;
        dragState = {
            kind: kind,
            corner: corner,
            index: Number(layerEl.dataset.index),
            layerEl: layerEl,
            startX: event.clientX,
            startY: event.clientY,
            moved: false,
            layout: readLayoutFromElement(layerEl),
            stageRect: stage.getBoundingClientRect()
        };
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
    }
    function findEditableNode(layerEl, target) {
        if (target && target !== layerEl && target.textContent && target.textContent.trim())
            return target;
        const descendants = Array.from(layerEl.querySelectorAll('*'));
        for (let i = 0; i < descendants.length; i += 1) {
            const node = descendants[i];
            if (node.children.length === 0 && node.textContent && node.textContent.trim())
                return node;
        }
        return null;
    }
    document.addEventListener('pointerdown', function (event) {
        if (!document.body || document.body.dataset.mode !== 'edit')
            return;
        const target = event.target instanceof Element ? event.target : null;
        const handle = target ? target.closest('.nf-handle') : null;
        if (handle) {
            event.preventDefault();
            startDrag(handle.parentElement, 'resize', handle.dataset.corner || '', event);
            return;
        }
        if (isEditableTarget(target))
            return;
        const layerEl = target ? target.closest('.nf-layer') : null;
        if (!layerEl)
            return;
        startDrag(layerEl, 'move', '', event);
    });
    document.addEventListener('dblclick', function (event) {
        if (!document.body || document.body.dataset.mode !== 'edit')
            return;
        const target = event.target instanceof Element ? event.target : null;
        if (!target || target.closest('.nf-handle'))
            return;
        const layerEl = target.closest('.nf-layer');
        if (!layerEl)
            return;
        const editable = findEditableNode(layerEl, target);
        if (!editable)
            return;
        const index = Number(layerEl.dataset.index);
        editable.setAttribute('contenteditable', 'true');
        editable.focus();
        const range = document.createRange();
        range.selectNodeContents(editable);
        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
        }
        const onBlur = function () {
            editable.removeEventListener('blur', onBlur);
            editable.removeAttribute('contenteditable');
            window.dispatchEvent(new CustomEvent('wysiwyg:text-changed', {
                detail: { index: index, text: editable.innerHTML }
            }));
        };
        editable.addEventListener('blur', onBlur);
    });
    window.addEventListener('wysiwyg:selection-changed', refresh);
    window.addEventListener('wysiwyg:stage-rendered', refresh);
    window.wysiwygEditOverlay = {
        refresh: refresh
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', refresh, { once: true });
    }
    else {
        refresh();
    }
})();
