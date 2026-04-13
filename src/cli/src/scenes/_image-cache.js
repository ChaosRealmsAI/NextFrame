import { Image } from "@napi-rs/canvas";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const IMAGE_CACHE = new Map();

/**
 * Load an image synchronously and cache the decoded Image instance.
 * @param {string | null | undefined} src - Data URL, local file URL, or local filesystem path.
 * @returns {Image | null}
 */
export function loadImage(src) {
  if (typeof src !== "string" || src.length === 0) return null;
  if (IMAGE_CACHE.has(src)) return IMAGE_CACHE.get(src);

  const imageSource = readImageSource(src);
  if (imageSource === null) {
    IMAGE_CACHE.set(src, null);
    return null;
  }

  const image = new Image();
  try {
    image.src = imageSource;
  } catch {
    IMAGE_CACHE.set(src, null);
    return null;
  }

  IMAGE_CACHE.set(src, image);
  return image;
}

function readImageSource(src) {
  if (src.startsWith("data:")) {
    return src;
  }

  const path = src.startsWith("file://") ? fileURLToPath(src) : resolve(src);
  if (!existsSync(path)) {
    return null;
  }

  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}
