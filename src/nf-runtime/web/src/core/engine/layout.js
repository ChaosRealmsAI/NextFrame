/**
 * NextFrame Engine v2 — layout, sizing, stage setup
 */

function applyLayerStyle(el, layer, state) {
  const s = el.style;
  if (layer.x != null || layer.y != null || layer.w != null || layer.h != null) {
    s.position = 'absolute';
    s.left = layer.x != null ? layer.x : '0';
    s.top = layer.y != null ? layer.y : '0';
    s.width = layer.w != null ? layer.w : '100%';
    s.height = layer.h != null ? layer.h : '100%';
  } else {
    s.position = 'absolute';
    s.inset = '0';
  }
  state.anchorTransform = layer.anchor === 'center' ? 'translate(-50%, -50%)' : '';
  if (layer.borderRadius) s.borderRadius = layer.borderRadius;
  if (layer.shadow && layer.shadow !== 'none') s.boxShadow = layer.shadow;
  if (layer.clipPath && layer.clipPath !== 'none') s.clipPath = layer.clipPath;
  if (layer.scale) s.transform = (s.transform || '') + ` scale(${layer.scale})`;
  if (layer.skew) s.transform = (s.transform || '') + ` skew(${layer.skew})`;
  if (layer.transformOrigin) s.transformOrigin = layer.transformOrigin;
  if (layer.backdropFilter) s.backdropFilter = layer.backdropFilter;
  if (layer.border) s.border = layer.border;
  if (layer.padding) s.padding = layer.padding;
  if (layer.zIndex != null) s.zIndex = layer.zIndex;
  if (layer.overflow) s.overflow = layer.overflow;
  if (layer.perspective) s.perspective = layer.perspective;
}

function timelineMetrics(timeline) {
  const project = timeline && typeof timeline.project === 'object' ? timeline.project : {};
  return {
    width: project.width || timeline.width || 1920,
    height: project.height || timeline.height || 1080,
    fps: project.fps || timeline.fps || 30,
    duration: timeline.duration || 10,
    background: timeline.background || '#05050c',
  };
}

function normalizeLayers(timeline) {
  if (Array.isArray(timeline.layers)) {
    return timeline.layers;
  }
  const tracks = Array.isArray(timeline && timeline.tracks) ? timeline.tracks : [];
  const layers = [];
  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    const track = tracks[trackIndex];
    const clips = Array.isArray(track && track.clips) ? track.clips : [];
    for (let clipIndex = 0; clipIndex < clips.length; clipIndex++) {
      const clip = clips[clipIndex];
      layers.push({
        ...clip,
        id: clip && clip.id ? clip.id : `track-${trackIndex + 1}-clip-${clipIndex + 1}`,
        kind: clip && clip.kind ? clip.kind : (track && track.kind ? track.kind : 'video'),
        trackId: track && track.id ? track.id : `track-${trackIndex + 1}`,
      });
    }
  }
  return layers;
}

function setupStage(stageEl, width, height, background) {
  stageEl.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:hidden;background:${background}`;
  stageEl.dataset.nfWidth = width;
  stageEl.dataset.nfHeight = height;
}

function createLayerStates(stageEl, layers, sceneRegistry) {
  const layerStates = [];

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const scene = sceneRegistry[layer.scene];
    const container = document.createElement('div');
    container.className = 'nf-layer';
    container.dataset.layerId = layer.id;
    container.style.cssText = `position:absolute;inset:0;z-index:${i};pointer-events:none;display:none;overflow:hidden`;

    const state = {
      layer,
      scene,
      container,
      sceneContainer: null,
      sceneEls: null,
      created: false,
      wasActive: false,
      enterEffect: parseEffect(layer.enter),
      exitEffect: parseEffect(layer.exit),
      transition: parseTransition(layer.transition),
      anchorTransform: '',
      _prevStyle: {},
    };
    container._nfPrev = state._prevStyle;
    applyLayerStyle(container, layer, state);
    stageEl.appendChild(container);

    const sceneContainer = document.createElement('div');
    sceneContainer.style.cssText = 'position:absolute;inset:0';
    container.appendChild(sceneContainer);
    state.sceneContainer = sceneContainer;
    layerStates.push(state);
  }

  return layerStates;
}
