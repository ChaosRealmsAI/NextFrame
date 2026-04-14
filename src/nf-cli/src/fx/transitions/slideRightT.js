// Slides clip B in from the right over clip A.
export function slideRightT(ctxOut, canvasA, canvasB, progress, w, h) {
  ctxOut.drawImage(canvasA, 0, 0);
  ctxOut.drawImage(canvasB, w - w * progress, 0);
}
