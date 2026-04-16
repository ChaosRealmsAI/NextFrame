# nf-anim

Zero-dependency walking skeleton for NextFrame motion behaviors, shapes, scenes, and CLI.

## When To Use
- Use `nf-anim` for frame-pure SVG motion contracts that AI can inspect and fill in later.
- Use this crate when you need the file location, import path, and stub interface to already exist.

## Quick Demo
```bash
node src/nf-anim/cli/bin.js help
node src/nf-anim/cli/bin.js list behaviors --json
node -e "import('./src/nf-anim/index.js').then(m => console.log(Object.keys(m)))"
```

Every module here is a TODO stub on purpose: imports resolve, CLI runs, and no business logic is implemented yet.
