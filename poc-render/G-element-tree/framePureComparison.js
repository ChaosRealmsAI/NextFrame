import { HEIGHT, WIDTH } from './sceneModel.js';

export function drawProductLaunchSlideDirect(ctx) {
  ctx.fillStyle = '#09111f';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = '#f5f7ff';
  ctx.font = 'normal 800 112px Arial';
  ctx.textBaseline = 'top';
  ctx.fillText('PRODUCT LAUNCH', 140, 146);

  ctx.fillStyle = '#b6c2e2';
  ctx.font = 'normal 500 42px Arial';
  ctx.fillText('Three hero SKUs. One confident launch story.', 146, 292);

  ctx.save();
  ctx.translate(1420, 518);
  ctx.rotate(-0.18);

  ctx.globalAlpha = 0.95;
  ctx.fillStyle = '#ff6b6b';
  ctx.beginPath();
  ctx.arc(0, 0, 170, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.92;
  ctx.fillStyle = '#2ec4b6';
  ctx.beginPath();
  ctx.arc(-210, 184, 122, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#4d96ff';
  ctx.beginPath();
  ctx.arc(188, 156, 138, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
