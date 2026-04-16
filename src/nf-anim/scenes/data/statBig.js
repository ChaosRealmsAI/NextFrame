import { makeStatBig } from "../sharedData.js";
// TODO: refine statBig art direction if the spec gains stricter layout tokens
const sample = { data: [{ label: "Revenue", value: 128, suffix: "M" }, { label: "YoY Growth", value: 42, suffix: "%" }, { label: "Conversion", value: 18, suffix: "%" }, { label: "NPS", value: 74 }] };
const meta = { id: "statBig", ratio: "any", duration_hint: 2.8, type: "motion", category: "data", description: "One key stat foreground plus three supporting stats below", params: [{ name: "data", type: "array", default: sample.data, semantic: "main stat first, followed by up to three supporting stats" }, { name: "color", type: "color", default: "#da7756", semantic: "primary warm accent color" }], examples: [sample] };
export default makeStatBig(meta, sample);
