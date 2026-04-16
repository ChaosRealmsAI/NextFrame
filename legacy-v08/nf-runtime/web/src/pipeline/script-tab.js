"use strict";
// Pipeline script tab — segment editing and preview.
// Depends on: pipeline-utils.js (escapeHtml, normalizeSegmentPreviewParams, fallbackSegmentPreviewParams, getCurrentProjectRef, getCurrentEpisodeRef)
// Shared state: pipelineSegments, pipelinePreviewState (defined in pipeline.js)
function renderScriptPreview(state) {
    if (!state)
        return '';
    if (state.loading) {
        return '<div style="margin-top:12px;font-size:12px;color:var(--t65)">正在加载视频预览...</div>';
    }
    if (state.error) {
        return '<div style="margin-top:12px;font-size:12px;color:#ff8f8f">' + escapeHtml(state.error) + '</div>';
    }
    if (state.exists && state.path) {
        return '<video controls preload="metadata" style="width:100%;margin-top:12px;border-radius:10px;background:#000" src="' + escapeHtml(state.path) + '"></video>';
    }
    return '<div style="margin-top:12px;font-size:12px;color:var(--t65)">该段暂无视频文件</div>';
}
function renderScriptTab(segments) {
    pipelineSegments = segments || [];
    // Update sidebar: segment navigation + stats
    const sidebar = document.querySelector('#pl-tab-script .pl-sidebar');
    if (sidebar) {
        const totalChars = pipelineSegments.reduce(function (s, seg) { return s + (seg.narration || '').length; }, 0);
        const estSecs = Math.round(totalChars / 4); // ~4 chars/sec for Chinese
        let sbHtml = '<div class="pl-sb-section"><div class="pl-sb-title">剧集信息</div>' +
            '<div class="pl-sb-info-row"><span class="pl-sb-label">段落</span><span class="pl-sb-value">' + pipelineSegments.length + '</span></div>' +
            '<div class="pl-sb-info-row"><span class="pl-sb-label">字数</span><span class="pl-sb-value">' + totalChars + '</span></div>' +
            '<div class="pl-sb-info-row"><span class="pl-sb-label">预估</span><span class="pl-sb-value">~' + estSecs + 's</span></div>' +
            '</div>';
        sbHtml += '<div class="pl-sb-section"><div class="pl-sb-title">段落导航</div>';
        pipelineSegments.forEach(function (seg, i) {
            const role = seg.role || '';
            const preview = (seg.narration || '').substring(0, 15) + '...';
            sbHtml += '<div class="pl-seg-item" data-nf-action="scroll-to-segment" onclick="scrollToSegment(' + i + ')" style="display:flex;gap:8px;padding:8px;border-radius:8px;cursor:pointer;transition:background 0.2s">' +
                '<div style="width:20px;height:20px;border-radius:50%;background:var(--accent-12);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;flex-shrink:0">' + (i + 1) + '</div>' +
                '<div style="min-width:0"><div style="font-size:12px;font-weight:600;color:var(--t80)">' + escapeHtml(String(role || '段落 ' + (i + 1))) + '</div>' +
                '<div style="font-size:11px;color:var(--t50);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(preview) + '</div></div>' +
                '</div>';
        });
        sbHtml += '</div>';
        sidebar.innerHTML = sbHtml;
    }
    // Main area: script cards
    const el = document.querySelector('#pl-tab-script .pl-main');
    if (!el)
        return;
    if (pipelineSegments.length === 0) {
        el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--t50)">暂无脚本段落</div>';
        return;
    }
    let html = '<div style="padding:16px;overflow-y:auto;height:100%">';
    pipelineSegments.forEach(function (seg, index) {
        const narration = (seg.narration || seg.text || '');
        const visual = (seg.visual || '');
        const role = (seg.role || '');
        const logic = (seg.logic || '');
        const charCount = narration.length;
        html += '<div class="glass" id="script-card-' + index + '" data-nf-action="edit-script" style="padding:20px;margin-bottom:12px;border-radius:12px">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
            '<div style="display:flex;align-items:center;gap:8px">' +
            '<span style="font-size:13px;font-weight:600;color:var(--accent)">段 ' + (index + 1) + '</span>' +
            (role ? '<span style="font-size:11px;padding:2px 8px;background:var(--accent-12);color:var(--accent);border-radius:4px">' + escapeHtml(role) + '</span>' : '') +
            '</div>' +
            '<span style="font-family:var(--mono);font-size:11px;color:var(--t50)">' + charCount + ' 字</span>' +
            '</div>' +
            '<div contenteditable="true" data-nf-action="edit-narration" data-seg-index="' + index + '" style="font-family:var(--serif,Georgia,serif);font-size:16px;line-height:1.8;color:var(--t80);outline:none;min-height:40px;padding:8px 0;border-bottom:1px solid var(--border)" onblur="saveNarration(this)">' + escapeHtml(narration) + '</div>' +
            (visual || logic ? '<div style="display:flex;gap:16px;margin-top:12px;flex-wrap:wrap">' +
                (visual ? '<div style="flex:1;min-width:120px"><div style="font-size:11px;font-weight:600;color:var(--t50);margin-bottom:4px">画面</div><div style="font-size:12px;color:var(--t65);line-height:1.5">' + escapeHtml(visual) + '</div></div>' : '') +
                (logic ? '<div style="flex:1;min-width:120px"><div style="font-size:11px;font-weight:600;color:var(--t50);margin-bottom:4px">逻辑</div><div style="font-size:12px;color:var(--t65);line-height:1.5">' + escapeHtml(logic) + '</div></div>' : '') +
                '</div>' : '') +
            '</div>';
    });
    html += '</div>';
    el.innerHTML = html;
}
function scrollToSegment(index) {
    const card = document.getElementById('script-card-' + index);
    if (card)
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function saveNarration(el) {
    const index = Number.parseInt(el.dataset.segIndex || '', 10);
    const text = el.textContent || '';
    if (!pipelineSegments[index])
        return;
    pipelineSegments[index].narration = text;
    if (typeof bridgeCall !== 'function' || !getCurrentEpisodeRef())
        return;
    bridgeCall('script.set', {
        project: getCurrentProjectRef(),
        episode: getCurrentEpisodeRef(),
        segment: index + 1,
        narration: text,
    }).catch(function (error) {
        console.error('[script] save narration:', error);
    });
}
function previewSegmentVideo(segmentName) {
    if (typeof bridgeCall !== 'function' || !segmentName)
        return;
    pipelinePreviewState[segmentName] = { loading: true };
    renderScriptTab(pipelineSegments);
    bridgeCall('segment.videoUrl', normalizeSegmentPreviewParams(segmentName)).catch(function (error) {
        if (!error || String(error).indexOf('invalid params') === -1) {
            throw error;
        }
        return bridgeCall('segment.videoUrl', fallbackSegmentPreviewParams(segmentName));
    }).then(function (result) {
        const data = result.ok === true ? result.value : {};
        pipelinePreviewState[segmentName] = {
            loading: false,
            exists: !!data.exists,
            path: data.path || '',
            error: '',
        };
        renderScriptTab(pipelineSegments);
    }).catch(function (error) {
        const errObj = error;
        pipelinePreviewState[segmentName] = {
            loading: false,
            exists: false,
            path: '',
            error: errObj && errObj.message ? errObj.message :String(error || 'failed to load segment video'),
        };
        renderScriptTab(pipelineSegments);
    });
}
