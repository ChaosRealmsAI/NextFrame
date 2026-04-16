import { makePieChart } from "../sharedData.js";
// TODO: revisit pieChart legend density if the data scene spec adds more than four slices
const sample = { data: [{ label: "Organic", value: 46 }, { label: "Paid", value: 28 }, { label: "Partner", value: 16 }, { label: "Other", value: 10 }] };
const meta = { id: "pieChart", ratio: "any", duration_hint: 2.8, type: "motion", category: "data", description: "Pie sectors sweep clockwise with legend reveal", params: [{ name: "data", type: "array", default: sample.data, semantic: "slice values as numbers or {label,value} objects" }, { name: "color", type: "color", default: "#da7756", semantic: "primary warm sector color" }], examples: [sample] };
export default makePieChart(meta, sample);
