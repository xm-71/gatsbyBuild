import * as THREE from "three"
import { REGIONS } from "../logic/worldgen.js"
import { texture, cardTexture } from "./texgen.js"
import { normalize, worldUV, lathe, rockGeometry, taperTube, mergeGeometries } from "./geom.js"
import { Q, seg } from "../core/quality.js"
import { RNG } from "../core/rng.js"

export const floraTime = { value: 0 }

// Gentle wind sway for instanced foliage (height-weighted, phase by instance position).
function sway(material, amount) {
  material.onBeforeCompile = shader => {
    shader.uniforms.uWind = floraTime
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uWind;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.07;
#else
float ph = 0.0;
#endif
float hw = max(position.y, 0.0);
transformed.x += sin(uWind * 1.6 + ph) * ${amount.toFixed(3)} * hw;
transformed.z += cos(uWind * 1.1 + ph * 1.3) * ${(amount * 0.6).toFixed(3)} * hw;`
      )
  }
  return material
}

const mats = {}
function M(key) {
  if (mats[key]) return mats[key]
  const t = n => texture(n)
  let m
  switch (key) {
    case "stalk": m = new THREE.MeshLambertMaterial({ map: t("mushroomStalk").map, normalMap: t("mushroomStalk").normalMap, color: 0xd8ccb8 }); break
    case "cap": m = new THREE.MeshLambertMaterial({ map: t("parasolCap").map, normalMap: t("parasolCap").normalMap }); break
    case "gills": m = new THREE.MeshLambertMaterial({ map: t("gills").map, normalMap: t("gills").normalMap, side: THREE.DoubleSide }); break
    case "bark": m = new THREE.MeshLambertMaterial({ map: t("bark").map, normalMap: t("bark").normalMap }); break
    case "deadbark": m = new THREE.MeshLambertMaterial({ map: t("bark").map, normalMap: t("bark").normalMap, color: 0x9a948c }); break
    case "rock": m = new THREE.MeshLambertMaterial({ map: t("rock").map, normalMap: t("rock").normalMap }); break
    case "needles": m = sway(new THREE.MeshLambertMaterial({ map: cardTexture("needles"), alphaTest: 0.45, side: THREE.DoubleSide }), 0.012); break
    case "leaves": m = sway(new THREE.MeshLambertMaterial({ map: cardTexture("leaves"), alphaTest: 0.45, side: THREE.DoubleSide }), 0.02); break
    case "fern": m = sway(new THREE.MeshLambertMaterial({ map: cardTexture("fern"), alphaTest: 0.45, side: THREE.DoubleSide }), 0.05); break
    case "grass": m = sway(new THREE.MeshLambertMaterial({ map: cardTexture("grass"), alphaTest: 0.4, side: THREE.DoubleSide }), 0.09); break
    case "snowneedles": m = sway(new THREE.MeshLambertMaterial({ map: cardTexture("needles"), alphaTest: 0.45, side: THREE.DoubleSide, color: 0xc8d8d0 }), 0.008); break
    case "trama": m = new THREE.MeshLambertMaterial({ map: t("bark").map, color: 0x7a3a34 }); break
  }
  mats[key] = m
  return m
}

// ---- part builders (each returns an array of {geo, mat}) ----

const V3 = (x, y, z) => new THREE.Vector3(x, y, z)

function card(w, h, rotY, tilt = 0, y = 0) {
  const g = new THREE.PlaneGeometry(w, h)
  g.translate(0, h / 2, 0)
  g.rotateX(tilt)
  g.rotateY(rotY)
  g.translate(0, y, 0)
  return g
}

function starCards(w, h, n = 3, y = 0) {
  const gs = []
  for (let i = 0; i < n; i++) gs.push(card(w, h, (i / n) * Math.PI, 0, y))
  return gs
}

function merge(list) {
  return mergeGeometries(list.map(g => normalize(g)), false)
}

function parasol(rng) {
  const h = rng.range(8.5, 12)
  const lean = rng.range(-0.8, 0.8)
  const pts = [V3(0, -0.3, 0), V3(lean * 0.3, h * 0.35, 0.2), V3(lean * 0.8, h * 0.7, -0.1), V3(lean, h, 0)]
  const trunk = taperTube(pts, 0.62, 0.34, seg(9), seg(10))
  // flared base
  const base = lathe([[0.01, -0.3], [1.1, -0.3], [0.8, 0.2], [0.6, 0.9], [0.55, 1.4]], seg(10))
  const R = rng.range(3.6, 5)
  const cap = lathe([[0.01, 1.7], [R * 0.35, 1.6], [R * 0.7, 1.2], [R * 0.95, 0.45], [R, 0.1], [R * 0.93, 0]], seg(22))
  cap.translate(lean, h - 0.3, 0)
  const gills = lathe([[R * 0.92, 0.02], [R * 0.5, 0.25], [0.5, 0.5]], seg(22))
  gills.translate(lean, h - 0.3, 0)
  const shelves = []
  for (let i = 0; i < rng.int(1, 3); i++) {
    const y = rng.range(2, h * 0.7)
    const a = rng.range(0, Math.PI * 2)
    const s = new THREE.SphereGeometry(0.7, seg(10), 5, 0, Math.PI * 2, 0, Math.PI / 2)
    s.scale(1, 0.35, 0.8)
    s.translate(Math.cos(a) * 0.45 + lean * (y / h), y, Math.sin(a) * 0.45)
    shelves.push(s)
  }
  return [
    { geo: worldUV(merge([trunk, base]), 2), mat: M("stalk") },
    { geo: merge([cap, ...shelves]), mat: M("cap") },
    { geo: normalize(gills), mat: M("gills") },
  ]
}

function gashTree(rng) {
  const h = rng.range(7, 11)
  const trunk = taperTube([V3(0, -0.3, 0), V3(rng.range(-0.3, 0.3), h * 0.5, 0), V3(0, h, 0)], 0.32, 0.08, seg(7), 6)
  const cards = []
  const tiers = 6
  for (let t = 0; t < tiers; t++) {
    const y = h * (0.28 + (t / tiers) * 0.68)
    const w = (1 - t / tiers) * 3.6 + 1
    const n = 5
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + t * 0.7
      const g = new THREE.PlaneGeometry(w, w * 0.8)
      g.translate(0, 0, 0)
      g.rotateX(-Math.PI / 2 + 0.35) // droop outward
      g.translate(0, 0, w * 0.45)
      g.rotateY(a)
      g.translate(0, y, 0)
      cards.push(g)
    }
  }
  cards.push(...starCards(1.6, 2.2, 2, h - 0.6))
  return [
    { geo: worldUV(normalize(trunk), 2), mat: M("bark") },
    { geo: merge(cards), mat: M("needles") },
  ]
}

// snow-dusted pine for the frozen isle: a gash conifer with frosted needles
function pine(rng) {
  const [trunk, needles] = gashTree(rng)
  return [trunk, { geo: needles.geo, mat: M("snowneedles") }]
}

function swampTree(rng) {
  const h = rng.range(6, 9)
  const bend = rng.range(0.6, 1.8)
  const trunkPts = [V3(0, 0.6, 0), V3(bend * 0.4, h * 0.4, 0.3), V3(bend, h * 0.75, -0.2), V3(bend * 1.3, h, 0)]
  const parts = [taperTube(trunkPts, 0.5, 0.22, seg(8), seg(10))]
  // arching roots
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng.range(-0.3, 0.3)
    const r = rng.range(1.4, 2.4)
    parts.push(taperTube([V3(0, 1.4, 0), V3(Math.cos(a) * r * 0.5, 1.3, Math.sin(a) * r * 0.5), V3(Math.cos(a) * r, -0.3, Math.sin(a) * r)], 0.2, 0.07, 5, 6))
  }
  const leaves = []
  const tops = []
  for (let i = 0; i < 3; i++) {
    const a = rng.range(0, Math.PI * 2)
    const top = V3(bend * 1.3 + Math.cos(a) * rng.range(1.5, 2.8), h + rng.range(0.3, 1.6), Math.sin(a) * rng.range(1.5, 2.8))
    parts.push(taperTube([trunkPts[2].clone(), trunkPts[3].clone().lerp(top, 0.5), top], 0.2, 0.06, 5, 6))
    tops.push(top)
  }
  tops.push(trunkPts[3].clone().add(V3(0, 0.8, 0)))
  for (const t of tops) {
    for (const g of starCards(rng.range(3.2, 4.4), rng.range(2.2, 3), 3, 0)) {
      g.translate(t.x, t.y - 1.2, t.z)
      leaves.push(g)
    }
    const flat = new THREE.PlaneGeometry(4, 4)
    flat.rotateX(-Math.PI / 2)
    flat.translate(t.x, t.y + 0.4, t.z)
    leaves.push(flat)
  }
  return [
    { geo: worldUV(merge(parts), 2), mat: M("bark") },
    { geo: merge(leaves), mat: M("leaves") },
  ]
}

function deadTree(rng) {
  const parts = []
  const grow = (from, dir, len, r, depth) => {
    const to = from.clone().addScaledVector(dir, len)
    const mid = from.clone().lerp(to, 0.5).add(V3(rng.range(-0.3, 0.3), 0, rng.range(-0.3, 0.3)))
    parts.push(taperTube([from, mid, to], r, r * 0.6, depth > 1 ? 6 : 4, 4))
    if (depth <= 0) return
    const kids = rng.int(2, 3)
    for (let i = 0; i < kids; i++) {
      const nd = dir.clone().add(V3(rng.range(-0.9, 0.9), rng.range(-0.1, 0.5), rng.range(-0.9, 0.9))).normalize()
      grow(to, nd, len * rng.range(0.5, 0.75), r * 0.55, depth - 1)
    }
  }
  grow(V3(0, -0.3, 0), V3(rng.range(-0.15, 0.15), 1, rng.range(-0.15, 0.15)).normalize(), rng.range(3, 4.5), 0.34, Q.seg >= 1 ? 3 : 2)
  return [{ geo: worldUV(merge(parts), 2), mat: M("deadbark") }]
}

function shrub(rng) {
  const cards = []
  for (let i = 0; i < 4; i++) {
    const g = card(rng.range(1.4, 2.2), rng.range(1, 1.6), rng.range(0, Math.PI), 0)
    g.translate(rng.range(-0.3, 0.3), -0.05, rng.range(-0.3, 0.3))
    cards.push(g)
  }
  return [{ geo: merge(cards), mat: M("fern") }]
}

function grassTuft() {
  return [{ geo: merge(starCards(1.1, 0.55, 3)), mat: M("grass") }]
}

function trama(rng) {
  const parts = []
  for (let i = 0; i < 7; i++) {
    const a = rng.range(0, Math.PI * 2)
    const r = rng.range(0.4, 1.1)
    parts.push(taperTube([V3(0, 0, 0), V3(Math.cos(a) * r * 0.4, rng.range(0.6, 1.2), Math.sin(a) * r * 0.4), V3(Math.cos(a) * r, rng.range(1.2, 2), Math.sin(a) * r)], 0.07, 0.01, 4, 5))
  }
  return [{ geo: merge(parts), mat: M("trama") }]
}

function rock(rng, big) {
  const g = rockGeometry(rng.range(0, 100), big ? (Q.seg > 1 ? 3 : 2) : Q.seg > 1 ? 2 : 1, big ? 2.4 : 0.9, big ? 0.35 : 0.4)
  g.scale(rng.range(1, 1.4), rng.range(0.55, 0.85), rng.range(0.9, 1.2))
  g.translate(0, big ? 0.5 : 0.15, 0)
  return [{ geo: worldUV(normalize(g), big ? 3 : 1.5), mat: M("rock"), tint: true }]
}

const BUILDERS = { parasol, gashTree, pine, swampTree, deadTree, shrub, grass: grassTuft, trama, rock: r => rock(r, false), boulder: r => rock(r, true) }
const TINTED = { leaves: true, needles: true, fern: true, grass: true, rock: true }
const TRUNK_RADIUS = { parasol: 0.7, gashTree: 0.4, pine: 0.4, swampTree: 0.55, deadTree: 0.4, boulder: 2.3 }
const VARIANTS = 3

export function buildFlora(world, colliders) {
  const group = new THREE.Group()
  const rng = new RNG(`florapaint:${world.seed}`)
  let list = world.flora
  if (Q.floraMult < 1) list = list.filter((_, i) => i % 5 < Q.floraMult * 5)
  if (Q.floraMult > 1) {
    // extra decorative scatter (no gameplay effect): small plants and stones near existing flora
    const extra = []
    for (const f of world.flora) {
      if (!rng.chance(Q.floraMult - 1)) continue
      const x = f.x + rng.range(-6, 6)
      const z = f.z + rng.range(-6, 6)
      const y = world.heightAt(x, z)
      if (y < 0.8) continue
      const region = world.regionAt(x, z)
      const type = region === "ashlands" || region === "molagAmur" || region === "redMountain" ? "rock" : rng.pick(["shrub", "grass", "rock"])
      extra.push({ type, x, z, y, scale: rng.range(0.6, 1.1), rot: rng.range(0, 6.28) })
    }
    list = list.concat(extra)
  }
  const byKey = new Map()
  for (const f of list) {
    const v = Math.floor(f.scale * 997 + f.rot * 131) % VARIANTS
    const key = `${f.type}:${v}`
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(f)
  }
  const trunkItems = new Set(world.flora)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const p = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const col = new THREE.Color()
  const sets = []
  for (const [key, items] of byKey) {
    const [type, v] = key.split(":")
    const seed = `${type}:${v}:${world.seed}`
    const high = BUILDERS[type](new RNG(seed))
    // the far model: same shape and seed, built with far fewer segments
    let low = null
    if (!SMALL[type]) {
      const saved = Q.seg
      Q.seg = Math.min(saved, 0.4)
      low = BUILDERS[type](new RNG(seed))
      Q.seg = saved
    }
    const n = items.length
    const matrices = new Float32Array(n * 16)
    const colors = new Float32Array(n * 3)
    items.forEach((f, i) => {
      q.setFromAxisAngle(up, f.rot)
      s.setScalar(f.scale)
      p.set(f.x, f.y - 0.05, f.z)
      m.compose(p, q, s)
      m.toArray(matrices, i * 16)
      const R = REGIONS[world.regionAt(f.x, f.z)]
      col.setRGB(R.high[0] / 255, R.high[1] / 255, R.high[2] / 255, THREE.SRGBColorSpace)
      const lum = (col.r + col.g + col.b) / 3 || 1
      const k = 0.85 + ((f.rot * 1000) % 1) * 0.3
      colors[i * 3] = (0.55 + (col.r / lum) * 0.45) * k
      colors[i * 3 + 1] = (0.55 + (col.g / lum) * 0.45) * k
      colors[i * 3 + 2] = (0.55 + (col.b / lum) * 0.45) * k
    })
    const makeInst = (parts, shadows) =>
      parts.map(part => {
        const inst = new THREE.InstancedMesh(part.geo, part.mat, n)
        const leafy = part.mat === M("leaves") || part.mat === M("needles") || part.mat === M("fern") || part.mat === M("grass")
        inst.castShadow = shadows && Q.shadows && !SMALL[type] && (!leafy || Q.seg >= 1)
        inst.receiveShadow = true
        const matKey = Object.keys(mats).find(k2 => mats[k2] === part.mat)
        inst.userData.tinted = !!TINTED[matKey]
        if (inst.userData.tinted) inst.setColorAt(0, col.setRGB(1, 1, 1))
        inst.count = 0
        group.add(inst)
        return inst
      })
    sets.push({ type, items, matrices, colors, near: makeInst(high, true), far: low ? makeInst(low, false) : [] })
    if (TRUNK_RADIUS[type]) for (const f of items) if (trunkItems.has(f)) colliders.addCircle(f.x, f.z, TRUNK_RADIUS[type] * f.scale)
  }

  // Re-sort instances into near (full detail, shadows) and far (light, no shadows)
  // whenever the player has moved a little.
  const last = { x: 1e9, z: 1e9 }
  const fill = (insts, idx, set) => {
    for (const inst of insts) {
      const arr = inst.instanceMatrix.array
      const carr = inst.instanceColor?.array
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k]
        arr.set(set.matrices.subarray(i * 16, i * 16 + 16), k * 16)
        if (carr && inst.userData.tinted) carr.set(set.colors.subarray(i * 3, i * 3 + 3), k * 3)
      }
      inst.count = idx.length
      inst.instanceMatrix.needsUpdate = true
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true
      inst.computeBoundingSphere()
    }
  }
  group.userData.update = (px, pz, force = false) => {
    if (!force && Math.hypot(px - last.x, pz - last.z) < 12) return
    last.x = px
    last.z = pz
    const near2 = (NEAR_DIST * Q.drawDist) ** 2
    const small2 = (SMALL_DIST * Q.drawDist) ** 2
    const far2 = (FAR_DIST * Q.drawDist) ** 2
    for (const set of sets) {
      const nearIdx = []
      const farIdx = []
      const small = !!SMALL[set.type]
      for (let i = 0; i < set.items.length; i++) {
        const f = set.items[i]
        const d2 = (f.x - px) ** 2 + (f.z - pz) ** 2
        if (small) {
          if (d2 < small2) nearIdx.push(i)
        } else if (d2 < near2) nearIdx.push(i)
        else if (d2 < far2) farIdx.push(i)
      }
      fill(set.near, nearIdx, set)
      if (set.far.length) fill(set.far, farIdx, set)
    }
  }
  // everything visible until the first update (title fly-over looks from far away)
  group.userData.showAll = () => {
    for (const set of sets) {
      const all = set.items.map((_, i) => i)
      if (set.far.length) {
        fill(set.far, all, set)
        fill(set.near, [], set)
      } else fill(set.near, [], set)
    }
    last.x = 1e9
  }
  group.userData.showAll()
  return group
}

const NEAR_DIST = 80
const SMALL_DIST = 60
const FAR_DIST = 520
const SMALL = { shrub: true, grass: true, trama: true }

// ---------------------------------------------------------------------------
// Dense grass carpet that follows the player (render-only).
// ---------------------------------------------------------------------------
const GRASS_REGIONS = { ascadian: 1, grazelands: 1.3, westGash: 0.6, bitterCoast: 0.7, azurasCoast: 0.35 }

export class GrassField {
  constructor(world, towns) {
    this.world = world
    this.towns = towns
    this.count = Q.grass === 0 ? 0 : Q.grass === 1 ? 7000 : 16000
    this.radius = Q.grass === 1 ? 32 : 42
    this.center = new THREE.Vector2(1e9, 1e9)
    if (!this.count) {
      this.mesh = new THREE.Group()
      return
    }
    const g = merge(starCards(0.9, 0.42, 2))
    this.mesh = new THREE.InstancedMesh(g, M("grass"), this.count)
    this.mesh.frustumCulled = false
    this.mesh.receiveShadow = true
    this.mesh.count = 0
  }

  update(px, pz) {
    if (!this.count) return
    if (Math.hypot(px - this.center.x, pz - this.center.y) < 6) return
    this.center.set(px, pz)
    const w = this.world
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    const p = new THREE.Vector3()
    const col = new THREE.Color()
    const up = new THREE.Vector3(0, 1, 0)
    const step = (this.radius * 2) / Math.sqrt(this.count * 1.6)
    let n = 0
    const x0 = Math.floor((px - this.radius) / step)
    const z0 = Math.floor((pz - this.radius) / step)
    const cells = Math.ceil((this.radius * 2) / step)
    for (let j = 0; j <= cells && n < this.count; j++) {
      for (let i = 0; i <= cells && n < this.count; i++) {
        const gx = x0 + i
        const gz = z0 + j
        let h = (Math.imul(gx, 73856093) ^ Math.imul(gz, 19349663)) >>> 0
        const r1 = (h % 1000) / 1000
        h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
        const r2 = (h % 1000) / 1000
        const r3 = ((h >>> 10) % 1000) / 1000
        const x = (gx + r1) * step
        const z = (gz + r2) * step
        if (Math.hypot(x - px, z - pz) > this.radius) continue
        const dens = GRASS_REGIONS[w.regionAt(x, z)] || 0
        if (r3 > dens * 0.7) continue
        const y = w.heightAt(x, z)
        if (y < 1.6 || w.slopeAt(x, z) > 0.6) continue
        if (this.towns.some(t => Math.hypot(t.x - x, t.z - z) < t.radius * 0.6)) continue
        if (w.roadAt && w.roadAt(x, z) > 0.25) continue
        q.setFromAxisAngle(up, r1 * 6.28)
        s.setScalar(0.65 + r2 * 0.6)
        p.set(x, y - 0.05, z)
        m.compose(p, q, s)
        this.mesh.setMatrixAt(n, m)
        const reg = w.regionAt(x, z)
        if (reg === "grazelands") col.setRGB(1.25, 1.1, 0.6)
        else if (reg === "bitterCoast") col.setRGB(0.8, 0.9, 0.75)
        else col.setRGB(0.95 + r3 * 0.2, 1, 0.9)
        this.mesh.setColorAt(n, col)
        n++
      }
    }
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }
}

export { mergeGeometries as mergeGeometriesFlora }
