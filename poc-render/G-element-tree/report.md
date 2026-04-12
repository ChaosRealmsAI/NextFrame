# G-element-tree Report

## Result

- Output file: `frame_t5.png`
- Verified format: PNG, 1920x1080 RGBA
- Render command run: `npm install && node index.js`
- Explicit time-arg command also verified: `node index.js 5.0`
- Sample hit-test results:
  - `(1500, 480) -> circle_1`
  - `(1220, 650) -> circle_2`
  - `(290, 200) -> title`
  - `(40, 40) -> bg`

## Timing

- `node index.js` render + PNG encode: `39.691 ms`
- `node index.js 5.0` render + PNG encode: `37.868 ms`

## LOC

- Total source LOC in this POC: `442`
  - `sceneModel.js`: `257`
  - `sampleScene.js`: `77`
  - `index.js`: `59`
  - `framePureComparison.js`: `37`
  - `package.json`: `12`

### LOC vs frame-pure function

For this exact static slide, the scene-as-data version is more verbose than a direct frame-pure draw function:

- Tree scene authoring file (`sampleScene.js`): `75` LOC from `buildSampleScene()` through the returned tree
- Equivalent direct canvas function (`framePureComparison.js`): `35` LOC from `drawProductLaunchSlideDirect()` through the last draw call

So for a small, fixed slide, the tree form costs about `2.1x` more authoring lines. The trade is that the extra lines buy stable IDs, structured transforms, reusable traversal, and hit-testing that the frame-pure version does not get for free.

## Direct Manipulation

Direct manipulation is naturally easier with the tree model.

- Dragging `circle_2` is just "find node by id, update `x`/`y`, re-render".
- Dragging text is the same shape of operation: update the `title` or `subtitle` node rather than rewriting imperative canvas commands.
- Hit-testing also composes with nesting and viewport transforms because the same transform stack used for rendering is inverted for picking.

With a frame-pure function, the scene exists only as instructions. To support dragging, you first have to recover which draw call produced which pixels, then build a parallel structure for IDs, bounds, and transforms anyway. In practice, that means the imperative version often grows a shadow scene graph once editing is needed.

## Animation

For "circle 1 fades in over 0.5s", I would keep the tree as static scene data plus declarative animated properties, for example:

```json
{
  "id": "circle_1",
  "type": "circle",
  "x": 0,
  "y": 0,
  "r": 170,
  "fill": "#ff6b6b",
  "opacity": 0,
  "animations": [
    {
      "property": "opacity",
      "from": 0,
      "to": 1,
      "start": 0,
      "duration": 0.5,
      "easing": "easeOutCubic"
    }
  ]
}
```

Then a small evaluation step turns `(tree, t)` into a resolved render tree before drawing. That keeps editing/hit-testing anchored to stable element IDs while still allowing time-based behavior.

## Setup

```bash
npm install
node index.js
node index.js 5.0
```

## Gotchas

- Text hit-testing is geometric but approximate. It uses measured text width plus font-size-derived height rather than glyph-perfect outlines.
- The renderer currently supports `group`, `rect`, `circle`, and `text`, plus affine transforms and opacity. It does not yet cover clipping, strokes, images, or blend modes.
- Because there is no separate pick buffer, any uncovered point still resolves to `bg`, which is expected for a full-canvas background rect.
