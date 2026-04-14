// Wipe from bottom: B reveals from bottom edge.
export function wipeUp(ctxOut, canvasA, canvasB, progress, w, h) {
  const split = Math.round(h * (1 - progress));
  ctxOut.drawImage(canvasA, 0, 0);
  ctxOut.save();
  ctxOut.beginPath();
  ctxOut.rect(0, split, w, h - split);
  ctxOut.clip();
  ctxOut.drawImage(canvasB, 0, 0);
  ctxOut.restore();
}
