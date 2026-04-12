# C-puppeteer Report

- Render time: `883.35ms` for `node index.js 5.0`
- Total LOC: `142` across `.puppeteerrc.cjs`, `package.json`, and `index.js`
- Setup steps:
  - `npm install`
  - `node index.js 5.0`
- Output:
  - Writes `frame_t5.png` in this directory
  - Verified as a `1920x1080` PNG
- Honest gotchas:
  - Puppeteer initially collided with a broken user-level browser cache, so this POC includes `.puppeteerrc.cjs` to force a project-local Chromium download under `.cache/puppeteer`.
  - The scene file is imported into the inline page as an ES module through a `data:` module URL built from `../auroraGradient.js`, which avoids file-origin import issues in headless Chromium.
