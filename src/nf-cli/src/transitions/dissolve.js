// Cross-fade: A fades out, B fades in.
export function dissolve(ctxOut, canvasA, canvasB, progress, w, h) {
  ctxOut.globalAlpha = 1 - progress;
  ctxOut.drawImage(canvasA, 0, 0);
  ctxOut.globalAlpha = progress;
  ctxOut.drawImage(canvasB, 0, 0);
  ctxOut.globalAlpha = 1;
}
