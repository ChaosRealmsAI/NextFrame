// Font registration — ensure CJK glyphs render on all platforms.
// napi-canvas ships with Cantarell only; without this we get tofu boxes
// for Chinese / Japanese / Korean text in scenes.

import { GlobalFonts } from "@napi-rs/canvas";
import { existsSync } from "node:fs";

// macOS system font candidates, in priority order. The first one that
// exists wins — we register it under canonical family names so scenes
// can refer to "sans-serif", "PingFang SC", "Hiragino Sans".
const MAC_CJK_CANDIDATES = [
  {
    path: "/System/Library/Fonts/PingFang.ttc",
    families: ["PingFang SC", "sans-serif", "system-ui"],
  },
  {
    // Hiragino Sans GB carries the broadest simplified Chinese set on macOS.
    path: "/System/Library/Fonts/Hiragino Sans GB.ttc",
    families: ["Hiragino Sans GB", "PingFang SC", "sans-serif", "system-ui"],
  },
  {
    path: "/System/Library/Fonts/STHeiti Medium.ttc",
    families: ["STHeiti", "sans-serif", "system-ui"],
  },
  {
    path: "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",
    families: ["Hiragino Sans"],
  },
];

let registered = false;

export function ensureFonts() {
  if (registered) return;
  registered = true;
  for (const cand of MAC_CJK_CANDIDATES) {
    if (existsSync(cand.path)) {
      for (const family of cand.families) {
        try {
          GlobalFonts.registerFromPath(cand.path, family);
        } catch {
          /* ignore — napi-canvas may reject duplicates */
        }
      }
    }
  }
}

// Auto-register on module import so scenes don't have to care.
ensureFonts();
