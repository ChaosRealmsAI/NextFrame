"use strict";
// DOM-only WYSIWYG selection bridge for stage/timeline sync.
(function () {
    if (window.__wysiwygSelect && window.__wysiwygGetSelected) {
        return;
    }
    const STAGE_SELECTOR = ".nf-layer[data-index]";
    const TIMELINE_SELECTOR = ".track-clip[data-index], .ed-tl-clip[data-index]";
    let observer = null;
    function normalizeIndex(index) {
        const value = Number(index);
        return Number.isInteger(value) && value >= 0 ? value : -1;
    }
    function readSelectedIndex() {
        return normalizeIndex(document.body && document.body.dataset
            ? document.body.dataset.wysiwygSelected
            : -1);
    }
    function applySelection(index) {
        document.querySelectorAll(STAGE_SELECTOR).forEach(function (el) {
            el.classList.toggle("is-selected", Number(el.dataset.index) === index);
        });
        document.querySelectorAll(TIMELINE_SELECTOR).forEach(function (el) {
            el.classList.toggle("active", Number(el.dataset.index) === index);
        });
    }
    function setSelectedIndex(index) {
        const safeIndex = normalizeIndex(index);
        if (document.body && document.body.dataset) {
            document.body.dataset.wysiwygSelected = String(safeIndex);
        }
        applySelection(safeIndex);
        return safeIndex;
    }
    function handleClick(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) {
            return;
        }
        if (target.closest(".nf-handle") || target.closest('[contenteditable="true"]')) {
            return;
        }
        const clipEl = target.closest(TIMELINE_SELECTOR);
        if (clipEl) {
            setSelectedIndex(clipEl.dataset.index);
            return;
        }
        const layerEl = target.closest(STAGE_SELECTOR);
        if (layerEl) {
            setSelectedIndex(layerEl.dataset.index);
        }
    }
    function bindMutationSync() {
        if (observer || !window.MutationObserver || !document.documentElement) {
            return;
        }
        observer = new MutationObserver(function (mutations) {
            for (let i = 0; i < mutations.length; i += 1) {
                const mutation = mutations[i];
                if (mutation.type === "childList" && (mutation.addedNodes.length || mutation.removedNodes.length)) {
                    applySelection(readSelectedIndex());
                    break;
                }
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    function init() {
        document.addEventListener("click", handleClick, false);
        bindMutationSync();
        applySelection(readSelectedIndex());
    }
    window.__wysiwygSelect = function (index) {
        return setSelectedIndex(index);
    };
    window.__wysiwygGetSelected = function () {
        return readSelectedIndex();
    };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    }
    else {
        init();
    }
})();
