import { makeProgressRing } from "../sharedData.js";
// TODO: switch progressRing to a true arc primitive if one lands in nf-anim shapes
const sample = {
  data: [{ label: "Launch Readiness", value: 86, suffix: "complete" }],
};

const meta = {
  id: "progressRing",
  ratio: "any",
  duration_hint: 2.6,
  type: "motion",
  category: "data",
  description: "Circular progress ring with animated percentage count-up inside",
  params: [
    {
      name: "data",
      type: "array",
      default: sample.data,
      semantic: "single numeric value or {label,value} object from 0 to 100",
    },
    {
      name: "color",
      type: "color",
      default: "#da7756",
      semantic: "primary warm progress color",
    },
  ],
  examples: [sample],
};

export default makeProgressRing(meta, sample);
