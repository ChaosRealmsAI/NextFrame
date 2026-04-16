import { makeComparison } from "../sharedData.js";
// TODO: add optional delta badges once comparison semantics are standardized
const sample = { data: [{ label: "Speed", left: 48, right: 82 }, { label: "Quality", left: 54, right: 76 }, { label: "Reach", left: 31, right: 68 }] };
const meta = { id: "comparison", ratio: "any", duration_hint: 3, type: "motion", category: "data", description: "Two-column comparison scene with animated left and right values", params: [{ name: "data", type: "array", default: sample.data, semantic: "array of {label,left,right} comparison rows" }, { name: "color", type: "color", default: "#da7756", semantic: "primary warm accent for the left column" }], examples: [sample] };
export default makeComparison(meta, sample);
