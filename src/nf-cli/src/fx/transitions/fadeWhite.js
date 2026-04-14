// Fades from clip A to white, then from white into clip B.
export function fadeWhite(ctxOut, canvasA, canvasB, progress, w, h) {
  if (progress < 0.5) {
    const p = progress * 2;
    ctxOut.drawImage(canvasA, 0, 0);
    ctxOut.fillStyle = `rgba(255,255,255,${p})`;
    ctxOut.fillRect(0, 0, w, h);
  } else {
    const p = (progress - 0.5) * 2;
    ctxOut.fillStyle = "#fff";
    ctxOut.fillRect(0, 0, w, h);
    ctxOut.globalAlpha = p;
    ctxOut.drawImage(canvasB, 0, 0);
    ctxOut.globalAlpha = 1;
  }
}
