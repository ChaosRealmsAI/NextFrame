(function () {
  const root = window.__NF_V08__ = window.__NF_V08__ || {};

  const Clock = {
    source: "t",
    mainAudio: null,
    _running: false,
    _tMs: 0,
    attachAudio: function (el) {
      if (!el) return;
      this.mainAudio = el;
      this.source = "audio";
    },
    getT: function () {
      if (this.source === "audio" && this.mainAudio) {
        const currentTime = Number(this.mainAudio.currentTime);
        return Number.isFinite(currentTime) ? currentTime * 1000 : 0;
      }
      return this._tMs;
    },
    start: function () {
      if (this.source === "audio" && this.mainAudio) {
        if (typeof this.mainAudio.play === "function") {
          try {
            const pending = this.mainAudio.play();
            if (pending && typeof pending.catch === "function") pending.catch(function () {});
          } catch (_error) {}
        }
        return;
      }
      this._running = true;
      this._tMs = 0;
    },
    pause: function () {
      if (this.source === "audio" && this.mainAudio) {
        if (typeof this.mainAudio.pause === "function") {
          try {
            this.mainAudio.pause();
          } catch (_error) {}
        }
        return;
      }
      this._running = false;
    },
    seek: function (ms) {
      const nextMs = Number.isFinite(ms) ? Math.max(0, ms) : 0;
      if (this.source === "audio" && this.mainAudio) {
        try {
          this.mainAudio.currentTime = nextMs / 1000;
        } catch (_error) {}
        return;
      }
      this._tMs = nextMs;
    },
  };

  root.clock = Clock;
}());
