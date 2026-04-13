// Scene Registry — all v2 components
// Each scene: { id, type, name, category, defaultParams, create, update, destroy }

import auroraGradient from './auroraGradient.js';
import barChart from './barChart.js';
import bulletList from './bulletList.js';
import calloutCard from './calloutCard.js';
import card3d from './card3d.js';
import circleRipple from './circleRipple.js';
import codeBlock from './codeBlock.js';
import confetti from './confetti.js';
import featureGrid from './featureGrid.js';
import agentLoop from './agentLoop.js';
import flowChart from './flowChart.js';
import fluidBackground from './fluidBackground.js';
import headline from './headline.js';
import horizontalBars from './horizontalBars.js';
import imageHero from './imageHero.js';
import lineChart from './lineChart.js';
import logoReveal from './logoReveal.js';
import lowerThird from './lowerThird.js';
import marquee from './marquee.js';
import meshGrid from './meshGrid.js';
import neonGrid from './neonGrid.js';
import numberCounter from './numberCounter.js';
import parallaxStack from './parallaxStack.js';
import particleFlow from './particleFlow.js';
import pieChart from './pieChart.js';
import progressBar from './progressBar.js';
import progressRing from './progressRing.js';
import pulseWave from './pulseWave.js';
import quoteBlock from './quoteBlock.js';
import radarChart from './radarChart.js';
import radialBurst from './radialBurst.js';
import slideFrame from './slideFrame.js';
import splitText from './splitText.js';
import starfield from './starfield.js';
import subtitleBar from './subtitleBar.js';
import svgRings from './svgRings.js';
import timelineViz from './timelineViz.js';
import treeMap from './treeMap.js';
import typewriter from './typewriter.js';
import videoClip from './videoClip.js';
import vignette from './vignette.js';
import waveform from './waveform.js';
import dimToolsSlide from './dimToolsSlide.js';
// WebGL shader scenes
import shaderGradient from './shaderGradient.js';
import shaderNoise from './shaderNoise.js';
import shaderGlitch from './shaderGlitch.js';
import shaderChromatic from './shaderChromatic.js';
import shaderPlasma from './shaderPlasma.js';
import shaderTunnel from './shaderTunnel.js';
import shaderRipple from './shaderRipple.js';
import shaderFirefly from './shaderFirefly.js';
// Media + Audio
import audioTrack from './audioTrack.js';
import syncSubs from './syncSubs.js';

const ALL_SCENES = [
  // Canvas — backgrounds & effects
  auroraGradient, fluidBackground, neonGrid, vignette,
  starfield, particleFlow, circleRipple, meshGrid,
  pulseWave, radialBurst, confetti, waveform,
  // DOM — text & layout
  headline, bulletList, quoteBlock, codeBlock,
  lowerThird, numberCounter, splitText, subtitleBar,
  progressBar, calloutCard, typewriter, marquee,
  featureGrid, card3d, parallaxStack, logoReveal,
  slideFrame, dimToolsSlide,
  // SVG — data viz & decoration
  barChart, lineChart, pieChart, progressRing,
  svgRings, radarChart, horizontalBars, treeMap,
  timelineViz, flowChart, agentLoop,
  // Media + Audio
  imageHero, videoClip, audioTrack, syncSubs,
  // WebGL — GPU shader effects
  shaderGradient, shaderNoise, shaderGlitch, shaderChromatic,
  shaderPlasma, shaderTunnel, shaderRipple, shaderFirefly,
];

// Map: id → scene object
export const SCENE_REGISTRY = {};
for (const scene of ALL_SCENES) {
  SCENE_REGISTRY[scene.id] = scene;
}

export default SCENE_REGISTRY;
