const DEFAULT_ASPECT_RATIO = 16 / 9;

export function computeLetterboxRect(containerWidth, containerHeight, aspectRatio = DEFAULT_ASPECT_RATIO) {
  const width = clampDimension(containerWidth);
  const height = clampDimension(containerHeight);
  const ratio = clampAspectRatio(aspectRatio);

  if (width === 0 || height === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let innerWidth = width;
  let innerHeight = Math.floor(innerWidth / ratio);

  if (innerHeight > height) {
    innerHeight = height;
    innerWidth = Math.floor(innerHeight * ratio);
  }

  return {
    x: Math.floor((width - innerWidth) / 2),
    y: Math.floor((height - innerHeight) / 2),
    width: innerWidth,
    height: innerHeight,
  };
}

function clampAspectRatio(value) {
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_ASPECT_RATIO;
}

function clampDimension(value) {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}
