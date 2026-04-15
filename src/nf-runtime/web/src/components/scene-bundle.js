(function loadLegacySceneBundle() {
  window.__scenes = window.__scenes || {};
  try {
    const request = new XMLHttpRequest();
    request.open('GET', 'js/scene-bundle.js', false);
    request.send(null);
    if (request.status >= 200 && request.status < 300 || request.status === 0) {
      window.eval(request.responseText + '\n//# sourceURL=js/scene-bundle.js');
    }
  } catch (_error) {
    window.__scenes = window.__scenes || {};
  }
})();
