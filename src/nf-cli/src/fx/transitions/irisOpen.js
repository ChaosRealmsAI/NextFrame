// Reveals clip B through an expanding circular mask over clip A.
export function irisOpen(ctxOut, canvasA, canvasB, progress, w, h) {
  const maxR = Math.sqrt(w * w + h * h) / 2;
  const r = maxR * progress;
  ctxOut.drawImage(canvasA, 0, 0);
  ctxOut.save();
  ctxOut.beginPath();
  ctxOut.arc(w / 2, h / 2, r, 0, Math.PI * 2);
  ctxOut.clip();
  ctxOut.drawImage(canvasB, 0, 0);
  ctxOut.restore();
}
