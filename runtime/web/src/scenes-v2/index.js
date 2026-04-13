// Scene Registry — all v2 components
// Each scene: { id, type, name, category, defaultParams, create, update, destroy }

import auroraGradient from './auroraGradient.js';
import barChart from './barChart.js';
import bulletList from './bulletList.js';
import calloutCard from './calloutCard.js';
import circleRipple from './circleRipple.js';
import codeBlock from './codeBlock.js';
import fluidBackground from './fluidBackground.js';
import headline from './headline.js';
import horizontalBars from './horizontalBars.js';
import lineChart from './lineChart.js';
import lowerThird from './lowerThird.js';
import meshGrid from './meshGrid.js';
import neonGrid from './neonGrid.js';
import numberCounter from './numberCounter.js';
import particleFlow from './particleFlow.js';
import pieChart from './pieChart.js';
import progressBar from './progressBar.js';
import progressRing from './progressRing.js';
import pulseWave from './pulseWave.js';
import quoteBlock from './quoteBlock.js';
import radarChart from './radarChart.js';
import radialBurst from './radialBurst.js';
import splitText from './splitText.js';
import starfield from './starfield.js';
import subtitleBar from './subtitleBar.js';
import svgRings from './svgRings.js';
import treeMap from './treeMap.js';
import vignette from './vignette.js';

const ALL_SCENES = [
  // Canvas — backgrounds & effects
  auroraGradient, fluidBackground, neonGrid, vignette,
  starfield, particleFlow, circleRipple, meshGrid,
  pulseWave, radialBurst,
  // DOM — text & layout
  headline, bulletList, quoteBlock, codeBlock,
  lowerThird, numberCounter, splitText, subtitleBar,
  progressBar, calloutCard,
  // SVG — data viz & decoration
  barChart, lineChart, pieChart, progressRing,
  svgRings, radarChart, horizontalBars, treeMap,
];

// Map: id → scene object
export const SCENE_REGISTRY = {};
for (const scene of ALL_SCENES) {
  SCENE_REGISTRY[scene.id] = scene;
}

export default SCENE_REGISTRY;
