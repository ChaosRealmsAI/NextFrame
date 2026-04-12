# B-node-canvas Report

- Render time: 402.61 ms for `node index.js 5.0`
- Total LOC: 77 (`index.js` + `package.json`)
- Setup:
  - `npm install`
  - `node index.js 5.0`
- Output verification:
  - `frame_t5.png` exists
  - PNG dimensions are `1920x1080`
  - File size is `767397` bytes
- Gotchas:
  - `../auroraGradient.js` is authored as ESM, but it lives outside this POC package boundary, so plain `import()` may not always be treated as ESM by Node. The script tries a direct dynamic import first and falls back to importing the file contents through an ESM `data:` URL.
  - The grain pass is the main render cost because it fills the full frame in a dense loop.
