// Adds deterministic film grain noise to pixel buffers or canvas overlays.
function clamp01(value, fallback) {
    const normalized = value ?? fallback;
    return Math.max(0, Math.min(1, normalized));
}
export function getFilmGrainIntensity(params = {}) {
    return clamp01(params.intensity ?? params.amount, 0.04);
}
function nextNoise(seed) {
    return (seed * 1664525 + 1013904223) >>> 0;
}
function createNoiseCanvas(createCanvas, width, height, seedBase) {
    const noiseCanvas = createCanvas(width, height);
    const noiseCtx = noiseCanvas.getContext("2d");
    const noiseData = noiseCtx.createImageData(width, height);
    let seed = seedBase >>> 0;
    for (let i = 0; i < noiseData.data.length; i += 4) {
        seed = nextNoise(seed + i);
        const gray = seed & 0xff;
        noiseData.data[i] = gray;
        noiseData.data[i + 1] = gray;
        noiseData.data[i + 2] = gray;
        noiseData.data[i + 3] = 255;
    }
    noiseCtx.putImageData(noiseData, 0, 0);
    return noiseCanvas;
}
// Deterministic film grain — seed varies per frame via t, no Math.random.
export function filmGrain(data, w, h, params) {
    const amount = getFilmGrainIntensity(params) * 255;
    const t = params._t || 0;
    let seed = 5381 + Math.floor(t * 1000);
    for (let i = 0; i < data.length; i += 4) {
        seed = ((seed << 5) + seed + i) & 0x7fffffff;
        const noise = ((seed % 256) - 128) * (amount / 128);
        data[i] = Math.max(0, Math.min(255, data[i] + noise));
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    }
}
export function applyFilmGrainOverlay(ctx, w, h, params = {}, createCanvas) {
    const intensity = getFilmGrainIntensity(params);
    if (intensity <= 0 || typeof createCanvas !== "function")
        return;
    const noiseWidth = Math.max(1, Math.round(w / 4));
    const noiseHeight = Math.max(1, Math.round(h / 4));
    const t = params._t || 0;
    const frameSeed = Math.floor(t * 1000);
    const baseNoise = createNoiseCanvas(createCanvas, noiseWidth, noiseHeight, 0x9e3779b9 ^ frameSeed);
    const detailNoise = createNoiseCanvas(createCanvas, noiseWidth, noiseHeight, 0x85ebca6b ^ (frameSeed * 3));
    const softNoise = createNoiseCanvas(createCanvas, noiseWidth, noiseHeight, 0xc2b2ae35 ^ (frameSeed * 7));
    const offsetX = (frameSeed % 19) - 9;
    const offsetY = ((frameSeed >> 1) % 17) - 8;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = intensity * 0.5;
    ctx.drawImage(baseNoise, 0, 0, w, h);
    ctx.globalAlpha = intensity * 0.3;
    ctx.drawImage(detailNoise, offsetX, offsetY, w + 14, h + 10);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = intensity * 0.2;
    ctx.drawImage(softNoise, -offsetY, offsetX, w + 10, h + 14);
    ctx.restore();
}
