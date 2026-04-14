// Font registration for legacy canvas rendering.

import { GlobalFonts } from "@napi-rs/canvas";
import { existsSync } from "node:fs";

const MAC_CJK_CANDIDATES = [
  {
    path: "/System/Library/Fonts/PingFang.ttc",
    families: ["PingFang SC", "sans-serif", "system-ui"],
  },
  {
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
  for (const candidate of MAC_CJK_CANDIDATES) {
    if (!existsSync(candidate.path)) continue;
    for (const family of candidate.families) {
      try {
        GlobalFonts.registerFromPath(candidate.path, family);
      } catch {}
    }
  }
}

ensureFonts();
