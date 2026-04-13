const IMAGE_CACHE = new Map();

/**
 * Return a cached image instance for the provided source URL.
 * Resolved image objects remain cached for the lifetime of the session.
 * @param {string | null | undefined} src - Data URL, local file URL, or other browser-supported image URL.
 * @returns {HTMLImageElement | null} The cached image element, or null when images are unavailable.
 */
export function loadImage(src) {
  if (typeof src !== "string" || src.length === 0) {
    return null;
  }

  if (IMAGE_CACHE.has(src)) {
    return IMAGE_CACHE.get(src);
  }

  if (typeof Image !== "function") {
    return null;
  }

  const image = new Image();
  image.decoding = "async";
  image.src = src;
  IMAGE_CACHE.set(src, image);
  return image;
}
