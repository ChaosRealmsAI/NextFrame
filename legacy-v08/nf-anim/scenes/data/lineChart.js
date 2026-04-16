import { makeLineChart } from "../sharedData.js";
// TODO: refine lineChart path treatment if the renderer grows stroke-dash support
const sample = {
  data: [
    { label: "Q1", value: 18 },
    { label: "Q2", value: 42 },
    { label: "Q3", value: 35 },
    { label: "Q4", value: 64 },
    { label: "Q5", value: 58 },
  ],
};

const meta = {
  id: "lineChart",
  ratio: "any",
  duration_hint: 3,
  type: "motion",
  category: "data",
  description: "Line graph with stroke reveal and sequential point pops",
  params: [
    {
      name: "data",
      type: "array",
      default: sample.data,
      semantic: "ordered values or {label,value} points",
    },
    {
      name: "color",
      type: "color",
      default: "#da7756",
      semantic: "primary warm line color",
    },
  ],
  examples: [sample],
};

export default makeLineChart(meta, sample);
