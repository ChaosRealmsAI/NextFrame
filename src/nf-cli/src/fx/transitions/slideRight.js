// Slides B in from the right over A.
export function slideRight(ctxOut, canvasA, canvasB, progress, w, h) {
  ctxOut.drawImage(canvasA, 0, 0);
  ctxOut.drawImage(canvasB, w * (1 - progress), 0);
}
