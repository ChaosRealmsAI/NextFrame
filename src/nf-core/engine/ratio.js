// Ratio entity — predefined aspect ratios for the entire pipeline.
// Episode locks a ratio; segments inherit; scenes must match.
export const RATIOS = {
    "16:9": { id: "16:9", width: 1920, height: 1080, label: "横屏" },
    "9:16": { id: "9:16", width: 1080, height: 1920, label: "竖屏" },
    "4:3": { id: "4:3", width: 1440, height: 1080, label: "PPT" },
};
export const RATIO_IDS = Object.keys(RATIOS);
/**
 * Get ratio definition by id.
 * @param {string} id — "16:9", "9:16", "4:3", "1:1"
 * @returns {{ id, width, height, label } | null}
 */
export function getRatio(id) {
    return RATIOS[id] || null;
}
/**
 * Check if a scene is compatible with a given ratio.
 * Rules:
 *   - scene.ratio === ratioId → compatible
 *   - scene.ratio is null/undefined → universal (any ratio)
 *   - scene.ratio !== ratioId → incompatible
 *
 * @param {{ ratio?: string | null }} sceneMeta
 * @param {string} ratioId
 * @returns {boolean}
 */
export function isSceneCompatible(sceneMeta, ratioId) {
    if (!sceneMeta.ratio)
        return true;
    return sceneMeta.ratio === ratioId;
}
/**
 * Validate all scenes in a segment against an episode ratio.
 * Returns array of error strings (empty = all good).
 *
 * @param {Array<{ scene: string }>} layers — segment layers
 * @param {string} ratioId — episode ratio
 * @param {function} getSceneMeta — (sceneId) => { ratio?: string }
 * @returns {string[]} errors
 */
export function validateSegmentRatio(layers, ratioId, getSceneMeta) {
    const errors = [];
    const ratio = getRatio(ratioId);
    if (!ratio) {
        errors.push(`Unknown ratio "${ratioId}". Valid: ${RATIO_IDS.join(", ")}`);
        return errors;
    }
    for (const layer of layers) {
        const meta = getSceneMeta(layer.scene);
        if (!meta)
            continue;
        if (!isSceneCompatible(meta, ratioId)) {
            errors.push(`Scene "${layer.scene}" has ratio "${meta.ratio}" but episode requires "${ratioId}". ` +
                `Fix: use a ${ratioId} variant or a universal scene.`);
        }
    }
    return errors;
}
