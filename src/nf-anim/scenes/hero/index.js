import brandReveal from "./brandReveal.js";
import productLaunch from "./productLaunch.js";
import statHero from "./statHero.js";
import quoteLarge from "./quoteLarge.js";
import sectionDivider from "./sectionDivider.js";
import showcaseA_brandHero from "./showcaseA_brandHero.js";
import showcaseC_morphParade from "./showcaseC_morphParade.js";
import showcaseD_abstractMotion from "./showcaseD_abstractMotion.js";
const meta = { name: "hero", kind: "scenes", description: "hero scenes registry" };
export const HERO_SCENES = { brandReveal, productLaunch, statHero, quoteLarge, sectionDivider, showcaseA_brandHero, showcaseC_morphParade, showcaseD_abstractMotion };
export function listScenes() {
  // TODO: return richer registry metadata
  return Object.values(HERO_SCENES).map((entry) => entry.meta || entry);
}
export { meta };
export default HERO_SCENES;
