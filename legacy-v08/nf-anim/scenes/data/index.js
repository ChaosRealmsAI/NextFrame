import statBig from "./statBig.js";
import barChart from "./barChart.js";
import lineChart from "./lineChart.js";
import pieChart from "./pieChart.js";
import comparison from "./comparison.js";
import progressRing from "./progressRing.js";
import kpiGrid from "./kpiGrid.js";
import dataMap from "./dataMap.js";
const meta = { name: "data", kind: "scenes", description: "data scenes registry" };
export const DATA_SCENES = { statBig, barChart, lineChart, pieChart, comparison, progressRing, kpiGrid, dataMap };
export function listScenes() {
  // TODO: return richer registry metadata
  return Object.values(DATA_SCENES).map((entry) => entry.meta || entry);
}
export { meta };
export default DATA_SCENES;
