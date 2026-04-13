/**
 * NextFrame Engine v2 — frame rendering and layer mutation
 */

function setIfChanged(el, prop, value) {
  if (el._nfPrev?.[prop] !== value) {
    el.style[prop] = value;
    (el._nfPrev = el._nfPrev || {})[prop] = value;
  }
}

function renderLayerFrame(state, t, duration) {
  const { layer, scene, container, sceneContainer } = state;
  const start = layer.start || 0;
  const dur = layer.dur || duration;
  const localT = t - start;
  const active = t >= start && t < start + dur;

  if (active) {
    if (!state.created && scene) {
      state.sceneEls = scene.create(sceneContainer, layer.params || {});
      state.created = true;
    }

    setIfChanged(container, 'display', 'block');

    if (scene && state.sceneEls != null) {
      const sceneT = scene.type === 'dom' ? (dur > 0 ? (localT / dur) : 0) : localT;
      scene.update(state.sceneEls, sceneT, layer.params || {});
    }

    const enter = calcEnterEffect(state.enterEffect, localT);
    const exit = calcExitEffect(state.exitEffect, localT, dur);

    let transOpacity = 1;
    let transTransform = '';
    let transClipPath = '';
    if (state.transition && localT < state.transition.dur) {
      const tp = clamp01(localT / state.transition.dur);
      const ts = calcTransitionStyle(state.transition, tp);
      if (ts.opacity != null) transOpacity = ts.opacity;
      if (ts.transform) transTransform = ts.transform;
      if (ts.clipPath) transClipPath = ts.clipPath;
    }

    const kOpacity = resolveLayerProp(layer, 'opacity', localT, 1);
    const kRotation = resolveLayerProp(layer, 'rotation', localT, 0);
    const kScale = resolveLayerProp(layer, 'scale', localT, null);
    const kX = resolveLayerProp(layer, 'x', localT, null);
    const kY = resolveLayerProp(layer, 'y', localT, null);
    const kW = resolveLayerProp(layer, 'w', localT, null);
    const kH = resolveLayerProp(layer, 'h', localT, null);
    const kFilter = resolveLayerProp(layer, 'filter', localT, null);
    const kClipPath = resolveLayerProp(layer, 'clipPath', localT, null);

    const opacity = enter.opacity * exit.opacity * transOpacity * kOpacity;
    const userTransforms = [];
    if (kRotation) userTransforms.push(`rotate(${kRotation}deg)`);
    if (kScale) userTransforms.push(`scale(${kScale})`);
    const allTransforms = [state.anchorTransform, enter.transform, exit.transform, transTransform, ...userTransforms].filter(Boolean).join(' ');

    setIfChanged(container, 'opacity', opacity);

    if (kX != null) setIfChanged(container, 'left', typeof kX === 'number' ? kX + 'px' : kX);
    if (kY != null) setIfChanged(container, 'top', typeof kY === 'number' ? kY + 'px' : kY);
    if (kW != null) setIfChanged(container, 'width', typeof kW === 'number' ? kW + 'px' : kW);
    if (kH != null) setIfChanged(container, 'height', typeof kH === 'number' ? kH + 'px' : kH);

    if (transClipPath) {
      setIfChanged(container, 'clipPath', transClipPath);
    } else if (kClipPath && kClipPath !== 'none') {
      setIfChanged(container, 'clipPath', kClipPath);
    } else {
      setIfChanged(container, 'clipPath', '');
    }

    setIfChanged(container, 'transform', allTransforms);
    setIfChanged(container, 'mixBlendMode', layer.blend && layer.blend !== 'normal' ? layer.blend : '');

    if (kFilter && kFilter !== 'none') {
      setIfChanged(container, 'filter', kFilter);
    } else {
      setIfChanged(container, 'filter', '');
    }

    state.wasActive = true;
    return;
  }

  if (state.wasActive) {
    setIfChanged(container, 'display', 'none');
    setIfChanged(container, 'opacity', '');
    setIfChanged(container, 'transform', '');
    setIfChanged(container, 'filter', '');
    setIfChanged(container, 'clipPath', '');
    setIfChanged(container, 'mixBlendMode', '');
    state.wasActive = false;
  }
}

function createRenderFrame(layerStates, duration, resetMediaStallTimer) {
  return function renderFrame(t) {
    resetMediaStallTimer();
    for (const state of layerStates) {
      renderLayerFrame(state, t, duration);
    }
  };
}

function destroyLayerStates(layerStates) {
  for (const state of layerStates) {
    if (state.created && state.scene) {
      try {
        state.scene.destroy(state.sceneEls);
      } catch (e) {
        console.warn('[engine] scene destroy error:', e);
      }
    }
    state.container.remove();
  }
  layerStates.length = 0;
}
