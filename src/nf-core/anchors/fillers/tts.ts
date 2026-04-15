import type { AnchorDict, AnchorEntry } from "../types.js";

export default async function ttsFiller(_entry: AnchorEntry, _dict: AnchorDict): Promise<void> {
  throw new Error("NOT_IMPLEMENTED: anchors.fillers.tts");
}
