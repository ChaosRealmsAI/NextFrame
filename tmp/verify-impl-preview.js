window.__evalDone = false;

void (async function () {
  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function waitFor(predicate, timeoutMs, label) {
    var start = Date.now();
    while (Date.now() - start < timeoutMs) {
      var value = predicate();
      if (value) {
        return value;
      }
      await wait(50);
    }
    throw new Error("Timed out waiting for " + label);
  }

  async function ensureScript(src) {
    if (window.createWysiwygEngine) {
      return;
    }
    await new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = function () { reject(new Error("Failed to load " + src)); };
      document.head.appendChild(script);
    });
  }

  function ratioOf(rect) {
    return rect.height > 0 ? (rect.width / rect.height).toFixed(4) : "0.0000";
  }

  function stageRect(stage) {
    var rect = stage.getBoundingClientRect();
    return {
      width: Number(rect.width.toFixed(2)),
      height: Number(rect.height.toFixed(2)),
      ratio: ratioOf(rect)
    };
  }

  try {
    await waitFor(function () {
      return document.readyState === "complete" || document.readyState === "interactive";
    }, 4000, "document readiness");

    await waitFor(function () {
      return window.createWysiwygEngine || window.__wysiwygDiagnose;
    }, 4000, "page preview globals");

    await ensureScript("src/preview/preview-engine-v2.js");
    await waitFor(function () { return window.createWysiwygEngine; }, 4000, "preview-engine-v2.js");

    var stage = document.getElementById("stage") || document.querySelector(".stage");
    if (!stage) {
      throw new Error("Missing .stage element");
    }

    var timeline = {
      version: "0.7",
      ratio: "16:9",
      width: 1920,
      height: 1080,
      fps: 30,
      duration: 30,
      layers: [
        { id: "bg", scene: "darkGradient", start: 0, dur: 30, layout: { x: 0, y: 0, w: 100, h: 100 }, params: {} },
        { id: "video", scene: "videoClip", start: 0, dur: 30, layout: { x: 11, y: 6.5, w: 78, h: 78 }, params: { label: "[video]" } },
        { id: "headline", scene: "headlineCenter", start: 0, dur: 8, layout: { x: 10, y: 38, w: 80, h: 22 }, params: { text: "Preview<br><span style='color:#da7756'>ratio smoke</span>", fontSize: 5.2 } },
        { id: "sub", scene: "subtitleBar", start: 0, dur: 30, layout: { x: 0, y: 82, w: 100, h: 12 }, params: { fontSize: 2.5, srt: [{ s: 0, e: 5, t: "zero" }, { s: 9, e: 12, t: "ten" }] } }
      ]
    };

    var engine = window.createWysiwygEngine({ stage: stage });
    var loadResult = engine.loadTimeline(timeline);
    engine.setTime(10);
    await wait(60);

    var result = {
      loadResult: loadResult,
      afterSeekT10: engine.getState(),
      diagnose: engine.diagnose()
    };

    engine.setRatio("16:9");
    await wait(60);
    result.stageRect16x9 = stageRect(stage);
    window.__screenshot("/tmp/nf-wysiwyg-16x9.png");

    engine.setRatio("9:16");
    await wait(60);
    result.stageRect9x16 = stageRect(stage);
    window.__screenshot("/tmp/nf-wysiwyg-9x16.png");

    engine.setRatio("1:1");
    await wait(60);
    result.stageRect1x1 = stageRect(stage);
    window.__screenshot("/tmp/nf-wysiwyg-1x1.png");

    window.__r1Result = JSON.stringify(result);
  } catch (error) {
    window.__r1Result = JSON.stringify({
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  } finally {
    window.__evalDone = true;
  }
})();

"verify-started";
