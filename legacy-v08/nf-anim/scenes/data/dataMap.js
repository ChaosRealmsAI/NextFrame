import { makeDataMap } from "../sharedData.js";
// TODO: replace the stylized world outline if the spec later ships a canonical path set
const sample = {
  data: [
    { label: "San Francisco", value: 82, region: "us" },
    { label: "London", value: 64, region: "uk" },
    { label: "Bengaluru", value: 58, region: "india" },
    { label: "Tokyo", value: 71, region: "japan" },
  ],
};

const meta = {
  id: "dataMap",
  ratio: "any",
  duration_hint: 3,
  type: "motion",
  category: "data",
  description: "World map outline with animated data pins",
  params: [
    {
      name: "data",
      type: "array",
      default: sample.data,
      semantic: "pins as {label,value,region} or {label,value,x,y}",
    },
    {
      name: "color",
      type: "color",
      default: "#da7756",
      semantic: "primary warm pin color",
    },
  ],
  examples: [sample],
};

export default makeDataMap(meta, sample);
