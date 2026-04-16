import { makeKpiGrid } from "../sharedData.js";
// TODO: add optional secondary sparkline treatment if KPI card content expands later
const sample = { data: [{ label: "ARR", value: 128, suffix: "M" }, { label: "Margin", value: 32, suffix: "%" }, { label: "CAC Payback", value: 11, suffix: "m" }, { label: "Retention", value: 91, suffix: "%" }] };
const meta = { id: "kpiGrid", ratio: "any", duration_hint: 2.8, type: "motion", category: "data", description: "Four-up KPI card grid with staggered reveal", params: [{ name: "data", type: "array", default: sample.data, semantic: "up to four stat-card objects with label and value" }, { name: "color", type: "color", default: "#da7756", semantic: "primary warm card accent color" }], examples: [sample] };
export default makeKpiGrid(meta, sample);
