// Pipeline runtime bindings — shared state, data loading, atoms tab, window exports.
// Sub-modules (loaded before this file via script tags):
//   pipeline-utils.js   — escapeHtml, toNfdataUrl, formatTimecode, path helpers
//   pipeline-script.js  — renderScriptTab, scrollToSegment, saveNarration, previewSegmentVideo
//   pipeline-audio.js   — renderAudioTab, karaoke, generateTTS, playSegmentAudio
//   pipeline-export.js  — renderOutputTab, export start/cancel/poll

let pipelineRenderEntries: Record<string, unknown>[] = [];
let pipelineSegments: NfSegment[] = [];
let pipelineAudioStage: { voice: unknown; speed: number; engine: unknown; segments: unknown[] } = { voice: null, speed: 1, engine: null, segments: [] };
let pipelineAudioState: Record<number, NfAudioStateEntry | null> = {};
let pipelinePreviewState: Record<string, unknown> = {};
let pipelineExportState: NfExportState | null = null;
let pipelineExportPollTimer: ReturnType<typeof setTimeout> | null = null;
let pipelineEpisodeScope = '';

function resetPipelineEpisodeState(): void {
  pipelineSegments = [];
  pipelineAudioStage = { voice: null, speed: 1, engine: null, segments: [] };
  pipelineAudioState = {};
  pipelinePreviewState = {};
  pipelineExportState = null;
  stopExportPolling();
}

function stopExportPolling(): void {
  if (pipelineExportPollTimer) window.clearTimeout(pipelineExportPollTimer);
  pipelineExportPollTimer = null;
}

function scheduleExportPolling(delayMs: number): void {
  stopExportPolling();
  pipelineExportPollTimer = window.setTimeout(pollExportStatus, delayMs) as unknown as ReturnType<typeof setTimeout>;
}

function loadPipelineData(): void {
  if (typeof bridgeCall !== 'function') return;

  const projectRef = getCurrentProjectRef();
  const episodeRef = getCurrentEpisodeRef();
  const nextScope = episodeRef;
  if (pipelineEpisodeScope !== nextScope) {
    pipelineEpisodeScope = nextScope;
    resetPipelineEpisodeState();
  }

  if (episodeRef) {
    bridgeCall<Record<string, unknown>>('script.get', { project: projectRef, episode: episodeRef }).then(function(result: NfBridgeResult<Record<string, unknown>>) {
      const data = result.ok === true ? result.value : {} as Record<string, unknown>;
      const script = data && (data.script || data.value) ? (data.script || data.value) as Record<string, unknown> : {};
      const segments = Array.isArray(script.segments) ? script.segments as NfSegment[] : [];
      pipelineSegments = segments;
      renderScriptTab(segments);
      renderAudioTab(pipelineAudioStage.segments);
    }).catch(function(error: unknown) {
      console.error('[pipeline] script.get:', error);
      pipelineSegments = [];
      renderScriptTab([]);
      renderAudioTab(pipelineAudioStage.segments);
    });

    bridgeCall<Record<string, unknown>>('audio.get', { project: projectRef, episode: episodeRef }).then(function(result: NfBridgeResult<Record<string, unknown>>) {
      const data = result.ok === true ? result.value : {} as Record<string, unknown>;
      const audio = data && (data.audio || data.value) ? (data.audio || data.value) as Record<string, unknown> : {};
      pipelineAudioStage = {
        voice: audio.voice || null,
        speed: typeof audio.speed === 'number' ? audio.speed : 1,
        engine: audio.engine || null,
        segments: Array.isArray(audio.segments) ? audio.segments : [],
      };
      renderAudioTab(pipelineAudioStage.segments);
    }).catch(function(error: unknown) {
      console.error('[pipeline] audio.get:', error);
      pipelineAudioStage = { voice: null, speed: 1, engine: null, segments: [] };
      renderAudioTab([]);
    });
  }

  bridgeCall<Record<string, unknown>>('scene.list', {}).then(function(result: NfBridgeResult<Record<string, unknown>>) {
    const data = result.ok === true ? result.value : {} as Record<string, unknown>;
    renderAtomsTab((data.scenes || []) as unknown[]);
  }).catch(function(error: unknown) {
    console.error('[pipeline] scenes:', error);
  });

  if (episodeRef) {
    if (typeof loadPipelineClipsData === 'function') {
      loadPipelineClipsData({ project: projectRef, episode: episodeRef });
    } else if (typeof renderClipsTab === 'function') {
      renderClipsTab({ sources: [] });
    }
  }

  const exportLogPath = getCurrentProjectRef() ? getCurrentProjectRef() + '/exports.json' : '';
  if (exportLogPath) {
    bridgeCall<Record<string, unknown>>('fs.read', { path: exportLogPath }).then(function(result: NfBridgeResult<Record<string, unknown>>) {
      try {
        const data = result.ok === true ? result.value : {} as Record<string, unknown>;
        const parsed = JSON.parse((data.contents || data.content || '[]') as string);
        renderOutputTab(Array.isArray(parsed) ? parsed : []);
      } catch (_error) {
        renderOutputTab([]);
      }
    }).catch(function() {
      renderOutputTab([]);
    });
    return;
  }

  renderOutputTab([]);
}

function renderAtomsTab(scenes: unknown[]): void {
  const el = document.querySelector('#pl-tab-atom .pl-main');
  if (!el) return;
  if (scenes.length === 0) {
    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--t50)">暂无场景组件</div>';
    return;
  }
  let html = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:16px">';
  scenes.forEach(function(scene: unknown) {
    const sceneObj = scene as Record<string, unknown>;
    const name = typeof scene === 'string' ? scene : (sceneObj.name || sceneObj.id || '') as string;
    html += '<div class="glass" style="padding:14px;border-radius:10px">' +
      '<div style="font-size:13px;font-weight:600;color:var(--t100)">' + escapeHtml(name) + '</div>' +
    '</div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

// Editor runtime exports.
window.loadPipelineData = loadPipelineData;
window.renderScriptTab = renderScriptTab;
window.renderAudioTab = renderAudioTab;
window.renderAtomsTab = renderAtomsTab;
window.renderOutputTab = renderOutputTab;
window.startPipelineExport = startPipelineExport;
window.cancelPipelineExport = cancelPipelineExport;
window.previewSegmentVideo = previewSegmentVideo;
window.playKaraokeAudio = playKaraokeAudio;
window.toggleKaraokeAudio = toggleKaraokeAudio;
window.scrollToSegment = scrollToSegment;
window.saveNarration = saveNarration;
window.generateTTS = generateTTS;
window.playSegmentAudio = playSegmentAudio;
