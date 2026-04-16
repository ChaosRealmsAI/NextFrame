// 程序生成 V3 Lottie — 粒子迸发 + 涟漪 + 弹跳心形
const fs = require('fs');

const FR = 30, DUR = 75, W = 400, H = 400, CX = 200, CY = 200;

const v = k => ({ a: 0, k });
const kf = frames => ({
  a: 1,
  k: frames.map((f, i) => i < frames.length - 1
    ? { t: f.t, s: f.s, i: f.i || { x: [.4], y: [1] }, o: f.o || { x: [.6], y: [0] } }
    : { t: f.t, s: f.s })
});
const kfn = frames => ({  // multi-dim interp
  a: 1,
  k: frames.map((f, i) => i < frames.length - 1
    ? { t: f.t, s: f.s,
        i: { x: new Array(f.s.length).fill(.4), y: new Array(f.s.length).fill(1) },
        o: { x: new Array(f.s.length).fill(.6), y: new Array(f.s.length).fill(0) } }
    : { t: f.t, s: f.s })
});
const tr = (p = [0, 0], s = [100, 100], r = 0, o = 100) => ({
  ty: "tr", p: v(p), a: v([0, 0]), s: v(s), r: v(r), o: v(o), sk: v(0), sa: v(0)
});

// Heart path
const heartShape = {
  ty: "sh", ks: v({
    c: true,
    v: [[0, -30], [-70, -30], [0, 70], [70, -30]],
    i: [[30, -30], [0, -40], [-50, -35], [0, 35]],
    o: [[-30, -30], [0, 35], [50, -35], [0, -40]]
  })
};

// Layer 1: ripple ring — expands and fades
const ripple = {
  ddd: 0, ind: 1, ty: 4, nm: "ripple", sr: 1,
  ks: {
    p: v([CX, CY, 0]), a: v([0, 0, 0]),
    s: kfn([
      { t: 12, s: [40, 40, 100] },
      { t: 38, s: [400, 400, 100] }
    ]),
    r: v(0),
    o: kf([
      { t: 8,  s: [80] },
      { t: 40, s: [0] }
    ])
  },
  ao: 0,
  shapes: [{
    ty: "gr", it: [
      { ty: "el", d: 1, s: v([100, 100]), p: v([0, 0]) },
      { ty: "st", c: v([1, 0.4, 0.55, 1]), o: v(100), w: v(3), lc: 2, lj: 2, ml: 4 },
      tr()
    ]
  }],
  ip: 0, op: DUR, st: 0, bm: 0
};

// Layer 2: 8 sparkle particles bursting outward
const sparkles = [];
for (let i = 0; i < 8; i++) {
  const ang = (i / 8) * Math.PI * 2;
  const dist = 180;
  const tx = Math.cos(ang) * dist;
  const ty_ = Math.sin(ang) * dist;
  sparkles.push({
    ddd: 0, ind: 10 + i, ty: 4, nm: "sp" + i, sr: 1,
    ks: {
      p: kfn([
        { t: 14, s: [CX, CY, 0] },
        { t: 32, s: [CX + tx, CY + ty_, 0] }
      ]),
      a: v([0, 0, 0]),
      s: kfn([
        { t: 14, s: [0, 0, 100] },
        { t: 20, s: [140, 140, 100] },
        { t: 32, s: [60, 60, 100] }
      ]),
      r: v((i * 45)),
      o: kf([
        { t: 14, s: [0] },
        { t: 18, s: [100] },
        { t: 28, s: [100] },
        { t: 34, s: [0] }
      ])
    },
    ao: 0,
    shapes: [{
      ty: "gr", it: [
        // 4-pointed sparkle: plus shape
        { ty: "sh", ks: v({
          c: true,
          v: [[0, -8], [2, -2], [8, 0], [2, 2], [0, 8], [-2, 2], [-8, 0], [-2, -2]],
          i: new Array(8).fill([0, 0]),
          o: new Array(8).fill([0, 0])
        })},
        { ty: "fl", c: v([1, 0.7, 0.3, 1]), o: v(100), r: 1, bm: 0 },
        tr()
      ]
    }],
    ip: 0, op: DUR, st: 0, bm: 0
  });
}

// Layer 3: the heart with anticipation + overshoot
const heart = {
  ddd: 0, ind: 100, ty: 4, nm: "heart", sr: 1,
  ks: {
    p: v([CX, CY, 0]), a: v([0, 0, 0]),
    s: kfn([
      { t: 0,  s: [0, 0, 100] },
      { t: 6,  s: [70, 70, 100] },    // anticipation
      { t: 10, s: [85, 55, 100] },    // squash: wider than tall (impact wind-up)
      { t: 18, s: [115, 130, 100] },  // stretch: taller than wide (jump up)
      { t: 26, s: [103, 97, 100] },   // bounce back overshoot
      { t: 34, s: [98, 102, 100] },   // secondary bounce
      { t: 44, s: [100, 100, 100] }   // settle
    ]),
    r: v(0),
    o: kfn([
      { t: 0, s: [0] },
      { t: 6, s: [100] }
    ])
  },
  ao: 0,
  shapes: [{
    ty: "gr", it: [
      heartShape,
      // gradient fill: pink-red
      {
        ty: "gf", o: v(100), r: 1, bm: 0,
        g: { p: 3, k: v([
          0, 1.00, 0.35, 0.50,
          0.5, 1.00, 0.25, 0.40,
          1, 0.90, 0.15, 0.35
        ])},
        s: v([0, -70]), e: v([0, 70]),
        t: 1, h: v(0), a: v(0), nm: "gf"
      },
      tr()
    ]
  }],
  ip: 0, op: DUR, st: 0, bm: 0
};

const anim = {
  v: "5.7.0", fr: FR, ip: 0, op: DUR, w: W, h: H, nm: "v3", ddd: 0, assets: [],
  layers: [ripple, ...sparkles, heart]
};

fs.writeFileSync(__dirname + '/anim-v4.json', JSON.stringify(anim, null, 2));
console.log('wrote anim-v4.json');
