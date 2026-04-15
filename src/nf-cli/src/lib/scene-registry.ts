// Scene registry adapter — delegates to nf-core/scenes/ auto-discovery
import { listScenes as _listScenes, getScene as _getScene, getRegistry, listScenesForRatio as _listForRatio } from "../../../nf-core/scenes/index.js";

export async function listScenes() { return _listScenes(); }
export async function getScene(id: any) { return _getScene(id); }
export async function listScenesForRatio(ratioId: any) { return _listForRatio(ratioId); }
export async function getREGISTRY() { return getRegistry(); }
