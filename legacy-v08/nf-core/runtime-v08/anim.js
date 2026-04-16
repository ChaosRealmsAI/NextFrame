(function () {
  const root = window.__NF_V08__ = window.__NF_V08__ || {};

  function getTimeline() {
    const timeline = window.__TIMELINE__;
    if (!timeline || !Array.isArray(timeline.tracks)) return null;
    return timeline;
  }

  function keyframeAt(clip) {
    const at = Number(clip && clip.at);
    if (Number.isFinite(at)) return at;
    return null;
  }

  function parseTarget(target) {
    const match = /^([^.]+)\.clips\[(\d+)\]\.params\.([A-Za-z0-9_$]+)$/.exec(String(target || ""));
    if (!match) return null;
    return {
      trackId: match[1],
      clipIndex: Number(match[2]),
      paramKey: match[3],
    };
  }

  function cubicBezier(x1, y1, x2, y2) {
    function sampleCurveX(t) {
      return ((1 - 3 * x2 + 3 * x1) * t + (3 * x2 - 6 * x1)) * t * t + 3 * x1 * t;
    }
    function sampleCurveY(t) {
      return ((1 - 3 * y2 + 3 * y1) * t + (3 * y2 - 6 * y1)) * t * t + 3 * y1 * t;
    }
    function sampleCurveSlopeX(t) {
      return 3 * (1 - 3 * x2 + 3 * x1) * t * t + 2 * (3 * x2 - 6 * x1) * t + 3 * x1;
    }
    function solveCurveX(x) {
      let t = x;
      for (let i = 0; i < 8; i++) {
        const slope = sampleCurveSlopeX(t);
        if (Math.abs(slope) < 1e-6) break;
        const currentX = sampleCurveX(t) - x;
        if (Math.abs(currentX) < 1e-6) return t;
        t -= currentX / slope;
      }
      let lower = 0;
      let upper = 1;
      t = x;
      while (lower < upper) {
        const currentX = sampleCurveX(t);
        if (Math.abs(currentX - x) < 1e-6) return t;
        if (x > currentX) lower = t;
        else upper = t;
        t = (upper - lower) * 0.5 + lower;
        if (Math.abs(upper - lower) < 1e-6) return t;
      }
      return t;
    }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      return sampleCurveY(solveCurveX(x));
    };
  }

  function easingFor(ease) {
    if (!ease || ease === "linear") {
      return function (x) { return x; };
    }
    const match = /^cubic-bezier\(\s*([^)]+)\s*\)$/.exec(String(ease));
    if (!match) {
      return function (x) { return x; };
    }
    const parts = match[1].split(",").map(function (value) { return Number(value.trim()); });
    if (parts.length !== 4 || parts.some(function (value) { return !Number.isFinite(value); })) {
      return function (x) { return x; };
    }
    return cubicBezier(parts[0], parts[1], parts[2], parts[3]);
  }

  function interpolateValue(fromValue, toValue, progress) {
    if (typeof fromValue === "number" && typeof toValue === "number") {
      return fromValue + (toValue - fromValue) * progress;
    }
    if (progress >= 1) return toValue;
    return fromValue;
  }

  function resolvePair(clips, t) {
    if (!Array.isArray(clips) || clips.length === 0) return null;
    const points = clips
      .map(function (clip) {
        return { clip: clip, at: keyframeAt(clip) };
      })
      .filter(function (entry) {
        return entry.at !== null;
      })
      .sort(function (left, right) {
        return left.at - right.at;
      });
    if (points.length === 0) return null;
    if (t <= points[0].at) return { left: points[0].clip, right: points[0].clip, progress: 0 };
    if (t >= points[points.length - 1].at) {
      return { left: points[points.length - 1].clip, right: points[points.length - 1].clip, progress: 1 };
    }
    for (let i = 0; i < points.length - 1; i++) {
      const left = points[i];
      const right = points[i + 1];
      if (left.at <= t && t <= right.at) {
        const span = right.at - left.at;
        const progress = span <= 0 ? 1 : (t - left.at) / span;
        return { left: left.clip, right: right.clip, progress: progress };
      }
    }
    return null;
  }

  const Anim = {
    tracks: [],
    apply: function (t) {
      const timeline = getTimeline();
      if (!timeline) return;

      this.tracks = timeline.tracks.filter(function (track) {
        return track && track.kind === "animation" && Array.isArray(track.clips);
      });

      for (let i = 0; i < this.tracks.length; i++) {
        const track = this.tracks[i];
        const target = parseTarget(track.target);
        if (!target) continue;

        const sceneTrack = timeline.tracks.find(function (candidate) {
          return candidate && candidate.id === target.trackId;
        });
        if (!sceneTrack || !Array.isArray(sceneTrack.clips)) continue;

        const targetClip = sceneTrack.clips[target.clipIndex];
        if (!targetClip) continue;
        if (!targetClip.params || typeof targetClip.params !== "object") {
          targetClip.params = {};
        }

        const pair = resolvePair(track.clips, t);
        if (!pair) continue;

        const ease = easingFor(pair.right.ease || pair.left.ease || "linear");
        const progress = pair.left === pair.right ? 1 : ease(Math.max(0, Math.min(1, pair.progress)));
        targetClip.params[target.paramKey] = interpolateValue(pair.left.value, pair.right.value, progress);
      }
    },
  };

  root.anim = Anim;
  root.frame = function (t) {
    const currentT = Number.isFinite(t)
      ? t
      : root.clock && typeof root.clock.getT === "function"
        ? root.clock.getT()
        : 0;
    if (Number.isFinite(t) && root.clock && root.clock.source === "t" && typeof root.clock.seek === "function") {
      root.clock.seek(currentT);
    }
    if (root.anim && typeof root.anim.apply === "function") root.anim.apply(currentT);
    if (root.sceneLoop && typeof root.sceneLoop.tick === "function") root.sceneLoop.tick(currentT);
    if (root.subtitle && typeof root.subtitle.render === "function") root.subtitle.render(currentT);
    return currentT;
  };
}());
