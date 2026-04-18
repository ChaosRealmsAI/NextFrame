// Public API for engine library (tests + embedders).
// CLI (src/cli.ts) wraps this same API.

export { parseExpr, collectRefs, ExprParseError } from './expr.js';
export { topologicalOrder, CycleError } from './topo.js';
export { parseSource } from './parser.js';
export { resolve, TrackDescribeLoader, TrackDescriptor } from './resolve.js';
export { bundle, BundleInput } from './bundler.js';
export { rename } from './rename.js';
export { loadTrack, loadTracksFor, executeTrackSrc, LoadedTrack } from './track-loader.js';
export * from './types.js';
