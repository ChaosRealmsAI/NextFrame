import { createCanvas } from '@napi-rs/canvas';
import { auroraGradient } from '../auroraGradient.js';

export const WIDTH = 1920;
export const HEIGHT = 1080;
export const FPS = 30;
export const DURATION_SECONDS = 10;
export const TOTAL_FRAMES = FPS * DURATION_SECONDS;
export const BENCHMARK_OUTPUT_DIR = '/tmp/poc-k';
export const SINGLE_FRAME_PARAMS = {
  hueA: 270,
  hueB: 200,
  hueC: 320,
  intensity: 1,
  grain: 0.04,
};

export function frameIndexToTime(frameIndex) {
  return frameIndex / FPS;
}

export function frameFileName(frameIndex) {
  return `frame_${String(frameIndex).padStart(4, '0')}.png`;
}

export function renderFrameToBuffer(t, params = SINGLE_FRAME_PARAMS) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  auroraGradient(t, params, ctx);
  return canvas.toBuffer('image/png');
}
