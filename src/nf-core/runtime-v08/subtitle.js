(function () {
  const root = window.__NF_V08__ = window.__NF_V08__ || {};

  function getTimeline() {
    const timeline = window.__TIMELINE__;
    if (!timeline || !Array.isArray(timeline.tracks)) return null;
    return timeline;
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

  function activeAt(clip, t) {
    const bounds = getBounds(clip);
    return !!bounds && bounds.begin <= t && t < bounds.end;
  }

  function ensureContainer() {
    let node = document.getElementById("subtitles");
    if (node) return node;
    node = document.createElement("div");
    node.id = "subtitles";
    node.style.cssText = [
      "position:absolute",
      "left:50%",
      "bottom:5%",
      "transform:translateX(-50%)",
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "gap:12px",
      "width:min(90%, 1200px)",
      "pointer-events:none",
      "z-index:9999",
    ].join(";");
    const app = document.getElementById("app") || document.body;
    app.appendChild(node);
    return node;
  }

  function textForClip(clip) {
    if (typeof clip.text === "string") return clip.text;
    if (clip.params && typeof clip.params.text === "string") return clip.params.text;
    return "";
  }

  function rowStyle(track, clip) {
    const style = Object.assign({}, track && track.style, clip && clip.style);
    return {
      color: style.color || "#ffffff",
      background: style.background || "rgba(0, 0, 0, 0.72)",
      fontSize: Number(style.fontSize) || 42,
      fontWeight: style.fontWeight || 600,
      padding: style.padding || "10px 18px",
      borderRadius: style.borderRadius || "12px",
    };
  }

  const Subtitle = {
    tracks: [],
    render: function (t) {
      const timeline = getTimeline();
      if (!timeline) return;

      this.tracks = timeline.tracks.filter(function (track) {
        return track && track.kind === "subtitle" && Array.isArray(track.clips);
      });

      const container = ensureContainer();
      const rows = [];
      for (let trackIndex = 0; trackIndex < this.tracks.length; trackIndex++) {
        const track = this.tracks[trackIndex];
        for (let clipIndex = 0; clipIndex < track.clips.length; clipIndex++) {
          const clip = track.clips[clipIndex];
          if (!activeAt(clip, t)) continue;
          const text = textForClip(clip);
          if (!text) continue;
          rows.push({ text: text, style: rowStyle(track, clip) });
          break;
        }
      }

      container.innerHTML = "";
      if (rows.length === 0) return;

      for (let i = 0; i < rows.length; i++) {
        const row = document.createElement("div");
        row.textContent = rows[i].text;
        row.style.cssText = [
          "max-width:100%",
          "text-align:center",
          "line-height:1.4",
          "white-space:pre-wrap",
          "text-wrap:balance",
          "box-sizing:border-box",
          "color:" + rows[i].style.color,
          "background:" + rows[i].style.background,
          "font-size:" + rows[i].style.fontSize + "px",
          "font-weight:" + rows[i].style.fontWeight,
          "padding:" + rows[i].style.padding,
          "border-radius:" + rows[i].style.borderRadius,
        ].join(";");
        container.appendChild(row);
      }
    },
  };

  root.subtitle = Subtitle;
}());
