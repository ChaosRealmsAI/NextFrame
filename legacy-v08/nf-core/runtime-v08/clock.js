(function () {
  const root = window.__NF_V08__ = window.__NF_V08__ || {};

  const Clock = {
    source: "t",
    mainAudio: null,
    _running: false,
    _tMs: 0,
    _startWall: 0,
    _wallFallback: false,
    attachAudio: function (el) {
      if (!el) return;
      this.mainAudio = el;
      this.source = "audio";
      var self = this;
      setTimeout(function () {
        if (self.mainAudio && (self.mainAudio.paused || self.mainAudio.currentTime < 0.01)) {
          self._wallFallback = true;
          self._startWall = performance.now();
        }
      }, 500);
      // ISSUE-004: short audio (e.g. 7s) ended 后 currentTime 不推进 → clock 卡。
      // ended 时切 wallclock 从 audio 结束点继续推 timeline。
      el.addEventListener("ended", function () {
        if (self._wallFallback) return;
        var elapsedMs = (Number(self.mainAudio.currentTime) || 0) * 1000;
        self._wallFallback = true;
        self._startWall = performance.now() - elapsedMs;
      });
    },
    getT: function () {
      if (this._wallFallback) {
        return performance.now() - this._startWall;
      }
      if (this.source === "audio" && this.mainAudio) {
        var currentTime = Number(this.mainAudio.currentTime);
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
