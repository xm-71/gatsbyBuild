import * as THREE from "three"
import { Q } from "../core/quality.js"
import { P, hashName, mulberry, clamp01, fbmTile, worleyTile, toColorData, toNormalData } from "./painters.js"

// ---------------------------------------------------------------------------
// Procedural texture generation. Every painter fills a tileable colour buffer
// (sRGB 0..1), a height buffer (used to derive a normal map) and optionally an
// alpha buffer. Nothing is downloaded: the whole art set is generated here.
// ---------------------------------------------------------------------------

function dataTexture(data, S, W = S, srgb = true) {
  const t = new THREE.DataTexture(data, W, S, THREE.RGBAFormat)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.anisotropy = Q.maxAniso
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.needsUpdate = true
  return t
}

const cache = new Map()
const prebuilt = new Map() // key -> { c, n } raw buffers produced by workers

function buffers(painter, size, seedName) {
  const key = `${seedName}:${size}`
  if (prebuilt.has(key)) {
    const r = prebuilt.get(key)
    prebuilt.delete(key)
    return r
  }
  const b = P[painter](size, hashName(seedName))
  return { c: toColorData(b), n: toNormalData(b, b.n) }
}

const WORLD_TEXTURES = ["grass", "ash", "rock", "sand", "snow", "road", "mud", "volcanic", "dirt", "cobble", "plaster", "wood", "planks", "shingles", "stoneBlocks", "sandstone", "tombBrick", "daedricStone", "floorTiles", "chitinShell", "mushroomCap", "mushroomStalk", "hide", "dwemerMetal", "flesh", "caveRock", "dwemerFloor", "bark", "parasolCap", "gills", "waterNormal", "plate", "fabricTrim", "fabric", "leather", "bone", "chitin"]

// Generate every texture in parallel web workers before the world is built.
export function preloadTextures(onProgress = () => {}) {
  const jobs = [
    ...WORLD_TEXTURES.map(name => ({ painter: name, size: Q.tex, seedName: name, key: `${name}:${Q.tex}` })),
    ...ATLAS_TILES.map(name => ({ painter: name, size: Q.tile, seedName: "atlas:" + name, key: `atlas:${name}:${Q.tile}` })),
  ]
  // biggest jobs first so the workers finish together
  jobs.sort((a, b) => b.size - a.size)
  const n = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1))
  return new Promise(resolve => {
    let done = 0
    let finished = 0
    let workers = []
    try {
      workers = Array.from({ length: n }, () => new Worker(new URL("./texworker.js", import.meta.url), { type: "module" }))
    } catch {
      return resolve(false)
    }
    const fail = () => {
      workers.forEach(w => w.terminate())
      resolve(false)
    }
    workers.forEach((w, i) => {
      w.onerror = fail
      w.onmessage = e => {
        if (e.data.done) {
          w.terminate()
          if (++finished === n) resolve(true)
          return
        }
        prebuilt.set(e.data.key, { c: e.data.c, n: e.data.n })
        onProgress(++done / jobs.length)
      }
      w.postMessage({ jobs: jobs.filter((_, k) => k % n === i) })
    })
  })
}

// Returns { map, normalMap } for a named painter, generated once and cached.
export function texture(name, size = Q.tex) {
  const key = `${name}:${size}`
  if (cache.has(key)) return cache.get(key)
  if (!P[name]) throw new Error(`No texture painter "${name}"`)
  const b = buffers(name, size, name)
  const out = { map: dataTexture(b.c, size), normalMap: dataTexture(b.n, size, size, false) }
  cache.set(key, out)
  return out
}

// ---------------------------------------------------------------------------
// Atlas for characters and creatures: one material, tiles addressed by name.
// ---------------------------------------------------------------------------

export const ATLAS_TILES = ["face", "skin", "scales", "fur", "fabric", "fabricTrim", "leather", "chainmail", "plate", "bonemold", "hair", "bone", "chitin", "spots", "membrane", "brass", "robe", "teeth", "plain", "flesh", "creatureHide", "mushroomStalk", "bark", "daedricStone"]
const ATLAS_COLS = 6
const ATLAS_ROWS = 4

let atlas = null
export function characterAtlas() {
  if (atlas) return atlas
  const T = Q.tile
  const W = T * ATLAS_COLS
  const H = T * ATLAS_ROWS
  const col = new Uint8Array(W * H * 4)
  const nor = new Uint8Array(W * H * 4)
  ATLAS_TILES.forEach((name, i) => {
    const { c, n } = buffers(name, T, "atlas:" + name)
    const ox = (i % ATLAS_COLS) * T
    const oy = Math.floor(i / ATLAS_COLS) * T
    for (let y = 0; y < T; y++) {
      col.set(c.subarray(y * T * 4, (y + 1) * T * 4), ((oy + y) * W + ox) * 4)
      nor.set(n.subarray(y * T * 4, (y + 1) * T * 4), ((oy + y) * W + ox) * 4)
    }
  })
  const map = dataTexture(col, H, W)
  const normalMap = dataTexture(nor, H, W, false)
  map.wrapS = map.wrapT = normalMap.wrapS = normalMap.wrapT = THREE.ClampToEdgeWrapping
  atlas = { map, normalMap, cols: ATLAS_COLS, rows: ATLAS_ROWS }
  return atlas
}

// Remap a geometry's 0..1 UVs into the rectangle of an atlas tile.
export function atlasUV(geo, tile) {
  const i = ATLAS_TILES.indexOf(tile)
  if (i < 0) throw new Error(`No atlas tile ${tile}`)
  const u0 = (i % ATLAS_COLS) / ATLAS_COLS
  const v0 = Math.floor(i / ATLAS_COLS) / ATLAS_ROWS
  const pad = 0.004
  const uv = geo.attributes.uv
  for (let k = 0; k < uv.count; k++) {
    const u = Math.min(1, Math.max(0, uv.getX(k)))
    const v = Math.min(1, Math.max(0, uv.getY(k)))
    uv.setXY(k, u0 + pad + u * (1 / ATLAS_COLS - 2 * pad), v0 + pad + v * (1 / ATLAS_ROWS - 2 * pad))
  }
  uv.needsUpdate = true
  return geo
}

// ---------------------------------------------------------------------------
// Alpha-card textures (leaves, grass, clouds) drawn with the 2D canvas API
// ---------------------------------------------------------------------------

function canvasTex(size, draw, srgb = true) {
  const cv = document.createElement("canvas")
  cv.width = cv.height = size
  const ctx = cv.getContext("2d")
  draw(ctx, size, mulberry(size * 31 + draw.length))
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = Q.maxAniso
  return t
}

const cards = {}
export function cardTexture(name) {
  if (cards[name]) return cards[name]
  const S = Math.max(128, Q.tex / 2)
  let t
  if (name === "grass") {
    t = canvasTex(S, (ctx, s, rnd) => {
      for (let i = 0; i < 70; i++) {
        const x = rnd() * s
        const h = s * (0.45 + rnd() * 0.55)
        const lean = (rnd() - 0.5) * s * 0.25
        const g = 70 + rnd() * 70
        ctx.strokeStyle = `rgb(${g * 0.9 + 20},${g + 30},${g * 0.35})`
        ctx.lineWidth = 1 + rnd() * s * 0.012
        ctx.beginPath()
        ctx.moveTo(x, s)
        ctx.quadraticCurveTo(x + lean * 0.3, s - h * 0.5, x + lean, s - h)
        ctx.stroke()
      }
    })
  } else if (name === "leaves") {
    t = canvasTex(S, (ctx, s, rnd) => {
      for (let i = 0; i < 220; i++) {
        const a = rnd() * Math.PI * 2
        const r = Math.sqrt(rnd()) * s * 0.45
        const x = s / 2 + Math.cos(a) * r
        const y = s / 2 + Math.sin(a) * r
        const g = 60 + rnd() * 70
        ctx.fillStyle = `rgb(${g * 0.7},${g},${g * 0.4})`
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rnd() * Math.PI * 2)
        ctx.beginPath()
        ctx.ellipse(0, 0, s * 0.035, s * 0.014, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    })
  } else if (name === "needles") {
    t = canvasTex(S, (ctx, s, rnd) => {
      ctx.strokeStyle = "#3a2a1a"
      ctx.lineWidth = s * 0.02
      ctx.beginPath()
      ctx.moveTo(s / 2, s)
      ctx.lineTo(s / 2, 0)
      ctx.stroke()
      for (let i = 0; i < 400; i++) {
        const y = rnd() * s
        const w = (1 - y / s) * s * 0.45 + s * 0.05
        const x = s / 2 + (rnd() - 0.5) * 2 * w
        const g = 50 + rnd() * 60
        ctx.strokeStyle = `rgb(${g * 0.55},${g},${g * 0.5})`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + (rnd() - 0.5) * s * 0.06, y + s * 0.04)
        ctx.stroke()
      }
    })
  } else if (name === "fern") {
    t = canvasTex(S, (ctx, s, rnd) => {
      for (let f = 0; f < 7; f++) {
        const a = -Math.PI / 2 + (f - 3) * 0.32
        const len = s * (0.35 + rnd() * 0.15)
        for (let i = 0; i < 14; i++) {
          const t2 = i / 14
          const x = s / 2 + Math.cos(a) * len * t2
          const y = s * 0.95 + Math.sin(a) * len * t2
          const g = 70 + rnd() * 60
          ctx.fillStyle = `rgb(${g * 0.6},${g},${g * 0.35})`
          ctx.beginPath()
          ctx.ellipse(x, y, s * 0.04 * (1 - t2 * 0.7), s * 0.012, a + Math.PI / 2, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    })
  } else if (name === "clouds") {
    t = canvasTex(512, (ctx, s) => {
      const n = fbmTile(s, 4, 6, 991)
      const img = ctx.createImageData(s, s)
      for (let p = 0; p < s * s; p++) {
        const v = clamp01((n[p] - 0.48) * 3.2)
        img.data[p * 4] = img.data[p * 4 + 1] = img.data[p * 4 + 2] = 235 + v * 20
        img.data[p * 4 + 3] = v * 235
      }
      ctx.putImageData(img, 0, 0)
    })
    t.wrapS = t.wrapT = THREE.RepeatWrapping
  } else if (name === "moon") {
    t = canvasTex(256, (ctx, s) => {
      const n = fbmTile(s, 4, 5, 551)
      const w = worleyTile(s, 7, 552)
      const img = ctx.createImageData(s, s)
      for (let p = 0; p < s * s; p++) {
        const crater = clamp01((0.35 - w.f1[p]) * 3) * (w.id[p] > 0.4 ? 1 : 0)
        const v = 180 + n[p] * 70 - crater * 60
        img.data[p * 4] = img.data[p * 4 + 1] = img.data[p * 4 + 2] = v
        img.data[p * 4 + 3] = 255
      }
      ctx.putImageData(img, 0, 0)
    })
  }
  cards[name] = t
  return t
}

// Standard material helpers
const matCache = new Map()
export function texturedMaterial(name, { color = 0xffffff, repeat = 1, metal = false, side, transparent = false, emissive = 0 } = {}) {
  const key = `${name}:${color}:${repeat}:${metal}:${side}:${emissive}`
  if (matCache.has(key)) return matCache.get(key)
  const t = texture(name)
  const opts = { color, map: t.map, normalMap: t.normalMap, side: side ?? THREE.FrontSide, transparent, emissive }
  const m = metal ? new THREE.MeshStandardMaterial({ ...opts, metalness: 0.75, roughness: 0.42 }) : new THREE.MeshLambertMaterial(opts)
  m.normalScale = new THREE.Vector2(1, 1)
  matCache.set(key, m)
  return m
}
