// Pure procedural texture painters (no DOM / three.js) so they can run in workers.

export function mulberry(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashName(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return h >>> 0
}

const smooth = t => t * t * (3 - 2 * t)
export const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v)
const mix = (a, b, t) => a + (b - a) * t

// Tileable value noise, fractal, returning 0..1
export function fbmTile(S, period, octaves, seed, sx = 1, sy = 1) {
  const out = new Float32Array(S * S)
  const x0s = new Int32Array(S)
  const x1s = new Int32Array(S)
  const txs = new Float32Array(S)
  let amp = 1
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    const Px = Math.max(1, Math.round(period * sx * 2 ** o))
    const Py = Math.max(1, Math.round(period * sy * 2 ** o))
    const rnd = mulberry(seed + o * 977)
    const lat = new Float32Array(Px * Py)
    for (let i = 0; i < lat.length; i++) lat[i] = rnd()
    for (let x = 0; x < S; x++) {
      const fx = (x / S) * Px
      const x0 = Math.floor(fx)
      x0s[x] = x0 % Px
      x1s[x] = (x0 + 1) % Px
      txs[x] = smooth(fx - x0)
    }
    for (let y = 0; y < S; y++) {
      const fy = (y / S) * Py
      const y0 = Math.floor(fy)
      const ty = smooth(fy - y0)
      const r0 = (y0 % Py) * Px
      const r1 = ((y0 + 1) % Py) * Px
      const row = y * S
      for (let x = 0; x < S; x++) {
        const a = lat[r0 + x0s[x]]
        const b = lat[r0 + x1s[x]]
        const c = lat[r1 + x0s[x]]
        const d = lat[r1 + x1s[x]]
        const tx = txs[x]
        const top = a + (b - a) * tx
        const bot = c + (d - c) * tx
        out[row + x] += amp * (top + (bot - top) * ty)
      }
    }
    norm += amp
    amp *= 0.5
  }
  const inv = 1 / norm
  for (let i = 0; i < out.length; i++) out[i] *= inv
  return out
}

// Tileable Worley noise: f1, f2 (in cell units) and a random id per cell.
export function worleyTile(S, cells, seed, jitter = 0.9) {
  const rnd = mulberry(seed)
  const px = new Float32Array(cells * cells)
  const py = new Float32Array(cells * cells)
  const pid = new Float32Array(cells * cells)
  for (let i = 0; i < cells * cells; i++) {
    px[i] = 0.5 + (rnd() - 0.5) * jitter
    py[i] = 0.5 + (rnd() - 0.5) * jitter
    pid[i] = rnd()
  }
  const f1 = new Float32Array(S * S)
  const f2 = new Float32Array(S * S)
  const id = new Float32Array(S * S)
  const scale = cells / S
  for (let y = 0; y < S; y++) {
    const fy = y * scale
    const cy = Math.floor(fy)
    for (let x = 0; x < S; x++) {
      const fx = x * scale
      const cx = Math.floor(fx)
      let d1 = 99
      let d2 = 99
      let best = 0
      for (let j = -1; j <= 1; j++) {
        const gy = cy + j
        const wy = gy < 0 ? gy + cells : gy >= cells ? gy - cells : gy
        const rb = wy * cells
        for (let i = -1; i <= 1; i++) {
          const gx = cx + i
          const wx = gx < 0 ? gx + cells : gx >= cells ? gx - cells : gx
          const k = rb + wx
          const dx = gx + px[k] - fx
          const dy = gy + py[k] - fy
          const d = dx * dx + dy * dy
          if (d < d1) {
            d2 = d1
            d1 = d
            best = pid[k]
          } else if (d < d2) d2 = d
        }
      }
      const p = y * S + x
      f1[p] = Math.sqrt(d1)
      f2[p] = Math.sqrt(d2)
      id[p] = best
    }
  }
  return { f1, f2, id }
}

// Brick / block layout helper. Returns per-pixel {edge distance, block id}.
function blocks(S, rows, cols, seed, { jitterWidth = 0.3, offset = 0.5 } = {}) {
  const rnd = mulberry(seed)
  const edge = new Float32Array(S * S)
  const id = new Float32Array(S * S)
  const rowH = S / rows
  // precompute column boundaries per row (tileable because widths sum to S)
  const rowsCuts = []
  for (let r = 0; r < rows; r++) {
    const widths = []
    for (let c = 0; c < cols; c++) widths.push(1 + (rnd() - 0.5) * jitterWidth * 2)
    const total = widths.reduce((s, v) => s + v, 0)
    let acc = (r % 2) * offset * (S / cols)
    const cuts = []
    for (const w of widths) {
      cuts.push({ start: acc, w: (w / total) * S, id: rnd() })
      acc += (w / total) * S
    }
    rowsCuts.push(cuts)
  }
  for (let y = 0; y < S; y++) {
    const r = Math.floor(y / rowH)
    const vy = y - r * rowH
    const cuts = rowsCuts[r]
    for (let x = 0; x < S; x++) {
      let lx = 0
      let bid = 0
      let w = 1
      for (const cut of cuts) {
        let rel = (x - cut.start + S) % S
        if (rel < cut.w) {
          lx = rel
          bid = cut.id
          w = cut.w
          break
        }
      }
      const ex = Math.min(lx, w - lx)
      const ey = Math.min(vy, rowH - vy)
      edge[y * S + x] = Math.min(ex, ey)
      id[y * S + x] = bid
    }
  }
  return { edge, id, rowH }
}

function newBuf(S, alpha = false) {
  return { S, c: new Float32Array(S * S * 3), h: new Float32Array(S * S), a: alpha ? new Float32Array(S * S) : null, n: 2 }
}

function put(b, p, r, g, bl, h) {
  b.c[p * 3] = r
  b.c[p * 3 + 1] = g
  b.c[p * 3 + 2] = bl
  if (h !== undefined) b.h[p] = h
}

// palette helper: colour from a gradient of stops
function ramp(stops, t) {
  t = clamp01(t)
  const n = stops.length - 1
  const i = Math.min(n - 1, Math.floor(t * n))
  const f = t * n - i
  const a = stops[i]
  const b = stops[i + 1]
  return [mix(a[0], b[0], f), mix(a[1], b[1], f), mix(a[2], b[2], f)]
}

const hex = h => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]

// ---------------------------------------------------------------------------
// Painters
// ---------------------------------------------------------------------------

export const P = {}
// hide without seams, for creature skin in the atlas
P.creatureHide = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 8, 5, seed)
  const wr = fbmTile(S, 40, 3, seed + 1, 1, 0.4)
  const w = worleyTile(S, 30, seed + 2)
  for (let p = 0; p < S * S; p++) {
    const bump = clamp01(1 - w.f1[p] * 1.6)
    const v = 0.62 + (n1[p] - 0.5) * 0.35 + (wr[p] - 0.5) * 0.2 + bump * 0.08
    put(b, p, v, v * 0.96, v * 0.9, wr[p] * 0.5 + bump * 0.5)
  }
  b.n = 2.5
  return b
}

P.grass = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 4, 5, seed)
  const n2 = fbmTile(S, 32, 3, seed + 1, 1, 0.25) // streaky blades
  const w = worleyTile(S, 18, seed + 2)
  const pal = [hex(0x2b3517), hex(0x4a5a26), hex(0x6a7034), hex(0x8a8446)]
  for (let p = 0; p < S * S; p++) {
    const t = n1[p] * 0.6 + n2[p] * 0.55 - 0.1 + (w.id[p] - 0.5) * 0.15
    const [r, g, bl] = ramp(pal, t)
    const dirt = clamp01((0.36 - n1[p]) * 4)
    put(b, p, mix(r, 0.36, dirt), mix(g, 0.3, dirt), mix(bl, 0.2, dirt), n2[p] * 0.7 + n1[p] * 0.3)
  }
  b.n = 3
  return b
}

P.ash = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 3, 5, seed)
  const n2 = fbmTile(S, 64, 2, seed + 1)
  const warp = fbmTile(S, 2, 3, seed + 2)
  const pal = [hex(0x3e3832), hex(0x5a524a), hex(0x766c60), hex(0x8e8374)]
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = y * S + x
      const ripple = 0.5 + 0.5 * Math.sin(((x + y * 0.3) / S) * Math.PI * 2 * 9 + warp[p] * 9)
      const t = n1[p] * 0.7 + ripple * 0.15 + (n2[p] - 0.5) * 0.35
      const [r, g, bl] = ramp(pal, t)
      put(b, p, r, g, bl, ripple * 0.4 + n1[p] * 0.4 + n2[p] * 0.2)
    }
  b.n = 2.5
  return b
}

P.rock = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 4, 6, seed)
  const w = worleyTile(S, 7, seed + 1)
  const w2 = worleyTile(S, 22, seed + 2)
  const pal = [hex(0x3a342e), hex(0x5c544a), hex(0x7a7064), hex(0x9a8e7e)]
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = y * S + x
      const crack = clamp01((w.f2[p] - w.f1[p]) * 18)
      const crack2 = clamp01((w2.f2[p] - w2.f1[p]) * 9)
      const strata = 0.5 + 0.5 * Math.sin((y / S) * Math.PI * 2 * 6 + n1[p] * 6)
      const t = n1[p] * 0.55 + w.id[p] * 0.25 + strata * 0.15
      let [r, g, bl] = ramp(pal, t)
      const k = 0.62 + 0.38 * crack * (0.75 + 0.25 * crack2)
      put(b, p, r * k, g * k, bl * k, crack * 0.6 + crack2 * 0.15 + n1[p] * 0.35)
    }
  b.n = 4
  return b
}

P.sand = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 4, 5, seed)
  const n2 = fbmTile(S, 96, 1, seed + 1)
  const warp = fbmTile(S, 2, 2, seed + 2)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = y * S + x
      const ripple = 0.5 + 0.5 * Math.sin((x / S) * Math.PI * 2 * 12 + warp[p] * 12)
      const t = n1[p] * 0.6 + ripple * 0.2 + n2[p] * 0.2
      const [r, g, bl] = ramp([hex(0x8a7a58), hex(0xa89670), hex(0xc4b28a)], t)
      put(b, p, r, g, bl, ripple * 0.5 + n2[p] * 0.3)
    }
  b.n = 1.5
  return b
}

// wind-packed snow with drifts and a faint sparkle
P.snow = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 3, 5, seed)
  const n2 = fbmTile(S, 128, 1, seed + 1)
  const warp = fbmTile(S, 2, 2, seed + 2)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = y * S + x
      const drift = 0.5 + 0.5 * Math.sin((y / S) * Math.PI * 2 * 5 + warp[p] * 9)
      const t = n1[p] * 0.6 + drift * 0.25
      let [r, g, bl] = ramp([hex(0xaab4c4), hex(0xd4dce6), hex(0xf2f6fa)], t)
      if (n2[p] > 0.82) (r = 1), (g = 1), (bl = 1)
      put(b, p, r, g, bl, drift * 0.35 + n1[p] * 0.3)
    }
  b.n = 1
  return b
}

// a worn cart road: packed dirt, wheel ruts and scattered stones
P.road = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 4, 5, seed)
  const w = worleyTile(S, 22, seed + 1)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = y * S + x
      const rut = Math.exp(-((((x / S) * 4) % 1 - 0.5) ** 2) * 40) * 0.3
      const stone = clamp01((0.18 - (w.f1[p] || 0)) * 8)
      const t = n1[p] * 0.7 - rut + stone * 0.4
      const [r, g, bl] = ramp([hex(0x4a3e2e), hex(0x6a5a44), hex(0x857258), hex(0x9a9088)], t)
      put(b, p, r, g, bl, n1[p] * 0.5 + stone * 0.4 - rut)
    }
  b.n = 2
  return b
}

P.mud = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 3, 6, seed)
  const w = worleyTile(S, 10, seed + 1)
  for (let p = 0; p < S * S; p++) {
    const puddle = clamp01((0.42 - n1[p]) * 6)
    const [r, g, bl] = ramp([hex(0x221d14), hex(0x3a3222), hex(0x514630), hex(0x5a5a38)], n1[p] + w.id[p] * 0.15)
    put(b, p, mix(r, 0.12, puddle), mix(g, 0.13, puddle), mix(bl, 0.1, puddle), n1[p] * (1 - puddle))
  }
  b.n = 2
  return b
}

P.volcanic = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 4, 5, seed)
  const w = worleyTile(S, 9, seed + 1)
  for (let p = 0; p < S * S; p++) {
    const crack = clamp01((w.f2[p] - w.f1[p]) * 10)
    const [r, g, bl] = ramp([hex(0x1a1412), hex(0x2e2220), hex(0x46302a)], n1[p] + w.id[p] * 0.2)
    const glow = (1 - crack) * 0.35
    put(b, p, r * (0.4 + 0.6 * crack) + glow * 0.6, g * (0.4 + 0.6 * crack) + glow * 0.12, bl * (0.4 + 0.6 * crack), crack * 0.7 + n1[p] * 0.3)
  }
  b.n = 4
  return b
}

P.dirt = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 4, 5, seed)
  const w = worleyTile(S, 40, seed + 1, 1)
  for (let p = 0; p < S * S; p++) {
    const pebble = clamp01((0.28 - w.f1[p]) * 5) * (w.id[p] > 0.55 ? 1 : 0)
    const [r, g, bl] = ramp([hex(0x3a2c1e), hex(0x5a4430), hex(0x7a6248)], n1[p])
    put(b, p, mix(r, 0.52, pebble), mix(g, 0.48, pebble), mix(bl, 0.42, pebble), n1[p] * 0.5 + pebble * 0.5)
  }
  b.n = 3
  return b
}

P.cobble = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 8, 4, seed)
  const w = worleyTile(S, 8, seed + 1, 0.7)
  for (let p = 0; p < S * S; p++) {
    const edge = w.f2[p] - w.f1[p]
    const stone = smooth(clamp01(edge * 6))
    const v = 0.55 + w.id[p] * 0.25 + (n1[p] - 0.5) * 0.3
    const [r, g, bl] = ramp([hex(0x3c3630), hex(0x6e665a), hex(0x958a78)], v)
    const k = mix(0.35, 1, stone)
    put(b, p, r * k, g * k, bl * k, stone * 0.8 + n1[p] * 0.2)
  }
  b.n = 5
  return b
}

P.plaster = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 3, 6, seed)
  const streak = fbmTile(S, 24, 3, seed + 1, 1, 0.08)
  const w = worleyTile(S, 5, seed + 2)
  for (let p = 0; p < S * S; p++) {
    const crack = w.f2[p] - w.f1[p] < 0.02 && n1[p] > 0.55 ? 0.6 : 1
    const stain = clamp01((streak[p] - 0.45) * 2) * 0.25
    const t = n1[p]
    const [r, g, bl] = ramp([hex(0xa8987a), hex(0xc8b894), hex(0xdccca8)], t)
    put(b, p, (r - stain * 0.5) * crack, (g - stain * 0.5) * crack, (bl - stain * 0.55) * crack, n1[p] * 0.7 + (1 - crack) * -0.3)
  }
  b.n = 2
  return b
}

P.planks = (S, seed) => {
  const b = newBuf(S)
  const rows = 6
  const bl = blocks(S, rows, 2, seed, { jitterWidth: 0.5, offset: 0.33 })
  const grain = fbmTile(S, 3, 4, seed + 1, 0.25, 4)
  const fine = fbmTile(S, 64, 2, seed + 2, 0.2, 1)
  for (let p = 0; p < S * S; p++) {
    const seam = smooth(clamp01(bl.edge[p] / (S * 0.008)))
    const g2 = 0.5 + 0.5 * Math.sin(grain[p] * 40 + bl.id[p] * 20)
    const t = 0.35 + bl.id[p] * 0.3 + g2 * 0.2 + (fine[p] - 0.5) * 0.3
    const [r, g, b2] = ramp([hex(0x2e1e10), hex(0x5a3c22), hex(0x7a5634), hex(0x94704a)], t)
    const k = mix(0.25, 1, seam)
    put(b, p, r * k, g * k, b2 * k, seam * 0.7 + g2 * 0.3)
  }
  b.n = 3
  return b
}

P.wood = (S, seed) => {
  const b = newBuf(S)
  const grain = fbmTile(S, 3, 5, seed, 0.2, 3)
  const fine = fbmTile(S, 48, 2, seed + 1, 0.15, 1)
  for (let p = 0; p < S * S; p++) {
    const g2 = 0.5 + 0.5 * Math.sin(grain[p] * 50)
    const t = g2 * 0.45 + fine[p] * 0.4
    const [r, g, bl] = ramp([hex(0x2e1c0e), hex(0x55381e), hex(0x7a5634)], t)
    put(b, p, r, g, bl, g2 * 0.6 + fine[p] * 0.4)
  }
  b.n = 2
  return b
}

P.shingles = (S, seed) => {
  const b = newBuf(S)
  const bl = blocks(S, 10, 8, seed, { jitterWidth: 0.25 })
  const n1 = fbmTile(S, 6, 4, seed + 1)
  const rowH = S / 10
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = y * S + x
      const vy = (y % rowH) / rowH // 0 at bottom of shingle row
      const shade = 0.45 + 0.55 * vy
      const edge = smooth(clamp01(bl.edge[p] / (S * 0.006)))
      const [r, g, b2] = ramp([hex(0x3a2818), hex(0x5a4028), hex(0x6e5236)], bl.id[p] * 0.6 + n1[p] * 0.4)
      const k = shade * mix(0.4, 1, edge)
      put(b, p, r * k, g * k, b2 * k, vy * 0.8 + edge * 0.2)
    }
  b.n = 4
  return b
}

P.stoneBlocks = (S, seed, opts = {}) => {
  const b = newBuf(S)
  const bl = blocks(S, opts.rows || 6, opts.cols || 3, seed, { jitterWidth: 0.35 })
  const n1 = fbmTile(S, 6, 5, seed + 1)
  const pits = worleyTile(S, 30, seed + 2)
  const pal = opts.pal || [hex(0x5e5a52), hex(0x86807a), hex(0xa29c92)]
  for (let p = 0; p < S * S; p++) {
    const e = smooth(clamp01(bl.edge[p] / (S * 0.012)))
    const pit = clamp01((0.12 - pits.f1[p]) * 6) * 0.35
    const [r, g, b2] = ramp(pal, bl.id[p] * 0.5 + n1[p] * 0.5)
    const k = mix(0.35, 1, e) * (1 - pit)
    put(b, p, r * k, g * k, b2 * k, e * 0.7 + n1[p] * 0.3 - pit)
  }
  b.n = 5
  return b
}

P.sandstone = (S, seed) => P.stoneBlocks(S, seed, { rows: 4, cols: 2, pal: [hex(0x8a7454), hex(0xb8a07a), hex(0xd2bc94)] })
P.tombBrick = (S, seed) => P.stoneBlocks(S, seed, { rows: 8, cols: 4, pal: [hex(0x4e4a40), hex(0x726a5c), hex(0x8e8472)] })
P.daedricStone = (S, seed) => {
  const b = P.stoneBlocks(S, seed, { rows: 3, cols: 2, pal: [hex(0x241814), hex(0x3e2a24), hex(0x563a30)] })
  // carved glyph bands
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = y * S + x
      const band = Math.abs(((y / S) * 3) % 1 - 0.5) < 0.07
      const glyph = band && Math.sin((x / S) * Math.PI * 48) > 0.3 && Math.sin((y / S) * Math.PI * 96 + x * 0.02) > -0.2
      if (glyph) {
        b.c[p * 3] *= 0.4
        b.c[p * 3 + 1] *= 0.35
        b.c[p * 3 + 2] *= 0.35
        b.h[p] -= 0.4
      }
    }
  return b
}

P.floorTiles = (S, seed) => {
  const b = newBuf(S)
  const bl = blocks(S, 4, 4, seed, { jitterWidth: 0, offset: 0 })
  const n1 = fbmTile(S, 8, 5, seed + 1)
  for (let p = 0; p < S * S; p++) {
    const e = smooth(clamp01(bl.edge[p] / (S * 0.01)))
    const [r, g, b2] = ramp([hex(0x4a443a), hex(0x6a6254), hex(0x847a68)], bl.id[p] * 0.4 + n1[p] * 0.6)
    const k = mix(0.3, 1, e)
    put(b, p, r * k, g * k, b2 * k, e)
  }
  b.n = 4
  return b
}

P.chitinShell = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 4, 5, seed)
  const pits = worleyTile(S, 20, seed + 1)
  const bands = 7
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = y * S + x
      const v = ((y / S) * bands + n1[p] * 0.3) % 1
      const ridge = Math.pow(Math.sin(v * Math.PI), 0.6)
      const pit = clamp01((0.15 - pits.f1[p]) * 5)
      const [r, g, bl] = ramp([hex(0x3a200e), hex(0x7a4a24), hex(0xa06a3a), hex(0xc08a54)], ridge * 0.7 + n1[p] * 0.3)
      const k = 1 - pit * 0.35
      put(b, p, r * k, g * k, bl * k, ridge * 0.8 - pit * 0.2)
    }
  b.n = 4
  return b
}

P.mushroomCap = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 4, 5, seed)
  const fib = fbmTile(S, 64, 2, seed + 1, 1, 0.1)
  const spots = worleyTile(S, 9, seed + 2)
  for (let p = 0; p < S * S; p++) {
    const spot = spots.id[p] > 0.6 ? clamp01((0.28 - spots.f1[p]) * 8) : 0
    const [r, g, bl] = ramp([hex(0x3e2236), hex(0x6a3a58), hex(0x8e5a74)], n1[p] * 0.6 + fib[p] * 0.4)
    put(b, p, mix(r, 0.78, spot), mix(g, 0.7, spot), mix(bl, 0.62, spot), fib[p] * 0.5 + spot * 0.4)
  }
  b.n = 2.5
  return b
}

P.mushroomStalk = (S, seed) => {
  const b = newBuf(S)
  const fib = fbmTile(S, 48, 3, seed, 1, 0.08)
  const n1 = fbmTile(S, 4, 4, seed + 1)
  for (let p = 0; p < S * S; p++) {
    const [r, g, bl] = ramp([hex(0x7a6448), hex(0xa88e6a), hex(0xc8b08a)], fib[p] * 0.6 + n1[p] * 0.4)
    put(b, p, r, g, bl, fib[p])
  }
  b.n = 3
  return b
}

P.hide = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 5, 5, seed)
  const wr = fbmTile(S, 16, 3, seed + 1, 1, 0.3)
  const bl = blocks(S, 3, 2, seed + 2, { jitterWidth: 0.4 })
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = y * S + x
      const seam = bl.edge[p] < S * 0.008
      const stitch = seam && ((x + y) >> 2) % 3 === 0
      const [r, g, b2] = ramp([hex(0x6a4a2e), hex(0x957050), hex(0xb89470)], n1[p] * 0.6 + wr[p] * 0.4)
      const k = seam ? (stitch ? 1.25 : 0.6) : 1
      put(b, p, r * k, g * k, b2 * k, wr[p] * 0.6 + (seam ? -0.3 : 0))
    }
  b.n = 2.5
  return b
}

P.dwemerMetal = (S, seed) => {
  const b = newBuf(S)
  const bl = blocks(S, 3, 3, seed, { jitterWidth: 0, offset: 0 })
  const n1 = fbmTile(S, 6, 5, seed + 1)
  const brushed = fbmTile(S, 96, 1, seed + 2, 0.05, 1)
  const cell = S / 3
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = y * S + x
      const e = smooth(clamp01(bl.edge[p] / (S * 0.012)))
      const lx = x % cell
      const ly = y % cell
      const rv = [cell * 0.08, cell * 0.92]
      let rivet = 0
      for (const rx of rv) for (const ry of rv) rivet = Math.max(rivet, clamp01(1 - Math.hypot(lx - rx, ly - ry) / (cell * 0.035)))
      const patina = clamp01((n1[p] - 0.58) * 4)
      let [r, g, b2] = ramp([hex(0x5a3e18), hex(0x94702e), hex(0xc49a48)], 0.5 + (brushed[p] - 0.5) * 0.5 + (n1[p] - 0.5) * 0.4 + rivet * 0.4)
      r = mix(r, 0.28, patina)
      g = mix(g, 0.46, patina)
      b2 = mix(b2, 0.38, patina)
      const k = mix(0.35, 1, e)
      put(b, p, r * k, g * k, b2 * k, e * 0.6 + rivet * 0.8)
    }
  b.n = 5
  return b
}

P.flesh = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 4, 5, seed)
  const w = worleyTile(S, 12, seed + 1)
  for (let p = 0; p < S * S; p++) {
    const vein = clamp01(1 - (w.f2[p] - w.f1[p]) * 14)
    const [r, g, bl] = ramp([hex(0x3a0e0a), hex(0x6a2218), hex(0x8e3a2a)], n1[p])
    put(b, p, mix(r, 0.75, vein * 0.5), mix(g, 0.3, vein * 0.3), mix(bl, 0.2, vein * 0.2), n1[p] * 0.5 + vein * 0.5)
  }
  b.n = 3
  return b
}

P.caveRock = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 3, 6, seed)
  const n2 = fbmTile(S, 12, 4, seed + 1, 1, 0.35)
  const w = worleyTile(S, 5, seed + 2)
  const pal = [hex(0x2e2620), hex(0x4a3e32), hex(0x6a5a48), hex(0x857260)]
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = y * S + x
      const strata = 0.5 + 0.5 * Math.sin((y / S) * Math.PI * 2 * 4 + n1[p] * 5)
      const crack = clamp01((w.f2[p] - w.f1[p]) * 14)
      const t = n1[p] * 0.5 + n2[p] * 0.3 + strata * 0.2
      const [r, g, bl] = ramp(pal, t)
      const k = 0.7 + 0.3 * crack
      put(b, p, r * k, g * k, bl * k, n1[p] * 0.5 + n2[p] * 0.3 + crack * 0.2)
    }
  b.n = 4
  return b
}

P.dwemerFloor = (S, seed) => {
  const b = P.dwemerMetal(S, seed)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = y * S + x
      const grate = Math.sin((x / S) * Math.PI * 2 * 24) > 0.85 || Math.sin((y / S) * Math.PI * 2 * 24) > 0.85
      if (grate) {
        b.c[p * 3] *= 0.55
        b.c[p * 3 + 1] *= 0.55
        b.c[p * 3 + 2] *= 0.55
        b.h[p] -= 0.2
      }
    }
  return b
}

P.bark = (S, seed) => {
  const b = newBuf(S)
  const ridges = fbmTile(S, 12, 4, seed, 1, 0.12)
  const n1 = fbmTile(S, 4, 4, seed + 1)
  for (let p = 0; p < S * S; p++) {
    const r0 = Math.pow(ridges[p], 1.5)
    const [r, g, bl] = ramp([hex(0x1e1610), hex(0x3e2e20), hex(0x5e4a36), hex(0x7a6650)], r0 * 0.8 + n1[p] * 0.3)
    put(b, p, r, g, bl, r0)
  }
  b.n = 5
  return b
}

P.parasolCap = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 5, 5, seed)
  const spots = worleyTile(S, 14, seed + 1)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = y * S + x
      const ring = 0.5 + 0.5 * Math.sin((y / S) * Math.PI * 2 * 5 + n1[p] * 4)
      const spot = spots.id[p] > 0.7 ? clamp01((0.25 - spots.f1[p]) * 6) : 0
      const [r, g, bl] = ramp([hex(0x6a3a1c), hex(0x9a5a2c), hex(0xba7a44), hex(0xd49a60)], ring * 0.4 + n1[p] * 0.6)
      put(b, p, mix(r, 0.85, spot), mix(g, 0.75, spot), mix(bl, 0.55, spot), ring * 0.5 + spot * 0.4)
    }
  b.n = 3
  return b
}

P.gills = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 4, 3, seed)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = y * S + x
      const g2 = Math.pow(Math.abs(Math.sin((x / S) * Math.PI * 64)), 0.5)
      const [r, g, bl] = ramp([hex(0x5a3a22), hex(0xc8a47a)], g2 * 0.7 + n1[p] * 0.3)
      put(b, p, r, g, bl, g2)
    }
  b.n = 4
  return b
}

P.waterNormal = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 8, 5, seed)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = y * S + x
      const u = (x / S) * Math.PI * 2
      const v = (y / S) * Math.PI * 2
      const h = Math.sin(u * 3 + v * 2) * 0.25 + Math.sin(u * 5 - v * 4 + n1[p] * 3) * 0.2 + Math.sin(-u * 7 + v * 9) * 0.1 + n1[p] * 0.5
      put(b, p, 0.5, 0.5, 1, h)
    }
  b.n = 3
  return b
}

// ---- character / creature atlas tiles (mostly neutral so vertex colours tint them) ----

P.skin = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 6, 5, seed)
  const pores = fbmTile(S, 96, 1, seed + 1)
  for (let p = 0; p < S * S; p++) {
    const v = 0.82 + (n1[p] - 0.5) * 0.25 + (pores[p] - 0.5) * 0.08
    put(b, p, v, v * 0.97, v * 0.95, pores[p] * 0.3 + n1[p] * 0.3)
  }
  b.n = 1
  return b
}

// Face drawn for SphereGeometry UVs: the front (+z) sits at u = 0.25.
P.face = (S, seed) => {
  const b = P.skin(S, seed)
  const at = (u, v) => [u * S, v * S]
  const ell = (cu, cv, ru, rv, fn) => {
    const [cx, cy] = at(cu, cv)
    const rx = ru * S
    const ry = rv * S
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
        if (d > 1 || y < 0 || y >= S) continue
        const p = y * S + ((x + S) % S)
        fn(p, 1 - d)
      }
  }
  const darken = (k, dh = 0) => (p, w) => {
    b.c[p * 3] *= 1 - k * w
    b.c[p * 3 + 1] *= 1 - k * w
    b.c[p * 3 + 2] *= 1 - k * w
    b.h[p] += dh * w
  }
  // eye sockets, brows, nose shadow, lips, cheeks
  for (const s of [-1, 1]) {
    ell(0.25 + s * 0.045, 0.55, 0.035, 0.035, darken(0.35, -0.3))
    ell(0.25 + s * 0.045, 0.6, 0.04, 0.012, darken(0.45, 0.2))
    ell(0.25 + s * 0.07, 0.46, 0.03, 0.03, darken(-0.06, 0.1))
  }
  ell(0.25, 0.49, 0.012, 0.035, darken(-0.08, 0.35))
  ell(0.25, 0.46, 0.02, 0.01, darken(0.25, 0))
  ell(0.25, 0.41, 0.03, 0.009, darken(0.35, 0.1))
  // hair line on the back/top so bald heads still read as heads
  for (let y = Math.floor(S * 0.7); y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = y * S + x
      const k = 0.08 * ((y - S * 0.7) / (S * 0.3))
      b.c[p * 3] *= 1 - k
      b.c[p * 3 + 1] *= 1 - k
      b.c[p * 3 + 2] *= 1 - k
    }
  b.n = 2
  return b
}

P.scales = (S, seed) => {
  const b = newBuf(S)
  const w = worleyTile(S, 44, seed, 0.5)
  const n1 = fbmTile(S, 4, 4, seed + 1)
  for (let p = 0; p < S * S; p++) {
    const e = smooth(clamp01((w.f2[p] - w.f1[p]) * 5))
    const v = (0.55 + w.id[p] * 0.3 + (n1[p] - 0.5) * 0.3) * mix(0.55, 1, e)
    put(b, p, v, v, v * 0.95, e * (1 - w.f1[p]))
  }
  b.n = 4
  return b
}

P.fur = (S, seed) => {
  const b = newBuf(S)
  const s1 = fbmTile(S, 64, 3, seed, 1, 0.08)
  const n1 = fbmTile(S, 5, 4, seed + 1)
  for (let p = 0; p < S * S; p++) {
    const v = 0.5 + s1[p] * 0.45 + (n1[p] - 0.5) * 0.3
    put(b, p, v, v * 0.96, v * 0.9, s1[p])
  }
  b.n = 2.5
  return b
}

P.fabric = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 5, 4, seed)
  const folds = fbmTile(S, 3, 3, seed + 1, 1, 0.2)
  const f = 96
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = y * S + x
      const weave = (Math.sin((x / S) * Math.PI * f) * Math.sin((y / S) * Math.PI * f)) * 0.5 + 0.5
      const v = 0.62 + weave * 0.12 + (n1[p] - 0.5) * 0.2 + (folds[p] - 0.5) * 0.35
      put(b, p, v, v, v, weave * 0.3 + folds[p] * 0.7)
    }
  b.n = 2
  return b
}

P.fabricTrim = (S, seed) => {
  const b = P.fabric(S, seed)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = y * S + x
      const v = y / S
      const inBand = v < 0.16 || (v > 0.46 && v < 0.54)
      if (!inBand) continue
      const dia = Math.abs(((x / S) * 16) % 1 - 0.5) + Math.abs(((v * 16) % 1) - 0.5) < 0.35
      const k = dia ? 1.35 : 0.55
      b.c[p * 3] *= k * 1.1
      b.c[p * 3 + 1] *= k * 0.95
      b.c[p * 3 + 2] *= k * 0.7
    }
  return b
}

P.leather = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 5, 5, seed)
  const wr = fbmTile(S, 24, 3, seed + 1)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = y * S + x
      const stitch = (x < S * 0.02 || x > S * 0.98) && (y >> 3) % 2 === 0
      const v = 0.5 + (n1[p] - 0.5) * 0.35 + (wr[p] - 0.5) * 0.2 + (stitch ? 0.3 : 0)
      put(b, p, v * 1.05, v * 0.9, v * 0.75, wr[p] * 0.7)
    }
  b.n = 2.5
  return b
}

P.chainmail = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 5, 3, seed)
  const R = S / 32
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = y * S + x
      const row = Math.floor(y / R)
      const lx = ((x + (row % 2) * R * 0.5) % R) - R / 2
      const ly = (y % R) - R / 2
      const d = Math.hypot(lx, ly) / (R / 2)
      const ring = clamp01(1 - Math.abs(d - 0.7) * 5)
      const v = 0.3 + ring * 0.6 + (n1[p] - 0.5) * 0.15
      put(b, p, v, v, v * 1.02, ring)
    }
  b.n = 4
  return b
}

P.plate = (S, seed) => {
  const b = newBuf(S)
  const brushed = fbmTile(S, 128, 1, seed, 0.04, 1)
  const dents = fbmTile(S, 6, 4, seed + 1)
  for (let p = 0; p < S * S; p++) {
    const v = 0.65 + (brushed[p] - 0.5) * 0.25 + (dents[p] - 0.5) * 0.2
    put(b, p, v, v, v, dents[p] * 0.6 + brushed[p] * 0.1)
  }
  b.n = 2
  return b
}

P.bonemold = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 5, 5, seed)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = y * S + x
      const seg = Math.pow(Math.abs(Math.sin((y / S) * Math.PI * 4 + n1[p])), 0.4)
      const v = 0.55 + seg * 0.35 + (n1[p] - 0.5) * 0.2
      put(b, p, v, v * 0.95, v * 0.82, seg)
    }
  b.n = 4
  return b
}

P.hair = (S, seed) => {
  const b = newBuf(S)
  const strands = fbmTile(S, 96, 2, seed, 1, 0.04)
  for (let p = 0; p < S * S; p++) {
    const v = 0.35 + strands[p] * 0.65
    put(b, p, v, v, v, strands[p])
  }
  b.n = 3
  return b
}

P.bone = (S, seed) => {
  const b = newBuf(S)
  const n1 = fbmTile(S, 5, 5, seed)
  const pits = worleyTile(S, 28, seed + 1)
  for (let p = 0; p < S * S; p++) {
    const pit = clamp01((0.12 - pits.f1[p]) * 7)
    const v = 0.8 + (n1[p] - 0.5) * 0.25 - pit * 0.3
    put(b, p, v, v * 0.96, v * 0.86, n1[p] * 0.5 - pit)
  }
  b.n = 2.5
  return b
}

P.chitin = (S, seed) => {
  const b = newBuf(S)
  const w = worleyTile(S, 16, seed, 0.6)
  const n1 = fbmTile(S, 6, 4, seed + 1)
  for (let p = 0; p < S * S; p++) {
    const e = smooth(clamp01((w.f2[p] - w.f1[p]) * 7))
    const shine = Math.pow(1 - w.f1[p], 3)
    const v = (0.45 + shine * 0.45 + (n1[p] - 0.5) * 0.2) * mix(0.4, 1, e)
    put(b, p, v, v, v, e * 0.6 + shine * 0.4)
  }
  b.n = 4
  return b
}

P.spots = (S, seed) => {
  const b = P.fur(S, seed)
  const w = worleyTile(S, 20, seed + 3)
  for (let p = 0; p < S * S; p++) {
    if (w.id[p] > 0.45 && w.f1[p] < 0.3) {
      b.c[p * 3] *= 0.55
      b.c[p * 3 + 1] *= 0.55
      b.c[p * 3 + 2] *= 0.6
    }
  }
  return b
}

P.membrane = (S, seed) => {
  const b = newBuf(S)
  const w = worleyTile(S, 8, seed)
  const n1 = fbmTile(S, 5, 4, seed + 1)
  for (let p = 0; p < S * S; p++) {
    const vein = clamp01(1 - (w.f2[p] - w.f1[p]) * 12)
    const v = 0.7 + (n1[p] - 0.5) * 0.2 - vein * 0.35
    put(b, p, v, v * 0.95, v * 0.9, vein)
  }
  b.n = 2
  return b
}

P.brass = (S, seed) => {
  const b = P.dwemerMetal(S, seed)
  // neutralise so vertex colour carries the hue
  for (let p = 0; p < S * S; p++) {
    const v = (b.c[p * 3] + b.c[p * 3 + 1] + b.c[p * 3 + 2]) / 3 / 0.55
    b.c[p * 3] = b.c[p * 3 + 1] = b.c[p * 3 + 2] = clamp01(v * 0.8)
  }
  return b
}

P.robe = (S, seed) => {
  const b = P.fabric(S, seed)
  const folds = fbmTile(S, 10, 3, seed + 5, 1, 0.1)
  for (let p = 0; p < S * S; p++) {
    const k = 0.7 + folds[p] * 0.5
    b.c[p * 3] *= k
    b.c[p * 3 + 1] *= k
    b.c[p * 3 + 2] *= k
    b.h[p] = folds[p]
  }
  return b
}

P.teeth = (S, seed) => {
  const b = newBuf(S)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = y * S + x
      const tooth = Math.abs(((x / S) * 12) % 1 - 0.5) < 0.5 - (y / S) * 0.5
      const v = tooth ? 0.9 : 0.25
      put(b, p, v, tooth ? 0.88 : 0.08, tooth ? 0.78 : 0.08, tooth ? 1 : 0)
    }
  return b
}

P.plain = S => {
  const b = newBuf(S)
  b.c.fill(0.8)
  return b
}

export function toColorData(b) {
  const S = b.S
  const d = new Uint8Array(S * S * 4)
  for (let p = 0; p < S * S; p++) {
    d[p * 4] = clamp01(b.c[p * 3]) * 255
    d[p * 4 + 1] = clamp01(b.c[p * 3 + 1]) * 255
    d[p * 4 + 2] = clamp01(b.c[p * 3 + 2]) * 255
    d[p * 4 + 3] = b.a ? clamp01(b.a[p]) * 255 : 255
  }
  return d
}

export function toNormalData(b, strength) {
  const S = b.S
  const h = b.h
  const d = new Uint8Array(S * S * 4)
  const k = strength * (S / 256)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const l = h[y * S + ((x - 1 + S) % S)]
      const r = h[y * S + ((x + 1) % S)]
      const u = h[((y - 1 + S) % S) * S + x]
      const dn = h[((y + 1) % S) * S + x]
      let nx = (l - r) * k
      let ny = (u - dn) * k
      let nz = 1
      const len = Math.hypot(nx, ny, nz)
      nx /= len
      ny /= len
      nz /= len
      const p = (y * S + x) * 4
      d[p] = (nx * 0.5 + 0.5) * 255
      d[p + 1] = (ny * 0.5 + 0.5) * 255
      d[p + 2] = (nz * 0.5 + 0.5) * 255
      d[p + 3] = 255
    }
  return d
}

