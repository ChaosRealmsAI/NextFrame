import { makeBarChart } from "../sharedData.js";
// TODO: expand barChart styling once per-axis labels or legends are standardized
const sample = {
  data: [
    { label: "Shader", value: 88 },
    { label: "Motion", value: 62 },
    { label: "Particle", value: 34 },
    { label: "UX", value: 76 },
  ],
};

const meta = {
  id: "barChart",
  ratio: "any",
  duration_hint: 2.8,
  type: "motion",
  category: "data",
  description: "Bar chart with stagger entrance and categorical labels",
  params: [
    {
      name: "data",
      type: "array",
      default: sample.data,
      semantic: "array of {label,value} objects or numeric values",
    },
    {
      name: "color",
      type: "color",
      default: "#da7756",
      semantic: "primary warm bar color",
    },
  ],
  examples: [sample],
};

export default makeBarChart(meta, sample);
