import type { AnchorDict, AnchorEntry } from "../types.js";

export default async function manualFiller(_entry: AnchorEntry, _dict: AnchorDict): Promise<void> {
  throw new Error("NOT_IMPLEMENTED: anchors.fillers.manual");
}
