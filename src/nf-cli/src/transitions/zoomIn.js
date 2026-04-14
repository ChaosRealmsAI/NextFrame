// Zoom: A zooms in and fades, B appears behind.
export function zoomIn(ctxOut, canvasA, canvasB, progress, w, h) {
  ctxOut.drawImage(canvasB, 0, 0);
  const scale = 1 + progress * 0.3;
  const alpha = 1 - progress;
  ctxOut.save();
  ctxOut.globalAlpha = alpha;
  ctxOut.translate(w / 2, h / 2);
  ctxOut.scale(scale, scale);
  ctxOut.translate(-w / 2, -h / 2);
  ctxOut.drawImage(canvasA, 0, 0);
  ctxOut.restore();
}
