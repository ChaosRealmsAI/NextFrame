// Slides clip B in from the left over clip A.
export function slideLeftT(ctxOut, canvasA, canvasB, progress, w, h) {
  ctxOut.drawImage(canvasA, 0, 0);
  ctxOut.drawImage(canvasB, -w + w * progress, 0);
}
