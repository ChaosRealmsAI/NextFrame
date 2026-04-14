// Reveals clip A through a shrinking circular mask over clip B.
export function irisClose(ctxOut, canvasA, canvasB, progress, w, h) {
  const maxR = Math.sqrt(w * w + h * h) / 2;
  const r = maxR * (1 - progress);
  ctxOut.drawImage(canvasB, 0, 0);
  ctxOut.save();
  ctxOut.beginPath();
  ctxOut.arc(w / 2, h / 2, r, 0, Math.PI * 2);
  ctxOut.clip();
  ctxOut.drawImage(canvasA, 0, 0);
  ctxOut.restore();
}
