// TODO: implement easing curves required by nf-anim behaviors
const meta = { name: "easings", kind: "engine", description: "Easing registry stub" };
const identity = (t = 0) => t;
export const EASE = { linear: identity, in: identity, out: identity, inOut: identity, outBack: identity, outElastic: identity, outBounce: identity };
export { meta };
