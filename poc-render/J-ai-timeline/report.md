# POC J Report

## Result

- Required command: `npm install && node render.js`
- Required output: `frame_t6.png`
- Verified output: 1920x1080 PNG, `100844 bytes`
- Measured render time at `t=6`: `306.972 ms`

## LOC

- Total LOC for this POC: `621`
- Counted files: `package.json`, `auroraGradient.js`, `kineticHeadline.js`, `lowerThirdVelvet.js`, `SCENE_MANIFEST.json`, `prompt.md`, `timeline.json`, `render.js`, `report.md`

## Setup

- Run `npm install`
- Run `node render.js`
- Optional sanity check for the lower-third portion: `node render.js 10`

## Gotchas

- `kineticHeadline` is a full-frame scene, not a pure overlay. That means a timeline author needs composition semantics, not just scene schemas, to know whether it should replace the background or layer over it.
- `lowerThirdVelvet` is an overlay scene. A model needs to understand that it should usually be paired with some active background clip underneath.
- The manifest tells the model valid params and defaults, but it does not define a timeline JSON schema by itself. I had to choose clip fields like `start`, `duration`, `layer`, and `sceneId`.

## Is The Manifest Sufficient?

Short answer: useful, but not sufficient by itself.

Claude/GPT could probably produce a *meaningful first-pass* timeline from this manifest alone for a simple prompt like this one, because:

- the scene names are descriptive
- the parameter names are readable
- defaults and ranges constrain obviously bad values
- `duration_hint` gives rough editorial guidance

But manifest alone is not enough for *reliable* timeline authoring. To make this robust, the LLM also needs:

- an explicit timeline schema
- layer/compositing rules
- whether a scene is full-frame background vs overlay
- a couple of example prompt-to-timeline pairs
- optional style guidance for mapping vague phrases like "tech product launch" into hue, text length, and pacing choices

Verdict: the manifest is sufficient for a demo POC and for hand-held LLM prompting, but not sufficient as the only contract if you want consistent production-quality timeline generation.
