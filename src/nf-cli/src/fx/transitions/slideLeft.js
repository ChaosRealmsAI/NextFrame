// Slides B in from the left over A.
export function slideLeft(ctxOut, canvasA, canvasB, progress, w, h) {
  ctxOut.drawImage(canvasA, 0, 0);
  ctxOut.drawImage(canvasB, -w * (1 - progress), 0);
}
