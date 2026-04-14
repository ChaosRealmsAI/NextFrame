// Wipes in clip B from the top edge over clip A.
export function wipeDown(ctxOut, canvasA, canvasB, progress, w, h) {
  const split = Math.round(h * progress);
  ctxOut.drawImage(canvasA, 0, 0);
  ctxOut.save();
  ctxOut.beginPath();
  ctxOut.rect(0, 0, w, split);
  ctxOut.clip();
  ctxOut.drawImage(canvasB, 0, 0);
  ctxOut.restore();
}
