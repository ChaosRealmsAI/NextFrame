// Shared utilities for scene components.
// These are pure functions usable across all themes and ratios.

/**
 * Two-level subtitle lookup for bilingual content.
 * segment → English + speaker (whole sentence)
 * cn[] → Chinese (may split into multiple short phrases, each with own timing)
 *
 * @param {Array} segments - fine.json segments array (two-level structure)
 * @param {number} t - current time in seconds
 * @returns {{ en: string, cn: string, speaker: string } | null}
 */
function findActiveSub(segments, t) {
  if (!Array.isArray(segments)) return null;
  for (const seg of segments) {
    if (t < seg.s || t >= seg.e) continue;
    const en = seg.en || '';
    const speaker = seg.speaker || '';
    let cn = '';
    if (Array.isArray(seg.cn)) {
      for (const sub of seg.cn) {
        if (t >= sub.s && t < sub.e) {
          cn = sub.text || '';
          break;
        }
      }
    }
    return { en, cn, speaker };
  }
  return null;
}

/**
 * Format seconds to MM:SS display.
 * @param {number} seconds
 * @returns {string}
 */
function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}

/**
 * Clamp a value between min and max.
 * @param {number} v
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/**
 * Linear interpolation.
 * @param {number} a - start value
 * @param {number} b - end value
 * @param {number} t - progress 0..1
 * @returns {number}
 */
function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}
