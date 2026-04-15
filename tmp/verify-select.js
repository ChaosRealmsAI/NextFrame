(function () {
  const results = {};

  function wait(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = function () {
        reject(new Error("Failed to load " + src));
      };
      (document.head || document.body || document.documentElement).appendChild(script);
    });
  }

  async function main() {
    try {
      await loadScript("src/preview/wysiwyg-selection.js");
      await loadScript("src/preview/wysiwyg-diagnose.js");
      await wait(100);

      results.__wysiwygDiagnose = typeof window.__wysiwygDiagnose;
      results.__wysiwygSelect = typeof window.__wysiwygSelect;
      results.__wysiwygGetSelected = typeof window.__wysiwygGetSelected;

      const stageLayer = document.querySelector('.nf-layer[data-index="1"]')
        || document.querySelector(".nf-layer[data-index]");
      if (!stageLayer) {
        throw new Error("Missing .nf-layer for stage click");
      }
      stageLayer.click();
      await wait(100);
      results.afterSelectStage = JSON.parse(window.__wysiwygDiagnose()).selected;
      window.__screenshot("/tmp/nf-select-stage.png");

      const trackClip = document.querySelector('.track-clip[data-index="2"]')
        || document.querySelector(".track-clip[data-index]");
      if (!trackClip) {
        throw new Error("Missing .track-clip for timeline click");
      }
      trackClip.click();
      await wait(100);
      results.afterSelectTrack = JSON.parse(window.__wysiwygDiagnose()).selected;
      window.__screenshot("/tmp/nf-select-track.png");
    }
    catch (error) {
      results.error = String(error && error.stack ? error.stack : error);
    }
    finally {
      window.__debugResult = JSON.stringify(results);
      window.__evalDone = true;
    }
  }

  main();
  return "verify-select-started";
})();
