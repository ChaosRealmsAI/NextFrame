// Font registration compatibility shim for legacy imports.
import { ensureCanvasFonts } from "./canvas-factory.js";
export function ensureFonts() {
    return ensureCanvasFonts();
}
ensureFonts();
