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
import terminalCode from './terminalCode.js';
import chipGroup from './chipGroup.js';
import infoCard from './infoCard.js';
import bigNumber from './bigNumber.js';
import slideChrome from './slideChrome.js';
// WebGL shader scenes
import shaderGradient from './shaderGradient.js';
import shaderNoise from './shaderNoise.js';
import shaderGlitch from './shaderGlitch.js';
import shaderChromatic from './shaderChromatic.js';
import shaderPlasma from './shaderPlasma.js';
import shaderTunnel from './shaderTunnel.js';
import shaderRipple from './shaderRipple.js';
import shaderFirefly from './shaderFirefly.js';
// WebGL shader scenes — advanced
import shaderFire from './shaderFire.js';
import shaderOcean from './shaderOcean.js';
import shaderClouds from './shaderClouds.js';
import shaderFractal from './shaderFractal.js';
// WebGL shader scenes — ShaderToy-grade
import shaderNebula from './shaderNebula.js';
import shaderAurora2 from './shaderAurora2.js';
import shaderFluid from './shaderFluid.js';
import shaderKaleidoscope from './shaderKaleidoscope.js';
// Media + Audio
import audioTrack from './audioTrack.js';
import syncSubs from './syncSubs.js';
// Custom — Spectrum Waterfall
import spectrumFall from './spectrumFall.js';
// New v2 scenes
import lucideIcon from './lucideIcon.js';
import handDraw from './handDraw.js';
import particleSystem from './particleSystem.js';
import morphShape from './morphShape.js';
import gradientText from './gradientText.js';
import dataTable from './dataTable.js';
// New v2 scenes — batch 2
import codeTyping from './codeTyping.js';
import compareSlider from './compareSlider.js';
import textReveal from './textReveal.js';
import timeline3D from './timeline3D.js';
import colorPalette from './colorPalette.js';
import iconGrid from './iconGrid.js';
// New v2 scenes — batch 3
import scatterPlot from './scatterPlot.js';
import donutChart from './donutChart.js';
import gaugeChart from './gaugeChart.js';
import sankeyDiagram from './sankeyDiagram.js';
import wordCloud from './wordCloud.js';
import matrixRain from './matrixRain.js';
import glowButton from './glowButton.js';
import statsRow from './statsRow.js';
import quoteCarousel from './quoteCarousel.js';
import gridPattern from './gridPattern.js';

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
  terminalCode, chipGroup, infoCard, bigNumber, slideChrome,
  // SVG — data viz & decoration
  barChart, lineChart, pieChart, progressRing,
  svgRings, radarChart, horizontalBars, treeMap,
  timelineViz, flowChart, agentLoop,
  // Media + Audio
  imageHero, videoClip, audioTrack, syncSubs,
  // WebGL — GPU shader effects
  shaderGradient, shaderNoise, shaderGlitch, shaderChromatic,
  shaderPlasma, shaderTunnel, shaderRipple, shaderFirefly,
  shaderFire, shaderOcean, shaderClouds, shaderFractal,
  shaderNebula, shaderAurora2, shaderFluid, shaderKaleidoscope,
  // Custom scenes
  spectrumFall,
  // New v2 scenes
  lucideIcon, handDraw, particleSystem, morphShape, gradientText, dataTable,
  // New v2 scenes — batch 2
  codeTyping, compareSlider, textReveal, timeline3D, colorPalette, iconGrid,
  // New v2 scenes — batch 3
  scatterPlot, donutChart, gaugeChart, sankeyDiagram, wordCloud,
  matrixRain, glowButton, statsRow, quoteCarousel, gridPattern,
];

// Map: id → scene object
export const SCENE_REGISTRY = {};
for (const scene of ALL_SCENES) {
  SCENE_REGISTRY[scene.id] = scene;
}

export default SCENE_REGISTRY;
