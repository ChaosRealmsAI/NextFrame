// nf-runtime — one WebView, three modes. Walking stub.

import { startPlay } from "./modes/play.js";
import { startEdit } from "./modes/edit.js";
import { startRecord } from "./modes/record.js";

export function start(mode) {
  switch (mode) {
    case "play":
      return startPlay();
    case "edit":
      return startEdit();
    case "record":
      return startRecord();
    default:
      throw new Error(`unknown runtime mode: ${mode}`);
  }
}
