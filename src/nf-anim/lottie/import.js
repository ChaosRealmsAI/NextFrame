// TODO: convert supported Lottie subsets into nf-anim JSON
const meta = { name: "convert", kind: "lottie", description: "Lottie import stub" };
export function convert(lottieJson = {}) {
  // TODO: map Lottie layers and transforms into nf-anim schema
  return { version: "0.1.0", source: lottieJson, layers: [] };
}
export { meta };
