// Wipe from left: B reveals from left edge.
export function wipeLeft(ctxOut, canvasA, canvasB, progress, w, h) {
  const split = Math.round(w * progress);
  ctxOut.drawImage(canvasA, 0, 0);
  ctxOut.save();
  ctxOut.beginPath();
  ctxOut.rect(0, 0, split, h);
  ctxOut.clip();
  ctxOut.drawImage(canvasB, 0, 0);
  ctxOut.restore();
}
