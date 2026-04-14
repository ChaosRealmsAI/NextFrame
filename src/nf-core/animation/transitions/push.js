// Pushes clip A out while clip B enters from the right.
export function push(ctxOut, canvasA, canvasB, progress, w, h) {
  ctxOut.drawImage(canvasA, -w * progress, 0);
  ctxOut.drawImage(canvasB, w - w * progress, 0);
}
