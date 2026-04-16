"use strict";
// Pipeline export tab — output rendering, progress tracking, polling.
// Depends on: pipeline-utils.js (escapeHtml, formatExportPercent, formatExportEta, getCurrentProjectRef, getCurrentEpisodeRef)
// Shared state: pipelineRenderEntries, pipelineExportState, pipelineExportPollTimer (defined in pipeline.js)
function renderOutputProgressCard() {
    if (!pipelineExportState)
        return '';
    const state = String(pipelineExportState.state || 'running');
    const percent = typeof pipelineExportState.percent === 'number' ? pipelineExportState.percent : 0;
    const barWidth = Math.max(0, Math.min(100, percent));
    const statusColor = state === 'failed' ? '#ff8f8f' : (state === 'done' ? 'var(--green)' : 'var(--t100)');
    const errorHtml = pipelineExportState.error
        ? '<div style="font-size:12px;color:#ff8f8f;margin-top:8px">' + escapeHtml(pipelineExportState.error) + '</div>'
        : '';
    const cancelButton = state === 'running' || state === 'queued'
        ? '<button data-nf-action="export-cancel" onclick="cancelPipelineExport()" style="border:0;border-radius:999px;padding:8px 14px;background:rgba(255,255,255,0.08);color:var(--t100);cursor:pointer">取消</button>'
        : '';
    return '' +
        '<div class="glass" style="padding:16px;margin-bottom:12px;border-radius:12px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">' +
        '<div>' +
        '<div style="font-size:14px;font-weight:600;color:' + statusColor + '">导出状态: ' + escapeHtml(state) + '</div>' +
        '<div style="font-size:12px;color:var(--t65);margin-top:4px">进度 ' + escapeHtml(formatExportPercent(percent)) + ' · ETA ' + escapeHtml(formatExportEta(pipelineExportState.eta)) + '</div>' +
        '</div>' +
        cancelButton +
        '</div>' +
        '<div style="height:8px;border-radius:999px;background:rgba(255,255,255,0.08);overflow:hidden;margin-top:12px">' +
        '<div style="height:100%;width:' + barWidth.toFixed(1) + '%;background:linear-gradient(90deg,#34d399,#60a5fa)"></div>' +
        '</div>' +
        (pipelineExportState.logPath ? '<div style="font-family:var(--mono);font-size:11px;color:var(--t50);margin-top:8px">' + escapeHtml(String(pipelineExportState.logPath)) + '</div>' : '') +
        errorHtml +
        '</div>';
}
function renderOutputEntries(entries) {
    if (entries.length === 0) {
        return '<div style="display:flex;align-items:center;justify-content:center;min-height:180px;color:var(--t50)">暂无导出记录</div>';
    }
    let html = '';
    entries.forEach(function (entry) {
        html += '<div class="glass" data-nf-action="export-video" style="padding:16px;margin-bottom:8px;border-radius:10px">' +
            '<div style="font-size:13px;font-weight:600;color:var(--t100)">' + escapeHtml(String(entry.name || entry.path || 'Export')) + '</div>' +
            '<div style="font-size:12px;color:var(--t65);margin-top:4px">' + escapeHtml(String(entry.status || '')) + '</div>' +
            '</div>';
    });
    return html;
}
function renderOutputTab(entries) {
    pipelineRenderEntries = entries || [];
    const el = document.querySelector('#pl-tab-output .pl-output-main');
    if (!el)
        return;
    el.innerHTML = '' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px">' +
        '<div>' +
        '<div style="font-size:16px;font-weight:600;color:var(--t100)">版本历史</div>' +
        '<div style="font-family:var(--mono);font-size:12px;color:var(--t50);margin-top:4px">' + pipelineRenderEntries.length + ' 个版本</div>' +
        '</div>' +
        '<button data-nf-action="export-start" onclick="startPipelineExport()" style="border:0;border-radius:999px;padding:10px 16px;background:linear-gradient(135deg,#34d399,#60a5fa);color:#08111f;font-weight:600;cursor:pointer">开始导出</button>' +
        '</div>' +
        renderOutputProgressCard() +
        renderOutputEntries(pipelineRenderEntries);
}
function updateExportState(patch) {
    pipelineExportState = Object.assign({}, pipelineExportState || {}, patch);
    renderOutputTab(pipelineRenderEntries);
}
function pollExportStatus() {
    if (typeof bridgeCall !== 'function' || !pipelineExportState || !pipelineExportState.pid)
        return;
    bridgeCall('export.status', { pid: pipelineExportState.pid }).then(function (result) {
        const data = result.ok === true ? result.value : {};
        updateExportState({
            state: data.state || 'running',
            percent: typeof data.percent === 'number' ? data.percent : 0,
            eta: typeof data.eta === 'number' ? data.eta : 0,
            error: data.error || '',
            outputPath: data.outputPath || '',
        });
        if (data.state === 'done' || data.state === 'failed') {
            stopExportPolling();
            return;
        }
        scheduleExportPolling(2000);
    }).catch(function (error) {
        const errObj = error;
        stopExportPolling();
        updateExportState({
            state: 'failed',
            error: errObj && errObj.message ? errObj.message :String(error || 'failed to read export status'),
        });
    });
}
function startPipelineExport() {
    if (typeof bridgeCall !== 'function' || !getCurrentEpisodeRef())
        return;
    stopExportPolling();
    updateExportState({
        state: 'starting',
        percent: 0,
        eta: 0,
        error: '',
        pid: null,
        logPath: '',
    });
    bridgeCall('export.start', {
        outputPath: getCurrentEpisodeRef() + '/exports/output.mp4',
        width: 1920,
        height: 1080,
        fps: 30,
        duration: 45.0,
    }).then(function (result) {
        const data = result.ok === true ? result.value : {};
        if (result.ok === false) {
            updateExportState({
                state: 'failed',
                error: (data.error || 'failed to start export'),
                logPath: (data.logPath || ''),
            });
            return;
        }
        updateExportState({
            state: 'queued',
            pid: data.pid,
            logPath: data.logPath || '',
            error: '',
        });
        pollExportStatus();
    }).catch(function (error) {
        const errObj = error;
        updateExportState({
            state: 'failed',
            error: errObj && errObj.message ? errObj.message :String(error || 'failed to start export'),
        });
    });
}
function cancelPipelineExport() {
    if (typeof bridgeCall !== 'function' || !pipelineExportState || !pipelineExportState.pid)
        return;
    bridgeCall('export.cancel', { pid: pipelineExportState.pid }).then(function (result) {
        const data = result.ok === true ? result.value : {};
        stopExportPolling();
        updateExportState({
            state: 'failed',
            percent: pipelineExportState.progress || 0,
            eta: 0,
            error: result.ok === true ? 'canceled' : (data.error || 'failed to cancel export'),
        });
    }).catch(function (error) {
        const errObj = error;
        updateExportState({
            state: 'failed',
            error: errObj && errObj.message ? errObj.message :String(error || 'failed to cancel export'),
        });
    });
}
