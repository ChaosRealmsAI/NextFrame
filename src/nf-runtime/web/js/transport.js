// Transport controls — bridge between editor UI and preview iframe playback.
// Sends nf-cmd messages to iframe, receives nf-state updates, syncs UI.

var edPlaybackState = { currentTime: 0, duration: 0, isPlaying: false };

function sendPreviewCmd(action, time) {
  var iframe = window.edPreviewIframe;
  if (!iframe || !iframe.contentWindow) {
    return;
  }
  var msg = { type: 'nf-cmd', action: action };
  if (typeof time === 'number') {
    msg.time = time;
  }
  iframe.contentWindow.postMessage(msg, '*');
}

function updatePlayButton(playing) {
  var btn = document.getElementById('ed-btn-play');
  if (btn) {
    btn.innerHTML = playing ? '&#x23F8;' : '&#9654;';
  }
  var bigBtn = document.querySelector('.ed-play-btn');
  if (bigBtn) {
    bigBtn.innerHTML = playing ? '&#x23F8;' : '&#9654;';
    bigBtn.style.fontSize = playing ? '24px' : '20px';
  }
}

function updatePlayhead(currentTime, duration) {
  var playhead = document.querySelector('.ed-tl-playhead');
  if (!playhead) {
    return;
  }
  if (duration > 0) {
    var pct = Math.max(0, Math.min(100, currentTime / duration * 100));
    playhead.style.left = pct.toFixed(1) + '%';
  } else {
    playhead.style.left = '0%';
  }
}

function ensurePlayhead() {
  var tlBody = document.getElementById('ed-tl-body2');
  if (!tlBody || tlBody.querySelector('.ed-tl-playhead')) {
    return;
  }
  var ph = document.createElement('div');
  ph.className = 'ed-tl-playhead';
  ph.style.height = '100%';
  tlBody.style.position = 'relative';
  tlBody.appendChild(ph);
}

// Receive state from iframe
window.addEventListener('message', function(event) {
  var d = event.data;
  if (!d || d.type !== 'nf-state') {
    return;
  }
  edPlaybackState = d;
  updateEditorPreviewState(d.currentTime, d.duration);
  updatePlayButton(d.isPlaying);
  updatePlayhead(d.currentTime, d.duration);
});

function wireTransportButtons() {
  var play = document.getElementById('ed-btn-play');
  if (play) {
    play.onclick = function() { sendPreviewCmd('toggle'); };
  }
  var start = document.getElementById('ed-btn-start');
  if (start) {
    start.onclick = function() { sendPreviewCmd('seek', 0); };
  }
  var end = document.getElementById('ed-btn-end');
  if (end) {
    end.onclick = function() { sendPreviewCmd('seek', edPlaybackState.duration); };
  }
  var back = document.getElementById('ed-btn-back5');
  if (back) {
    back.onclick = function() { sendPreviewCmd('seek', Math.max(0, edPlaybackState.currentTime - 5)); };
  }
  var fwd = document.getElementById('ed-btn-fwd5');
  if (fwd) {
    fwd.onclick = function() { sendPreviewCmd('seek', edPlaybackState.currentTime + 5); };
  }
  // Big play button in preview area
  var bigBtn = document.querySelector('.ed-play-btn');
  if (bigBtn) {
    bigBtn.onclick = function() { sendPreviewCmd('toggle'); };
  }
}

function wireProgressBar() {
  var bar = document.querySelector('.ed-transport-progress');
  if (!bar) {
    return;
  }
  function seekFromEvent(e) {
    var rect = bar.getBoundingClientRect();
    var pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    sendPreviewCmd('seek', pct * edPlaybackState.duration);
  }
  bar.addEventListener('pointerdown', function(e) {
    seekFromEvent(e);
    function onMove(ev) { seekFromEvent(ev); }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
}

// Spacebar play/pause
document.addEventListener('keydown', function(e) {
  if (e.code !== 'Space') {
    return;
  }
  var tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return;
  }
  e.preventDefault();
  sendPreviewCmd('toggle');
});

wireTransportButtons();
wireProgressBar();

window.edPreviewIframe = null;
window.sendPreviewCmd = sendPreviewCmd;
