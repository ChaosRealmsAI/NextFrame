// Fades from clip A to black, then from black into clip B.
export function fadeBlack(ctxOut, canvasA, canvasB, progress, w, h) {
  if (progress < 0.5) {
    const p = progress * 2;
    ctxOut.drawImage(canvasA, 0, 0);
    ctxOut.fillStyle = `rgba(0,0,0,${p})`;
    ctxOut.fillRect(0, 0, w, h);
  } else {
    const p = (progress - 0.5) * 2;
    ctxOut.fillStyle = "#000";
    ctxOut.fillRect(0, 0, w, h);
    ctxOut.globalAlpha = p;
    ctxOut.drawImage(canvasB, 0, 0);
    ctxOut.globalAlpha = 1;
  }
}
