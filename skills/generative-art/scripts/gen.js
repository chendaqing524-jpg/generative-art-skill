// Seeded flow-field generator for the generative-art skill.
// Five rules:
//   1. a new seed gives a new image in the same series
//   2. the same seed, code and parameters give the same image
//   3. colors are picked from a weighted palette
//   4. lines walk the field `step` px at a time and keep `gap` px from other lines (occupancy grid)
//   5. classes are drawn largest first, so small lines fill the gaps
// Usage: GenArt.draw(canvas, { seed, classes, pal, ... }) -> number of lines drawn
(function () {
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // FNV-1a: turns any string (user id, ticket number) into a stable 32-bit seed.
  function seedFrom(str) {
    let h = 0x811c9dc5;
    const s = String(str);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  // Default palette: muted print colors for a dark ground. [color, weight]
  const PALETTE = [
    ['#EDE6DA', 30],
    ['#E2583E', 18],
    ['#2F5BEA', 18],
    ['#E9A23B', 14],
    ['#8DB596', 10],
    ['#F2A7B8', 10]
  ];

  function pick(r, pal) {
    const total = pal.reduce((s, p) => s + p[1], 0);
    let x = r() * total;
    for (const [c, w] of pal) { if ((x -= w) < 0) return c; }
    return pal[pal.length - 1][0];
  }

  function field(seed, w, h, o) {
    const r = mulberry32(seed * 7919 + 13);
    const n = o.fieldComponents || 3;
    const [f0, f1] = o.fieldFreq || [0.3, 1.2];
    const [a0, a1] = o.fieldAmp || [0.3, 0.75];
    const comps = [];
    for (let i = 0; i < n; i++) {
      comps.push({ fx: (f0 + r() * (f1 - f0)) / w, fy: (f0 + r() * (f1 - f0)) / h, px: r() * 6.283, py: r() * 6.283, a: a0 + r() * (a1 - a0) });
    }
    const base = r() * 6.283;
    return (x, y) => {
      let v = base;
      for (const c of comps) v += c.a * Math.sin(x * c.fx * 6.283 + c.px) * Math.cos(y * c.fy * 6.283 + c.py);
      return v;
    };
  }

  function draw(canvas, opt) {
    const {
      seed = 7, classes, step = 4, gap = 5, cell = 4, bg = '#121212', pal = PALETTE,
      stages = 99, scale = 2, center = 0, stepsLimit = 0
    } = opt;
    if (!classes || !classes.length) throw new Error('GenArt.draw: classes is required, largest first');
    const W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    const r = mulberry32(seed);
    const ang = field(seed, W, H, opt);
    const gw = Math.ceil(W / cell), gh = Math.ceil(H / cell);
    const grid = new Int32Array(gw * gh);
    let id = 0;

    // Rule 4: a point is blocked if it leaves the canvas or comes within `rad` of another line.
    const blocked = (x, y, rad) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return true;
      const gx = Math.floor(x / cell), gy = Math.floor(y / cell), rc = Math.ceil(rad / cell);
      const lim = rad * rad;
      for (let j = -rc; j <= rc; j++) for (let i = -rc; i <= rc; i++) {
        const X = gx + i, Y = gy + j;
        if (X < 0 || Y < 0 || X >= gw || Y >= gh) continue;
        if ((i * i + j * j) * cell * cell > lim) continue;
        if (grid[Y * gw + X]) return true;
      }
      return false;
    };
    const mark = (pts, w, lineId) => {
      const rad = w / 2, rc = Math.ceil(rad / cell), lim = (rad + cell / 2) * (rad + cell / 2);
      for (const [x, y] of pts) {
        const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
        for (let j = -rc; j <= rc; j++) for (let i = -rc; i <= rc; i++) {
          const X = gx + i, Y = gy + j;
          if (X < 0 || Y < 0 || X >= gw || Y >= gh) continue;
          if ((i * i + j * j) * cell * cell > lim) continue;
          grid[Y * gw + X] = lineId;
        }
      }
    };

    // Rule 5: classes in order, largest first. Randomness is consumed the same way for every
    // class even when `stages` skips drawing it, so stage 1, 2, 3 renders line up exactly.
    classes.forEach((cls, stage) => {
      for (let k = 0; k < cls.tries; k++) {
        const w = cls.widths[Math.floor(r() * cls.widths.length)];
        const color = pick(r, pal); // rule 3
        let sx, sy;
        if (center) { const a = r() * 6.283, d = Math.sqrt(r()) * center; sx = W / 2 + Math.cos(a) * d; sy = H / 2 + Math.sin(a) * d; }
        else { sx = r() * W; sy = r() * H; }
        if (stage >= stages) continue;
        const rad = w / 2 + gap;
        if (blocked(sx, sy, rad)) continue;
        const maxSteps = stepsLimit || cls.maxSteps || 160;
        const walk = (dir) => {
          const pts = []; let x = sx, y = sy;
          for (let s = 0; s < maxSteps; s++) {
            const a = ang(x, y);
            x += Math.cos(a) * step * dir; y += Math.sin(a) * step * dir;
            if (blocked(x, y, rad)) break;
            pts.push([x, y]);
          }
          return pts;
        };
        const fwd = walk(1), back = walk(-1);
        const pts = back.reverse().concat([[sx, sy]], fwd);
        if ((pts.length - 1) * step < (stepsLimit ? 0 : (cls.minLen || 0))) continue;
        id++;
        mark(pts, w, id);
        ctx.strokeStyle = color; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        if (pts.length === 1) ctx.lineTo(pts[0][0] + 0.01, pts[0][1]);
        for (let p = 1; p < pts.length; p++) ctx.lineTo(pts[p][0], pts[p][1]);
        ctx.stroke();
      }
    });
    return id;
  }

  window.GenArt = { draw, seedFrom, PALETTE, mulberry32 };
})();
