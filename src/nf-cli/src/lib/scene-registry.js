// Runtime scene registry adapter — delegates to scenes/index.js
import { listScenes as legacyList, getScene as legacyGet, REGISTRY as legacyRegistry } from "../../scenes/index.js";

export const REGISTRY = legacyRegistry;
export const listScenes = legacyList;
export const getScene = legacyGet;
