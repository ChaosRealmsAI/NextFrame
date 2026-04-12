export const WIDTH = 1920;
export const HEIGHT = 1080;

export function identityMatrix() {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

export function multiplyMatrices(left, right) {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

export function translationMatrix(x = 0, y = 0) {
  return { a: 1, b: 0, c: 0, d: 1, e: x, f: y };
}

export function rotationMatrix(radians = 0) {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

export function scaleMatrix(x = 1, y = 1) {
  return { a: x, b: 0, c: 0, d: y, e: 0, f: 0 };
}

export function invertMatrix(matrix) {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (Math.abs(determinant) < 1e-8) {
    return null;
  }

  return {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant,
  };
}

export function applyMatrixToPoint(matrix, x, y) {
  return {
    x: matrix.a * x + matrix.c * y + matrix.e,
    y: matrix.b * x + matrix.d * y + matrix.f,
  };
}

export function buildLocalMatrix(element) {
  const transform = element.transform ?? {};
  const scale = transform.scale ?? 1;
  const scaleX = transform.scaleX ?? scale;
  const scaleY = transform.scaleY ?? scale;

  let matrix = translationMatrix(element.x ?? 0, element.y ?? 0);

  if (transform.rotate) {
    matrix = multiplyMatrices(matrix, rotationMatrix(transform.rotate));
  }

  if (scaleX !== 1 || scaleY !== 1) {
    matrix = multiplyMatrices(matrix, scaleMatrix(scaleX, scaleY));
  }

  return matrix;
}

export function renderScene(ctx, tree, viewportTransform = identityMatrix()) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.restore();
  renderElement(ctx, tree, viewportTransform, 1);
}

export function renderElement(ctx, element, parentMatrix, parentOpacity) {
  const worldMatrix = multiplyMatrices(parentMatrix, buildLocalMatrix(element));
  const opacity = parentOpacity * (element.opacity ?? 1);

  if (opacity <= 0) {
    return;
  }

  drawElement(ctx, element, worldMatrix, opacity);

  for (const child of element.children ?? []) {
    renderElement(ctx, child, worldMatrix, opacity);
  }
}

export function hitTestScene(
  tree,
  screenX,
  screenY,
  viewportTransform = identityMatrix(),
  measureCtx
) {
  return hitTestElement(
    tree,
    screenX,
    screenY,
    viewportTransform,
    measureCtx,
    1
  );
}

function hitTestElement(
  element,
  screenX,
  screenY,
  parentMatrix,
  measureCtx,
  parentOpacity
) {
  const worldMatrix = multiplyMatrices(parentMatrix, buildLocalMatrix(element));
  const opacity = parentOpacity * (element.opacity ?? 1);

  if (opacity <= 0) {
    return null;
  }

  const children = element.children ?? [];
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const hitId = hitTestElement(
      children[index],
      screenX,
      screenY,
      worldMatrix,
      measureCtx,
      opacity
    );
    if (hitId) {
      return hitId;
    }
  }

  if (element.type === 'group') {
    return null;
  }

  return isElementHit(element, screenX, screenY, worldMatrix, measureCtx)
    ? element.id
    : null;
}

function drawElement(ctx, element, matrix, opacity) {
  switch (element.type) {
    case 'group':
      return;
    case 'rect':
      ctx.save();
      applyCanvasMatrix(ctx, matrix);
      ctx.globalAlpha = opacity;
      ctx.fillStyle = element.fill;
      ctx.fillRect(0, 0, element.w, element.h);
      ctx.restore();
      return;
    case 'circle':
      ctx.save();
      applyCanvasMatrix(ctx, matrix);
      ctx.globalAlpha = opacity;
      ctx.fillStyle = element.fill;
      ctx.beginPath();
      ctx.arc(0, 0, element.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    case 'text':
      ctx.save();
      applyCanvasMatrix(ctx, matrix);
      ctx.globalAlpha = opacity;
      ctx.fillStyle = element.fill;
      ctx.textBaseline = 'top';
      ctx.font = buildFontShorthand(element);
      ctx.fillText(element.content, 0, 0);
      ctx.restore();
      return;
    default:
      throw new Error(`Unsupported element type: ${element.type}`);
  }
}

function isElementHit(element, screenX, screenY, worldMatrix, measureCtx) {
  const inverse = invertMatrix(worldMatrix);
  if (!inverse) {
    return false;
  }

  const localPoint = applyMatrixToPoint(inverse, screenX, screenY);

  switch (element.type) {
    case 'rect':
      return (
        localPoint.x >= 0 &&
        localPoint.x <= element.w &&
        localPoint.y >= 0 &&
        localPoint.y <= element.h
      );
    case 'circle':
      return localPoint.x ** 2 + localPoint.y ** 2 <= element.r ** 2;
    case 'text': {
      const bounds = measureTextBounds(measureCtx, element);
      return (
        localPoint.x >= 0 &&
        localPoint.x <= bounds.width &&
        localPoint.y >= 0 &&
        localPoint.y <= bounds.height
      );
    }
    default:
      return false;
  }
}

function measureTextBounds(ctx, element) {
  ctx.save();
  ctx.font = buildFontShorthand(element);
  const metrics = ctx.measureText(element.content);
  ctx.restore();

  const fontSize = element.fontSize ?? 16;
  const measuredHeight =
    (metrics.actualBoundingBoxAscent ?? fontSize * 0.8) +
    (metrics.actualBoundingBoxDescent ?? fontSize * 0.2);

  return {
    width: metrics.width,
    height: Math.max(measuredHeight, fontSize),
  };
}

function buildFontShorthand(element) {
  const fontStyle = element.fontStyle ?? 'normal';
  const fontWeight = element.fontWeight ?? 400;
  const fontSize = element.fontSize ?? 16;
  const fontFamily = element.fontFamily ?? 'Arial';
  return `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
}

function applyCanvasMatrix(ctx, matrix) {
  ctx.setTransform(
    matrix.a,
    matrix.b,
    matrix.c,
    matrix.d,
    matrix.e,
    matrix.f
  );
}
