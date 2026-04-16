(function () {
  const root = window.__NF_V08__ = window.__NF_V08__ || {};

  function getTimeline() {
    const timeline = window.__TIMELINE__;
    if (!timeline || !Array.isArray(timeline.tracks)) return null;
    return timeline;
  }

  function getViewport() {
    const timeline = getTimeline();
    const width = Number(timeline && timeline.width) || Number(root.width) || window.innerWidth || 1920;
    const height = Number(timeline && timeline.height) || Number(root.height) || window.innerHeight || 1080;
    return { width: width, height: height };
  }

  function getBounds(clip) {
    const begin = Number(clip && clip.begin);
    const end = Number(clip && clip.end);
    if (Number.isFinite(begin) && Number.isFinite(end)) {
      return { begin: begin, end: end };
    }
    const start = Number(clip && clip.start);
    const dur = Number(clip && clip.dur);
    if (Number.isFinite(start) && Number.isFinite(dur)) {
      return { begin: start, end: start + dur };
    }
    return null;
  }

  function isActive(clip, t) {
    const bounds = getBounds(clip);
    if (!bounds) return false;
    return bounds.begin <= t && t < bounds.end;
  }

  function getApp(vp) {
    let app = document.getElementById("stage");
    if (!app) {
      app = document.createElement("div");
      app.id = "app";
      document.body.appendChild(app);
    }
    app.style.position = app.style.position || "relative";
    app.style.overflow = app.style.overflow || "hidden";
    app.style.width = vp.width + "px";
    app.style.height = vp.height + "px";
    return app;
  }

  function getSceneDef(sceneId) {
    const registry = window.__scenes;
    if (!registry || !sceneId) return null;
    return registry[sceneId] || registry["scene-" + sceneId] || null;
  }

  function ensureSurface(key, zIndex, vp) {
    const app = getApp(vp);
    let entry = SceneLoop.surfaces[key];
    if (entry) {
      entry.wrapper.style.zIndex = String(zIndex);
      return entry;
    }

    const wrapper = document.createElement("div");
    wrapper.dataset.nfClip = key;
    wrapper.style.cssText = "position:absolute;inset:0;display:none;";
    wrapper.style.zIndex = String(zIndex);

    const host = document.createElement("div");
    host.style.cssText = "position:absolute;inset:0;";

    wrapper.appendChild(host);
    app.appendChild(wrapper);

    entry = {
      wrapper: wrapper,
      host: host,
    };
    SceneLoop.surfaces[key] = entry;
    return entry;
  }

  const SceneLoop = {
    tracks: [],
    surfaces: {},
    tick: function (t) {
      const timeline = getTimeline();
      const registry = window.__scenes;
      if (!timeline || !registry) return;

      this.tracks = timeline.tracks.filter(function (track) {
        return track && track.kind === "scene" && Array.isArray(track.clips);
      });
      if (this.tracks.length === 0) return;

      const vp = getViewport();
      const active = {};

      for (let trackIndex = 0; trackIndex < this.tracks.length; trackIndex++) {
        const track = this.tracks[trackIndex];
        for (let clipIndex = 0; clipIndex < track.clips.length; clipIndex++) {
          const clip = track.clips[clipIndex];
          const key = clip.id || (track.id || "scene-track-" + trackIndex) + ":clip:" + clipIndex;
          const surface = ensureSurface(key, trackIndex * 100 + clipIndex, vp);
          const visible = isActive(clip, t);
          surface.wrapper.style.display = visible ? "block" : "none";
          if (!visible) continue;

          const sceneDef = getSceneDef(clip.scene);
          if (!sceneDef || typeof sceneDef.render !== "function") continue;

          active[key] = true;
          const bounds = getBounds(clip) || { begin: t, end: t };
          const localT = Math.max(0, t - bounds.begin);
          const params = clip.params && typeof clip.params === "object" ? clip.params : {};

          const html = sceneDef.render(localT, params, vp);
          surface.host.innerHTML = typeof html === "string" ? html : "";
        }
      }

      for (const key in this.surfaces) {
        if (!active[key]) {
          this.surfaces[key].wrapper.style.display = "none";
        }
      }
    },
  };

  root.sceneLoop = SceneLoop;
}());
