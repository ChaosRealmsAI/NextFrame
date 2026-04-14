// Wipes in clip B from the right edge over clip A.
export function wipeRight(ctxOut, canvasA, canvasB, progress, w, h) {
  const split = Math.round(w * progress);
  ctxOut.drawImage(canvasA, 0, 0);
  ctxOut.save();
  ctxOut.beginPath();
  ctxOut.rect(w - split, 0, split, h);
  ctxOut.clip();
  ctxOut.drawImage(canvasB, 0, 0);
  ctxOut.restore();
}
