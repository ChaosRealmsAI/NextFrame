// Scene registry adapter — delegates to nf-core/scenes/ auto-discovery
import { listScenes as _listScenes, getScene as _getScene, getRegistry, listScenesForRatio as _listForRatio, REGISTRY } from "../../../nf-core/scenes/index.js";

export { REGISTRY };
export async function listScenes() { return _listScenes(); }
export async function getScene(id: string) { return _getScene(id); }
export async function listScenesForRatio(ratioId: string) { return _listForRatio(ratioId); }
export async function getREGISTRY() { return getRegistry(); }
