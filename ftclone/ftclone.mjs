// ftclone.mjs — faithful JS port of the EXACT glyph pipeline inside mupdf
// 1.28 wasm (FreeType 2.13 smooth rasterizer, FT_INT64 build):
//
//   outline funits --(x32 exact, ppem 1024)--> 26.6
//   FT_Outline_Transform with m = trunc(trm*64) per component (16.16),
//     each point: x' = MulFix(x, m.xx) + MulFix(y, m.xy)  [round half away]
//   FT_Outline_Translate by v = (px64, py64)  (26.6 integers)
//   ftgrays: UPSCALE<<2 (26.8), DDA conics, prod-based line walker,
//     cells (cover, area), sweep: coverage = area>>9, ~ on sign, clamp 255
//   mupdf blend per draw over white: dst = (dst*(256-(g+(g>>7))))>>8
//
// All parameters are INTEGERS in 26.6 units: em64x = trunc(emx*64) etc.
// This bypasses fz_subpixel_adjust — pens can sit on ANY 1/64 position,
// which fillText cannot do (it snaps x to 1/4 and y to 1/2).
//
// This file is a PURE LIBRARY — node:fs only, no mupdf. The certification
// (must print 0 diffs before any conclusion built on it) lives beside it:
//   npm run certify:ftclone           # ftclone/certify.mjs — vs mupdf fillText
import { loadFont } from './ttf.mjs';
import { loadCff } from './cff.mjs';

const ONE_PIXEL = 256;
const UPSCALE = x => x << 2;          // 26.6 -> 26.8
const TRUNC = x => x >> 8;
const FRACT = x => x & 255;
const INT_MIN = -2147483648;

// FT_MulFix: (a*b + 0x8000 - (ab<0)) >> 16, arithmetic shift = floor
export function mulfix(a, b) {
  const ab = a * b;                    // |ab| < 2^40 — exact in double
  return Math.floor((ab + (ab < 0 ? 0x7FFF : 0x8000)) / 65536);
}

class Raster {
  constructor(W, H) {
    this.W = W; this.H = H;
    this.rows = Array.from({ length: H }, () => new Map());  // ey -> (ex -> cell)
    this.cur = null;                   // current cell or null (dumpster)
    this.x = 0; this.y = 0;            // 26.8 current position
  }
  setCell(ex, ey) {
    if (ey < 0 || ey >= this.H || ex >= this.W) { this.cur = null; return; }
    ex = Math.max(ex, -1);
    const row = this.rows[ey];
    let c = row.get(ex);
    if (!c) { c = { x: ex, cover: 0, area: 0 }; row.set(ex, c); }
    this.cur = c;
  }
  integrate(a, b) {
    const c = this.cur;
    if (c) { c.cover += a; c.area += a * b; }
  }
  moveTo(x, y) {                       // 26.8 coords
    this.setCell(TRUNC(x), TRUNC(y));
    this.x = x; this.y = y;
  }
  // gray_render_line, FT_INT64 variant (prod walker)
  lineTo(to_x, to_y) {
    let ey1 = TRUNC(this.y), ey2 = TRUNC(to_y);
    if ((ey1 >= this.H && ey2 >= this.H) || (ey1 < 0 && ey2 < 0)) { this.x = to_x; this.y = to_y; return; }
    let ex1 = TRUNC(this.x), ex2 = TRUNC(to_x);
    let fx1 = FRACT(this.x), fy1 = FRACT(this.y);
    let fx2, fy2;
    const dx = to_x - this.x, dy = to_y - this.y;

    if (ex1 === ex2 && ey1 === ey2) { /* inside one cell */ }
    else if (dy === 0) { this.setCell(ex2, ey2); this.x = to_x; this.y = to_y; return; }
    else if (dx === 0) {
      if (dy > 0) do {
        fy2 = ONE_PIXEL;
        this.integrate(fy2 - fy1, fx1 * 2);
        fy1 = 0; ey1++;
        this.setCell(ex1, ey1);
      } while (ey1 !== ey2);
      else do {
        fy2 = 0;
        this.integrate(fy2 - fy1, fx1 * 2);
        fy1 = ONE_PIXEL; ey1--;
        this.setCell(ex1, ey1);
      } while (ey1 !== ey2);
    } else {
      let prod = dx * fy1 - dy * fx1;  // |dx|,|dy| < 2^15 — exact
      const dxr = ex1 !== ex2 ? Math.trunc(0xFFFFFFFF / dx) : 0;   // C signed div: trunc toward 0
      const dyr = ey1 !== ey2 ? Math.trunc(0xFFFFFFFF / dy) : 0;
      const udiv = (a, br) => Math.floor((a * br) / 4294967296);
      do {
        if (prod - dx * ONE_PIXEL > 0 && prod <= 0) {                    /* left */
          fx2 = 0;
          fy2 = udiv(-prod, -dxr);     // FT_UDIV(-prod, -dx): uses reciprocal of -dx
          prod -= dy * ONE_PIXEL;
          this.integrate(fy2 - fy1, fx1 + fx2);
          fx1 = ONE_PIXEL; fy1 = fy2; ex1--;
        } else if (prod - dx * ONE_PIXEL + dy * ONE_PIXEL > 0 &&
                   prod - dx * ONE_PIXEL <= 0) {                          /* up */
          prod -= dx * ONE_PIXEL;
          fx2 = udiv(-prod, dyr);
          fy2 = ONE_PIXEL;
          this.integrate(fy2 - fy1, fx1 + fx2);
          fx1 = fx2; fy1 = 0; ey1++;
        } else if (prod + dy * ONE_PIXEL >= 0 &&
                   prod - dx * ONE_PIXEL + dy * ONE_PIXEL <= 0) {         /* right */
          prod += dy * ONE_PIXEL;
          fx2 = ONE_PIXEL;
          fy2 = udiv(prod, dxr);
          this.integrate(fy2 - fy1, fx1 + fx2);
          fx1 = 0; fy1 = fy2; ex1++;
        } else {                                                          /* down */
          fx2 = udiv(prod, -dyr);
          fy2 = 0;
          prod += dx * ONE_PIXEL;
          this.integrate(fy2 - fy1, fx1 + fx2);
          fx1 = fx2; fy1 = ONE_PIXEL; ey1--;
        }
        this.setCell(ex1, ey1);
      } while (ex1 !== ex2 || ey1 !== ey2);
    }
    fx2 = FRACT(to_x); fy2 = FRACT(to_y);
    this.integrate(fy2 - fy1, fx1 + fx2);
    this.x = to_x; this.y = to_y;
  }
  // gray_render_cubic + gray_split_cubic (FT_INT64 build). controls/to in 26.6!
  cubicTo(c1x6, c1y6, c2x6, c2y6, tx6, ty6) {
    const stack = [];   // arc frames of 4 points, arc = top index
    const A = [];       // flat array of points {x,y}; arc window = A[ai..ai+3]
    for (let k = 0; k < 16 * 3 + 1; k++) A.push({ x: 0, y: 0 });
    let ai = 0;
    A[0].x = UPSCALE(tx6); A[0].y = UPSCALE(ty6);
    A[1].x = UPSCALE(c2x6); A[1].y = UPSCALE(c2y6);
    A[2].x = UPSCALE(c1x6); A[2].y = UPSCALE(c1y6);
    A[3].x = this.x; A[3].y = this.y;
    const H = this.H;
    const t0 = TRUNC(A[0].y), t1 = TRUNC(A[1].y), t2 = TRUNC(A[2].y), t3 = TRUNC(A[3].y);
    if ((t0 >= H && t1 >= H && t2 >= H && t3 >= H) || (t0 < 0 && t1 < 0 && t2 < 0 && t3 < 0)) {
      this.x = A[0].x; this.y = A[0].y; return;
    }
    const split = i => {
      let a, b, c;
      A[i + 6].x = A[i + 3].x;
      a = A[i].x + A[i + 1].x; b = A[i + 1].x + A[i + 2].x; c = A[i + 2].x + A[i + 3].x;
      A[i + 5].x = c >> 1; c += b; A[i + 4].x = c >> 2; A[i + 1].x = a >> 1;
      a += b; A[i + 2].x = a >> 2; A[i + 3].x = (a + c) >> 3;
      A[i + 6].y = A[i + 3].y;
      a = A[i].y + A[i + 1].y; b = A[i + 1].y + A[i + 2].y; c = A[i + 2].y + A[i + 3].y;
      A[i + 5].y = c >> 1; c += b; A[i + 4].y = c >> 2; A[i + 1].y = a >> 1;
      a += b; A[i + 2].y = a >> 2; A[i + 3].y = (a + c) >> 3;
    };
    for (;;) {
      if (Math.abs(2 * A[ai].x - 3 * A[ai + 1].x + A[ai + 3].x) > ONE_PIXEL / 2 ||
          Math.abs(2 * A[ai].y - 3 * A[ai + 1].y + A[ai + 3].y) > ONE_PIXEL / 2 ||
          Math.abs(A[ai].x - 3 * A[ai + 2].x + 2 * A[ai + 3].x) > ONE_PIXEL / 2 ||
          Math.abs(A[ai].y - 3 * A[ai + 2].y + 2 * A[ai + 3].y) > ONE_PIXEL / 2) {
        split(ai); ai += 3;
        if (ai + 6 >= A.length) for (let k = 0; k < 6; k++) A.push({ x: 0, y: 0 });
        continue;
      }
      this.lineTo(A[ai].x, A[ai].y);
      if (ai === 0) return;
      ai -= 3;
    }
  }
  // gray_render_conic as it stood in FreeType 2.6.5 .. 2.9.1 — uniform
  // bisection into 2^n segments driven by a decrement counter. Verbatim from
  // freetype-2.8/src/smooth/ftgrays.c.
  conicToFT28(cx6, cy6, tx6, ty6) {
    const A = [];
    for (let k = 0; k < 16 * 2 + 8; k++) A.push({ x: 0, y: 0 });
    let ai = 0;
    A[0].x = UPSCALE(tx6); A[0].y = UPSCALE(ty6);
    A[1].x = UPSCALE(cx6); A[1].y = UPSCALE(cy6);
    A[2].x = this.x; A[2].y = this.y;
    if ((TRUNC(A[0].y) >= this.H && TRUNC(A[1].y) >= this.H && TRUNC(A[2].y) >= this.H) ||
        (TRUNC(A[0].y) < 0 && TRUNC(A[1].y) < 0 && TRUNC(A[2].y) < 0)) {
      this.x = A[0].x; this.y = A[0].y; return;
    }
    let dx = Math.abs(A[2].x + A[0].x - 2 * A[1].x);
    const dy = Math.abs(A[2].y + A[0].y - 2 * A[1].y);
    if (dx < dy) dx = dy;
    let draw = 1;
    while (dx > ONE_PIXEL / 4) { dx >>= 2; draw <<= 1; }
    const div = (a, b) => Math.trunc(a / b);
    const half = (p, q) => div(p + q, 2);
    const split = i => {
      let a, b;
      A[i + 4].x = A[i + 2].x;
      b = A[i + 1].x;
      a = A[i + 3].x = half(A[i + 2].x, b);
      b = A[i + 1].x = half(A[i].x, b);
      A[i + 2].x = half(a, b);
      A[i + 4].y = A[i + 2].y;
      b = A[i + 1].y;
      a = A[i + 3].y = half(A[i + 2].y, b);
      b = A[i + 1].y = half(A[i].y, b);
      A[i + 2].y = half(a, b);
    };
    do {
      let sp = 1;
      while ((draw & sp) === 0) {
        split(ai); ai += 2; sp <<= 1;
        if (ai + 4 >= A.length) for (let k = 0; k < 6; k++) A.push({ x: 0, y: 0 });
      }
      this.lineTo(A[ai].x, A[ai].y);
      ai -= 2;
    } while (--draw);
  }
  // gray_render_conic as it stood in FreeType <= 2.4.x (the 2007..2011
  // vintage). Verbatim from freetype-2.4.0/src/smooth/ftgrays.c.
  //
  // The structural difference that matters at text sizes: EVERY leaf here
  // draws TWO lines — the true midpoint, then the endpoint — where 2.6.1 and
  // the modern DDA draw ONE chord as soon as the arc is flat enough. One chord
  // cuts inside the curve; two sit rounder. At em64 786 the modern rule almost
  // never subdivides at all, so this is the only era with real leverage.
  //
  // conicLevel: FreeType sets ras.conic_level = 32 and doubles it once the
  // bitmap exceeds 24 px on a side. A producer rasterizing one glyph gets a
  // glyph-sized bitmap (~8..13 px here), so 32 is the value that models it —
  // NOT the 48 px scratch window ftclone happens to render into.
  conicToFT240(cx6, cy6, tx6, ty6, conicLevel = 32) {
    const DOWNSCALE = x => x >> 2;
    const div = (a, b) => Math.trunc(a / b);
    let dx = Math.abs(DOWNSCALE(this.x) + tx6 - 2 * cx6);
    const dy = Math.abs(DOWNSCALE(this.y) + ty6 - 2 * cy6);
    if (dx < dy) dx = dy;
    let level = 1;
    dx = div(dx, conicLevel);
    while (dx > 0) { dx >>= 2; level++; }

    const drawLeaf = (toX, toY, cX, cY) => {
      this.lineTo(div(this.x + toX + 2 * cX, 4), div(this.y + toY + 2 * cY, 4));
      this.lineTo(toX, toY);
    };
    if (level <= 1) { drawLeaf(UPSCALE(tx6), UPSCALE(ty6), UPSCALE(cx6), UPSCALE(cy6)); return; }

    const A = [];
    for (let k = 0; k < 32 * 2 + 5; k++) A.push({ x: 0, y: 0 });
    A[0].x = UPSCALE(tx6); A[0].y = UPSCALE(ty6);
    A[1].x = UPSCALE(cx6); A[1].y = UPSCALE(cy6);
    A[2].x = this.x; A[2].y = this.y;
    const levels = new Int32Array(64);
    levels[0] = level;
    let top = 0, ai = 0;
    const half = (p, q) => div(p + q, 2);
    const split = i => {
      let a, b;
      A[i + 4].x = A[i + 2].x;
      b = A[i + 1].x;
      a = A[i + 3].x = half(A[i + 2].x, b);
      b = A[i + 1].x = half(A[i].x, b);
      A[i + 2].x = half(a, b);
      A[i + 4].y = A[i + 2].y;
      b = A[i + 1].y;
      a = A[i + 3].y = half(A[i + 2].y, b);
      b = A[i + 1].y = half(A[i].y, b);
      A[i + 2].y = half(a, b);
    };
    while (top >= 0) {
      const lv = levels[top];
      if (lv > 1) {
        let min = A[ai].y, max = A[ai].y;
        for (const k of [1, 2]) { const y = A[ai + k].y; if (y < min) min = y; if (y > max) max = y; }
        if (!(TRUNC(min) >= this.H || TRUNC(max) < 0)) {
          split(ai); ai += 2; top++;
          levels[top] = levels[top - 1] = lv - 1;
          if (ai + 4 >= A.length) for (let k = 0; k < 6; k++) A.push({ x: 0, y: 0 });
          continue;
        }
      }
      drawLeaf(A[ai].x, A[ai].y, A[ai + 1].x, A[ai + 1].y);
      top--; ai -= 2;
    }
  }
  // gray_render_conic as it stood in FreeType 2.4.12 .. 2.6.2 — RECURSIVE
  // midpoint subdivision, not the DDA below. Verbatim from
  // freetype-2.6.1/src/smooth/ftgrays.c, PIXEL_BITS 8 / ONE_PIXEL 256, the
  // same context ftclone renders in. Straight and diagonal segments never
  // reach this function, which is why they are the built-in control.
  conicToFT261(cx6, cy6, tx6, ty6) {
    const A = [];
    for (let k = 0; k < 32 * 2 + 5; k++) A.push({ x: 0, y: 0 });
    let ai = 0;
    A[0].x = UPSCALE(tx6); A[0].y = UPSCALE(ty6);
    A[1].x = UPSCALE(cx6); A[1].y = UPSCALE(cy6);
    A[2].x = this.x; A[2].y = this.y;
    const levels = new Int32Array(64);
    let top = 0;

    let dx = Math.abs(A[2].x + A[0].x - 2 * A[1].x);
    const dy = Math.abs(A[2].y + A[0].y - 2 * A[1].y);
    if (dx < dy) dx = dy;

    let draw = false;
    if (dx < ONE_PIXEL / 4) draw = true;
    else {
      // short-cut the arc that crosses the current band
      let min = A[0].y, max = A[0].y;
      for (const k of [1, 2]) { const y = A[k].y; if (y < min) min = y; if (y > max) max = y; }
      if (TRUNC(min) >= this.H || TRUNC(max) < 0) draw = true;
    }

    // gray_split_conic — C integer division truncates toward zero
    const half = (p, q) => Math.trunc((p + q) / 2);
    const split = i => {
      let a, b;
      A[i + 4].x = A[i + 2].x;
      b = A[i + 1].x;
      a = A[i + 3].x = half(A[i + 2].x, b);
      b = A[i + 1].x = half(A[i].x, b);
      A[i + 2].x = half(a, b);
      A[i + 4].y = A[i + 2].y;
      b = A[i + 1].y;
      a = A[i + 3].y = half(A[i + 2].y, b);
      b = A[i + 1].y = half(A[i].y, b);
      A[i + 2].y = half(a, b);
    };

    if (!draw) {
      let level = 0;
      do { dx >>= 2; level++; } while (dx > ONE_PIXEL / 4);
      levels[0] = level;
    }
    for (;;) {
      if (!draw && levels[top] > 0) {
        const level = levels[top];
        split(ai); ai += 2; top++;
        levels[top] = levels[top - 1] = level - 1;
        if (ai + 4 >= A.length) for (let k = 0; k < 6; k++) A.push({ x: 0, y: 0 });
        continue;
      }
      draw = false;
      this.lineTo(A[ai].x, A[ai].y);
      top--; ai -= 2;
      if (top < 0) return;
    }
  }
  // gray_render_conic, DDA (FT_INT64) variant. control/to in 26.6!
  conicTo(cx6, cy6, tx6, ty6) {
    const p0x = this.x, p0y = this.y;
    const p1x = UPSCALE(cx6), p1y = UPSCALE(cy6);
    const p2x = UPSCALE(tx6), p2y = UPSCALE(ty6);
    if ((TRUNC(p0y) >= this.H && TRUNC(p1y) >= this.H && TRUNC(p2y) >= this.H) ||
        (TRUNC(p0y) < 0 && TRUNC(p1y) < 0 && TRUNC(p2y) < 0)) {
      this.x = p2x; this.y = p2y; return;
    }
    const bx = p1x - p0x, by = p1y - p0y;
    const ax = p2x - p1x - bx, ay = p2y - p1y - by;
    let dx = Math.abs(ax), dyv = Math.abs(ay);
    if (dx < dyv) dx = dyv;
    if (dx <= ONE_PIXEL / 4) { this.lineTo(p2x, p2y); return; }
    let shift = 16;
    do { dx >>= 2; shift--; } while (dx > ONE_PIXEL / 4);
    let count = 0x10000 >>> shift;

    const P32 = 4294967296;
    let rx = ax * 2 ** (shift + shift), ry = ay * 2 ** (shift + shift);
    let qx = bx * 2 ** (shift + 17) + rx, qy = by * 2 ** (shift + 17) + ry;
    rx *= 2; ry *= 2;
    let px = p0x * P32, py = p0y * P32;
    do {
      px += qx; py += qy;
      qx += rx; qy += ry;
      this.lineTo(Math.floor(px / P32), Math.floor(py / P32));
    } while (--count);
  }
  // gray_sweep, nonzero rule (fill = INT_MIN) — writes coverage into out
  sweep(out) {
    for (let y = 0; y < this.H; y++) {
      const cells = [...this.rows[y].values()].sort((a, b) => a.x - b.x);
      if (!cells.length) continue;
      let x = 0, cover = 0, coverage;
      const fillRule = area => {
        let c = area >> 9;                       // PIXEL_BITS*2+1-8
        if (c & INT_MIN) c = ~c;
        if (c > 255) c = 255;
        return c;
      };
      for (const cell of cells) {
        if (cover !== 0 && cell.x > x) {
          coverage = fillRule(cover);
          for (let i = x; i < cell.x; i++) out[y * this.W + i] = coverage;
        }
        cover += cell.cover * (ONE_PIXEL * 2);
        const area = cover - cell.area;
        if (area !== 0 && cell.x >= 0) {
          coverage = fillRule(area);
          out[y * this.W + cell.x] = coverage & 255;
        }
        x = cell.x + 1;
      }
      if (cover !== 0) {
        coverage = fillRule(cover);
        for (let i = x; i < this.W; i++) out[y * this.W + i] = coverage;
      }
    }
  }
}

// FT_DivFix: ((a<<16)/b) with C truncation
export function divfix(a, b) {
  return Math.trunc((a * 65536) / b);
}

export class FTClone {
  constructor(fontPath, W = 40, H = 40) {
    this.W = W; this.H = H;
    if (fontPath.endsWith('.cff')) {
      this.cff = loadCff(fontPath);
      this.upm = this.cff.unitsPerEm;
      this.gidMap = null;              // set via setGidMap (cp -> gid)
    } else {
      this.ttf = loadFont(fontPath);
      this.upm = this.ttf.unitsPerEm;
    }
    // FT loads at char size 65536/64 = 1024pt @72dpi: scale16.16 = DivFix(65536, upm)
    this.scale16 = divfix(65536, this.upm);
    this.cache = new Map();
    // OUTLINE-POINT QUANTUM, in 26.6 units, 0 = off and 0 IS THE DEFAULT — this
    // changes nothing unless a caller asks for it, and certify.mjs proves that.
    // FreeType carries transformed points in 26.6, i.e. an implicit quantum of
    // 1 unit; a producer whose transform pipeline held them coarser (1/16 or
    // 1/8 px rather than 1/64) perturbs each glyph's SHAPE by an amount keyed to
    // the sub-pixel pen position, so it differs line to line. That is the last
    // per-line-rasterization mechanism the page's residual still admits, and
    // monospace-lab/resample-fit.mjs --outq is what measures it.
    this.outQ64 = 0;
    // Which era's gray_render_conic to walk. 'dda' is FreeType 2.10+, the one
    // certify.mjs proves against mupdf 1.28 — the default, always. 'ft261' is
    // the 2.4.12..2.6.2 recursive-subdivision rule, for producers older than
    // that certification. Straight and diagonal segments bypass both.
    this.conicEra = 'dda';
  }
  setGidMap(map) { this.gidMap = map; }
  // coverage buffer for glyph cp at matrix [em64x,0,0,-em64y]/64 pen (px64,py64)/64
  coverage(cp, em64x, em64y, px64, py64) {
    const key = `${cp}|${em64x}|${em64y}|${px64}|${py64}|${this.outQ64}`;
    let cov = this.cache.get(key);
    if (cov) return cov;
    const R = new Raster(this.W, this.H);
    // funits -> 26.6 at ppem 1024 via MulFix(u, scale16) (exact x32 for upm
    // 2048), then FT_Outline_Transform m=(em64x,-em64y) 16.16, then +v.
    const pre = u => mulfix(u, this.scale16);
    const TX = u => mulfix(pre(u), em64x) + px64;
    const TY = v => mulfix(pre(v), -em64y) + py64;
    if (this.cff) {
      const gid = this.gidMap ? this.gidMap.get(cp) : cp;
      const contours = this.cff.outline(gid);
      if (!contours) return null;
      for (const { start, segs } of contours) {
        const sx = TX(start[0]), sy = TY(start[1]);
        R.moveTo(UPSCALE(sx), UPSCALE(sy));
        for (const s of segs) {
          if (s.c1) R.cubicTo(TX(s.c1[0]), TY(s.c1[1]), TX(s.c2[0]), TY(s.c2[1]), TX(s.to[0]), TY(s.to[1]));
          else R.lineTo(UPSCALE(TX(s.to[0])), UPSCALE(TY(s.to[1])));
        }
        R.lineTo(UPSCALE(sx), UPSCALE(sy));   // decompose closes every contour
      }
      cov = new Uint8Array(this.W * this.H);
      R.sweep(cov);
      this.cache.set(key, cov);
      return cov;
    }
    const o = this.ttf.rawOutline(cp);
    if (!o) return null;
    // Implicit conic midpoints are (a+b)/2 with C truncation, computed in 26.6.
    const half = (a, b) => Math.trunc((a + b) / 2);
    for (const raw of o.contours) {
      if (raw.length < 2) continue;
      // em64 may be fractional in 1/32 steps (16.16 scale granularity for
      // upm 2048): mulfix(p*32, em64) === mulfix(p, em64*32) for integers,
      // so this is a no-op for every integer em64 (certification holds).
      // The quantum is applied AFTER the pen translate, which is what makes it a
      // per-line effect: the same outline lands on different sub-quantum
      // fractions on every line, so every line's SHAPE differs a little. On-curve
      // and control points alike, since a transform pipeline would carry both.
      const Q = this.outQ64;
      const qz = Q ? v => Math.round(v / Q) * Q : v => v;
      const pts = raw.map(p => ({
        x: qz(mulfix(p.x, Math.round(em64x * 32)) + px64),
        y: qz(mulfix(p.y, -Math.round(em64y * 32)) + py64),
        on: p.on,
      }));
      let limit = pts.length - 1;
      let vStart = pts[0], vLast = pts[limit];
      let i = 0;
      if (!pts[0].on) {
        if (pts[limit].on) { vStart = vLast; limit--; }
        else {
          vStart = { x: half(vStart.x, vLast.x), y: half(vStart.y, vLast.y), on: true };
          vLast = vStart;
        }
        i--;
      }
      R.moveTo(UPSCALE(vStart.x), UPSCALE(vStart.y));
      const CL = this.conicLevel ?? 32;
      const CONIC = this.conicEra === 'ft261' ? (a, b, c, d) => R.conicToFT261(a, b, c, d)
        : this.conicEra === 'ft28' ? (a, b, c, d) => R.conicToFT28(a, b, c, d)
        : this.conicEra === 'ft240' ? (a, b, c, d) => R.conicToFT240(a, b, c, d, CL)
        : (a, b, c, d) => R.conicTo(a, b, c, d);
      let closedByConic = false;
      while (i < limit) {
        i++;
        if (pts[i].on) { R.lineTo(UPSCALE(pts[i].x), UPSCALE(pts[i].y)); continue; }
        let vControl = pts[i];
        let done = false;
        while (i < limit) {
          i++;
          const vec = pts[i];
          if (vec.on) { CONIC(vControl.x, vControl.y, vec.x, vec.y); done = true; break; }
          const vMiddle = { x: half(vControl.x, vec.x), y: half(vControl.y, vec.y) };
          CONIC(vControl.x, vControl.y, vMiddle.x, vMiddle.y);
          vControl = vec;
        }
        if (!done) {          // ran out of points: close with conic to start
          CONIC(vControl.x, vControl.y, vStart.x, vStart.y);
          closedByConic = true;
          break;
        }
      }
      if (!closedByConic) R.lineTo(UPSCALE(vStart.x), UPSCALE(vStart.y));
    }
    cov = new Uint8Array(this.W * this.H);
    R.sweep(cov);
    this.cache.set(key, cov);
    return cov;
  }
  // N draws composited with mupdf's integer blend over white
  render(cp, em64x, em64y, px64, py64, draws = 1) {
    const cov = this.coverage(cp, em64x, em64y, px64, py64);
    if (!cov) return null;
    const dst = new Uint8Array(this.W * this.H).fill(255);
    for (let d = 0; d < draws; d++)
      for (let i = 0; i < dst.length; i++) {
        const g = cov[i];
        if (g) dst[i] = (dst[i] * (256 - (g + (g >> 7)))) >> 8;
      }
    return dst;
  }
}
