const edPlaybackState = { currentTime: 0, duration: 0, isPlaying: false };
const playIconMarkup = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><polygon points="5,3 15,9 5,15" fill="currentColor"/></svg>';
const pauseIconMarkup = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="4" y="3" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="10.5" y="3" width="3.5" height="12" rx="1" fill="currentColor"/></svg>';
const heroPlayIconMarkup = '<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><polygon points="7,4 17,11 7,18" fill="currentColor"/></svg>';
const heroPauseIconMarkup = '<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="5" y="4" width="4" height="14" rx="1" fill="currentColor"/><rect x="13" y="4" width="4" height="14" rx="1" fill="currentColor"/></svg>';

function iconButton(id: string, title: string, action: () => void, markup: string) {
  return h(
    'button',
    { class: 'ed-t-btn' + (id === 'ed-btn-play' ? ' play-main' : ''), id, type: 'button', title, onclick: action },
    createMarkupNode(markup),
  );
}

function updatePlayButton(playing: boolean): void {
  const mainBtn = document.getElementById('ed-btn-play');
  const heroBtn = document.querySelector('.ed-play-btn');
  if (mainBtn) mainBtn.innerHTML = playing ? pauseIconMarkup : playIconMarkup;
  if (heroBtn) heroBtn.innerHTML = playing ? heroPauseIconMarkup : heroPlayIconMarkup;
}

function updatePlayhead(currentTime: number, duration: number): void {
  const playhead = document.getElementById('ed-tl-playhead2');
  if (!playhead) return;
  const timeline = playhead.parentElement;
  if (!timeline) return;
  const trackWidth = timeline.clientWidth - 100;
  const pct = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;
  playhead.style.left = 100 + pct * trackWidth + 'px';
}

function updateTransportThumb(currentTime: number, duration: number): void {
  const thumb = document.querySelector<HTMLElement>('.ed-transport-thumb');
  if (!thumb) return;
  const pct = duration > 0 ? Math.max(0, Math.min(100, currentTime / duration * 100)) : 0;
  thumb.style.left = pct.toFixed(1) + '%';
}

function syncPreviewTransportState(state: NfPreviewState | Record<string, unknown>): void {
  const nextState = state || {} as Record<string, unknown>;
  edPlaybackState.currentTime = Number.isFinite(nextState.currentTime) ? nextState.currentTime as number : 0;
  edPlaybackState.duration = Number.isFinite(nextState.duration) ? nextState.duration as number : 0;
  edPlaybackState.isPlaying = !!nextState.isPlaying;
  window.updateEditorPreviewState(edPlaybackState.currentTime, edPlaybackState.duration);
  updatePlayButton(edPlaybackState.isPlaying);
  updatePlayhead(edPlaybackState.currentTime, edPlaybackState.duration);
  updateTransportThumb(edPlaybackState.currentTime, edPlaybackState.duration);
}

function bindPreviewStateSource(): void {
  if (window.previewEngine) window.previewEngine.onStateChange = syncPreviewTransportState;
}

function sendPreviewCmd(action: string, time?: number) {
  const engine = window.previewEngine;
  if (!engine) return;
  if (action === 'play' && typeof engine.play === 'function') engine.play();
  else if (action === 'pause' && typeof engine.pause === 'function') engine.pause();
  else if (action === 'toggle') {
    if (typeof engine.toggle === 'function') engine.toggle();
    else if (edPlaybackState.isPlaying && typeof engine.pause === 'function') engine.pause();
    else if (typeof engine.play === 'function') engine.play();
  } else if (action === 'seek' && typeof time === 'number') {
    if (typeof engine.seek === 'function') engine.seek(time);
    else if (typeof engine.compose === 'function') engine.compose(time);
    syncPreviewTransportState({
      currentTime: time,
      duration: edPlaybackState.duration || (typeof window.getEditorTimelineDuration === 'function' ? window.getEditorTimelineDuration() : 0),
      isPlaying: false,
    });
  }
}

function wireProgressBar(): void {
  const bar = document.querySelector<HTMLElement>('.ed-transport-progress');
  if (!bar || bar.dataset.bound === 'true') return;
  bar.dataset.bound = 'true';
  function seekFromPointer(event: PointerEvent) {
    const rect = bar!.getBoundingClientRect();
    const pct = rect.width > 0 ? Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) : 0;
    sendPreviewCmd('seek', pct * edPlaybackState.duration);
  }
  bar.addEventListener('pointerdown', (event) => {
    seekFromPointer(event);
    function onMove(moveEvent: PointerEvent) {
      seekFromPointer(moveEvent);
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove as EventListener);
      document.removeEventListener('pointerup', onUp);
    }
    document.addEventListener('pointermove', onMove as EventListener);
    document.addEventListener('pointerup', onUp);
  });
}

document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space') return;
  const tag = (event.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  event.preventDefault();
  sendPreviewCmd('toggle');
});

class TransportControls extends Component {
  didMount() {
    wireProgressBar();
    const heroBtn = document.querySelector<HTMLElement>('.ed-play-btn');
    if (heroBtn) heroBtn.onclick = () => sendPreviewCmd('toggle');
    updatePlayButton(false);
  }

  render() {
    return h(
      'div',
      { class: 'ed-transport' },
      iconButton('ed-btn-start', 'Previous', () => sendPreviewCmd('seek', 0), '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="2" height="10" rx="0.5" fill="currentColor"/><path d="M13 3.5L6 8l7 4.5V3.5z" fill="currentColor"/></svg>'),
      iconButton('ed-btn-back5', '-5s', () => sendPreviewCmd('seek', Math.max(0, edPlaybackState.currentTime - 5)), '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M9 3L2 8l7 5V3z" fill="currentColor"/><path d="M15 3L8 8l7 5V3z" fill="currentColor"/></svg>'),
      iconButton('ed-btn-play', 'Play / Pause', () => sendPreviewCmd('toggle'), playIconMarkup),
      iconButton('ed-btn-fwd5', '+5s', () => sendPreviewCmd('seek', edPlaybackState.currentTime + 5), '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M7 3l7 5-7 5V3z" fill="currentColor"/><path d="M1 3l7 5-7 5V3z" fill="currentColor"/></svg>'),
      iconButton('ed-btn-end', 'Next', () => sendPreviewCmd('seek', edPlaybackState.duration), '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3.5l7 4.5-7 4.5V3.5z" fill="currentColor"/><rect x="12" y="3" width="2" height="10" rx="0.5" fill="currentColor"/></svg>'),
      h('span', { class: 'ed-transport-tc' }, '00:00.0'),
      h(
        'div',
        { class: 'ed-transport-progress' },
        h('div', { class: 'ed-transport-fill' }),
        h('div', { class: 'ed-transport-thumb' }),
      ),
    );
  }
}

window.edPreviewMode = window.edPreviewMode || 'none';
window.TransportControls = TransportControls;
window.sendPreviewCmd = sendPreviewCmd;
window.bindPreviewStateSource = bindPreviewStateSource;
window.syncPreviewTransportState = syncPreviewTransportState;
window.updatePlayButton = updatePlayButton;
