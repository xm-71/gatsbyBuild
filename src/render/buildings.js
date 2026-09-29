import * as THREE from "three"
import { makeLabel, } from "./textures.js"
import { texturedMaterial } from "./texgen.js"
import { Builder, lathe, rockGeometry, taperTube } from "./geom.js"
import { seg } from "../core/quality.js"
import { buildVelothiTower, buildDwemerRuins } from "./landmarks.js"

// Shared glowing material for windows and lanterns; intensity follows the time of day.
export const GLOW = new THREE.MeshLambertMaterial({ color: 0x3a2a14, emissive: 0xffb050, emissiveIntensity: 0.6 })
export const GLOW_COOL = new THREE.MeshLambertMaterial({ color: 0x302838, emissive: 0xc890ff, emissiveIntensity: 0.6 })

const TM = (name, color, extra = {}) => texturedMaterial(name, { color, ...extra })
const MAT = {
  plaster: () => TM("plaster", 0xffffff),
  timber: () => TM("wood", 0xb09070),
  planks: () => TM("planks", 0xffffff),
  shingles: () => TM("shingles", 0xffffff),
  stone: () => TM("stoneBlocks", 0xffffff),
  darkStone: () => TM("stoneBlocks", 0x8a8078),
  sandstone: () => TM("sandstone", 0xffffff),
  chitin: () => TM("chitinShell", 0xffffff),
  chitinDark: () => TM("chitinShell", 0x8a6a58),
  capPurple: () => TM("mushroomCap", 0xffffff),
  stalk: () => TM("mushroomStalk", 0xffffff),
  hide: () => TM("hide", 0xffffff),
  cobble: () => TM("cobble", 0xffffff),
  dwemer: () => TM("dwemerMetal", 0xffffff, { metal: true }),
  daedric: () => TM("daedricStone", 0xffffff),
  rock: () => TM("rock", 0xffffff),
  tomb: () => TM("tombBrick", 0xffffff),
  cloth: () => TM("fabricTrim", 0xa83a2a, { side: THREE.DoubleSide }),
  clothTan: () => TM("fabricTrim", 0xc8b890, { side: THREE.DoubleSide }),
  flesh: () => TM("flesh", 0xffffff),
  iron: () => TM("dwemerMetal", 0x6a6a6a, { metal: true }),
}

const V3 = (x, y, z) => new THREE.Vector3(x, y, z)

// Adds parts in a local frame (building space) into a shared Builder.
class Placer {
  constructor(builder, x, y, z, rotY) {
    this.b = builder
    this.base = new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), rotY), V3(1, 1, 1))
    this.o = new THREE.Object3D()
  }

  add(geo, mat, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], uv = 2.5 } = {}) {
    const o = this.o
    o.position.set(...pos)
    o.rotation.set(...rot)
    o.scale.set(...scale)
    o.updateMatrix()
    this.b.add(geo, mat, { matrix: this.base.clone().multiply(o.matrix), uv })
  }

  box(w, h, d, mat, x, y, z, opts = {}) {
    this.add(new THREE.BoxGeometry(w, h, d), mat, { pos: [x, y, z], ...opts })
  }

  cyl(rt, rb, h, mat, x, y, z, opts = {}) {
    this.add(new THREE.CylinderGeometry(rt, rb, h, opts.segs || seg(10)), mat, { pos: [x, y, z], ...opts })
  }
}

// ---- shared details ----

function windowFrame(P, x, y, z, rotY, w = 0.9, h = 1.1, frameMat = MAT.timber()) {
  const dir = [Math.sin(rotY), Math.cos(rotY)]
  const o = (dx, dz) => [x + dx * Math.cos(rotY) + dz * dir[0], z - dx * Math.sin(rotY) + dz * dir[1]]
  const [cx, cz] = o(0, 0.02)
  P.box(w, h, 0.08, GLOW, cx, y, cz, { rot: [0, rotY, 0] })
  const t = 0.12
  for (const [dx, dy, ww, hh] of [[0, h / 2, w + t * 2, t], [0, -h / 2, w + t * 2, t * 1.5], [-w / 2, 0, t, h], [w / 2, 0, t, h], [0, 0, t * 0.6, h]]) {
    const [fx, fz] = o(dx, 0.08)
    P.box(ww, hh, 0.14, frameMat, fx, y + dy, fz, { rot: [0, rotY, 0] })
  }
}

function door(P, z, w = 1.5, h = 2.5, mat = MAT.planks(), frame = MAT.timber()) {
  P.box(w, h, 0.18, mat, 0, h / 2 + 0.3, z - 0.05)
  P.box(w + 0.4, 0.3, 0.3, frame, 0, h + 0.45, z - 0.1)
  P.box(0.22, h + 0.3, 0.3, frame, -w / 2 - 0.1, h / 2 + 0.3, z - 0.1)
  P.box(0.22, h + 0.3, 0.3, frame, w / 2 + 0.1, h / 2 + 0.3, z - 0.1)
  P.box(w + 0.8, 0.3, 0.9, MAT.stone(), 0, 0.15, z - 0.45) // step
  P.add(new THREE.SphereGeometry(0.06, 6, 4), MAT.iron(), { pos: [w * 0.3, h * 0.5 + 0.3, z - 0.18] })
}

function lantern(P, x, y, z) {
  P.cyl(0.04, 0.04, 0.5, MAT.timber(), x, y + 0.45, z, { segs: 5 })
  P.add(lathe([[0.01, -0.28], [0.2, -0.22], [0.26, 0], [0.2, 0.22], [0.01, 0.28]], seg(8)), GLOW, { pos: [x, y, z] })
}

function crate(P, x, z, s = 1, rot = 0) {
  P.box(0.9 * s, 0.9 * s, 0.9 * s, MAT.planks(), x, 0.45 * s, z, { rot: [0, rot, 0], uv: 1 })
}

function barrel(P, x, z, s = 1) {
  P.add(lathe([[0.01, 0], [0.4, 0], [0.48, 0.5], [0.4, 1], [0.01, 1]], seg(12)), MAT.planks(), { pos: [x, 0, z], scale: [s, s, s], uv: 1 })
  for (const y of [0.15, 0.85]) P.add(new THREE.TorusGeometry(0.43, 0.035, 4, seg(14)), MAT.iron(), { pos: [x, y * s, z], rot: [Math.PI / 2, 0, 0], scale: [s, s, s] })
}

// ---------------- styles ----------------

function hlaaluHouse(P, b) {
  const { w, d } = b
  const wallH = b.type === "manor" ? 7 : 4.6
  P.box(w + 0.5, 1, d + 0.5, MAT.stone(), 0, 0, 0)
  P.box(w, wallH, d, MAT.plaster(), 0, wallH / 2 + 0.3, 0)
  // timber framing
  const beam = MAT.timber()
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(0.34, wallH, 0.34, beam, (sx * w) / 2, wallH / 2 + 0.3, (sz * d) / 2)
  for (const y of [wallH * 0.55 + 0.3, wallH + 0.2]) {
    P.box(w + 0.3, 0.26, 0.26, beam, 0, y, -d / 2 - 0.05)
    P.box(w + 0.3, 0.26, 0.26, beam, 0, y, d / 2 + 0.05)
    P.box(0.26, 0.26, d + 0.3, beam, -w / 2 - 0.05, y, 0)
    P.box(0.26, 0.26, d + 0.3, beam, w / 2 + 0.05, y, 0)
  }
  // shallow gable roof with overhang and rafter ends
  const rise = 1.3
  const halfW = w / 2 + 0.9
  const slope = Math.atan2(rise, halfW)
  const len = Math.hypot(halfW, rise)
  for (const sx of [-1, 1]) P.box(len, 0.22, d + 1.6, MAT.shingles(), (sx * halfW) / 2, wallH + 0.4 + rise / 2, 0, { rot: [0, 0, -sx * slope] })
  P.box(0.3, 0.3, d + 1.8, beam, 0, wallH + 0.45 + rise, 0)
  const gable = new THREE.CylinderGeometry(1, 1, 0.2, 3)
  for (const sz of [-1, 1]) P.add(gable, MAT.plaster(), { pos: [0, wallH + 0.4 + rise / 3, (sz * d) / 2], rot: [-Math.PI / 2, 0, 0], scale: [w / 1.73, 1, rise * 0.667] })
  for (let i = -3; i <= 3; i++) for (const sz of [-1, 1]) P.box(0.18, 0.18, 0.7, beam, (i * w) / 7, wallH + 0.3, sz * (d / 2 + 0.3))
  door(P, -d / 2)
  // awning over the door
  P.box(2.6, 0.12, 1.4, MAT.planks(), 0, 3.5, -d / 2 - 0.7, { rot: [0.25, 0, 0] })
  for (const sx of [-1, 1]) P.cyl(0.07, 0.07, 3.4, beam, sx * 1.2, 1.7, -d / 2 - 1.3, { segs: 6 })
  // windows
  for (const sx of [-1, 1]) windowFrame(P, sx * w * 0.3, 2.3, -d / 2, Math.PI)
  windowFrame(P, 0, 2.3, d / 2, 0)
  for (const sx of [-1, 1]) windowFrame(P, (sx * w) / 2, 2.3, 0, (sx * Math.PI) / 2)
  if (wallH > 5) for (const sx of [-1, 0, 1]) windowFrame(P, sx * w * 0.32, wallH * 0.8, -d / 2, Math.PI, 0.8, 0.9)
  lantern(P, -1.6, 2.9, -d / 2 - 0.4)
  crate(P, w / 2 + 0.7, d * 0.2, 1, 0.3)
  barrel(P, w / 2 + 0.6, -d * 0.2, 0.9)
}

function redoranHouse(P, b) {
  const { w, d } = b
  const big = b.type === "manor"
  const H = big ? 8 : 5.6
  const rings = 4
  for (let k = 0; k < rings; k++) {
    const r0 = 1 - k / rings
    const r1 = 1 - (k + 1) / rings
    const y0 = H * Math.sqrt(1 - r0 * r0)
    const y1 = H * Math.sqrt(1 - r1 * r1)
    // each ring overlaps the next with a lip, like carapace plates
    const prof = [[r0 + 0.04, y0 - 0.15], [r0 + 0.06, y0 + 0.05], [(r0 + r1) / 2 + 0.03, (y0 + y1) / 2 + 0.1], [Math.max(0.01, r1), y1 + 0.2]]
    P.add(lathe(prof, seg(24)), MAT.chitin(), { pos: [0, 0, 0], scale: [w / 2 + 0.5, 1, d / 2 + 0.5], uv: 3 })
  }
  // spine ribs running over the dome
  for (let i = -2; i <= 2; i++) {
    const pts = []
    for (let t = 0; t <= 8; t++) {
      const a = (t / 8) * Math.PI
      pts.push(V3(i * (w / 7), Math.sin(a) * (H + 0.2), Math.cos(a) * (d / 2 + 0.6)))
    }
    P.add(taperTube(pts, 0.14, 0.14, 5, 16), MAT.chitinDark(), { uv: 2 })
  }
  for (let i = 0; i < 3; i++) P.add(new THREE.ConeGeometry(0.22, 1.4, 5), MAT.chitinDark(), { pos: [0, H + 0.5, (i - 1) * 1.6], rot: [(i - 1) * 0.3, 0, 0] })
  // entrance tunnel with its own shell
  const tunnel = lathe([[1.8, 0], [1.9, 1.5], [1.4, 2.8], [0.4, 3.4], [0.01, 3.45]], seg(16))
  P.add(tunnel, MAT.chitin(), { pos: [0, 0, -d / 2 - 0.4], scale: [1, 1, 0.9] })
  door(P, -d / 2 - 1.95, 1.4, 2.4, MAT.planks(), MAT.chitinDark())
  // round portholes
  for (const a of [-0.7, 0.7, Math.PI - 0.6, Math.PI + 0.6]) {
    const px = Math.sin(a) * (w / 2 + 0.2)
    const pz = -Math.cos(a) * (d / 2 + 0.2)
    P.add(new THREE.CircleGeometry(0.42, seg(12)), GLOW, { pos: [px, 2.4, pz], rot: [0, Math.PI - a, 0] })
    P.add(new THREE.TorusGeometry(0.46, 0.09, 5, seg(14)), MAT.chitinDark(), { pos: [px, 2.4, pz], rot: [0, Math.PI - a, 0] })
  }
  // chimney vent
  P.cyl(0.35, 0.45, 1.3, MAT.chitinDark(), w * 0.2, H - 0.1, d * 0.15)
  if (big) {
    P.add(lathe([[1.6, 0], [1.4, 6], [0.9, 10], [0.1, 13]], seg(12)), MAT.chitin(), { pos: [w * 0.25, 0, d * 0.2] })
    for (const y of [4, 7.5]) P.add(new THREE.TorusGeometry(1.5 - y * 0.06, 0.12, 5, seg(14)), MAT.chitinDark(), { pos: [w * 0.25, y, d * 0.2], rot: [Math.PI / 2, 0, 0] })
  }
  lantern(P, 1.7, 2.6, -d / 2 - 2.2)
}

function telvanniHouse(P, b) {
  const { w } = b
  const tall = b.type === "manor" || b.type === "temple"
  const stalkH = tall ? 17 : 4.5
  const r = w * 0.26
  // bulging stalk and root buttresses
  P.add(lathe([[r * 1.5, -0.3], [r * 1.2, 0.8], [r, stalkH * 0.3], [r * 1.12, stalkH * 0.6], [r * 0.9, stalkH], [r * 1.2, stalkH + 0.6]], seg(14)), MAT.stalk(), { uv: 3 })
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    P.add(taperTube([V3(Math.cos(a) * r, 2.2, Math.sin(a) * r), V3(Math.cos(a) * r * 1.9, 0.8, Math.sin(a) * r * 1.9), V3(Math.cos(a) * r * 2.6, -0.3, Math.sin(a) * r * 2.6)], 0.45, 0.15, 6, 8), MAT.stalk(), { uv: 2 })
  }
  // main pod
  const podR = tall ? w * 0.42 : w * 0.5
  const podH = tall ? 4 : b.h * 0.7
  P.add(lathe([[r, 0], [podR * 0.8, 0.3], [podR, podH * 0.45], [podR * 0.85, podH * 0.85], [0.01, podH + 0.4]], seg(20)), MAT.capPurple(), { pos: [0, stalkH, 0], uv: 3 })
  // bulb windows around the pod
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    P.add(new THREE.SphereGeometry(0.4, seg(8), 6), GLOW_COOL, { pos: [Math.cos(a) * podR * 0.98, stalkH + podH * 0.45, Math.sin(a) * podR * 0.98], scale: [0.6, 1, 0.6] })
  }
  if (tall) {
    // spiralling shelf caps and a spire
    for (let i = 0; i < 5; i++) {
      const a = i * 1.9
      const y = 3 + i * (stalkH - 5) / 5
      const sr = 2.2 - i * 0.18
      P.add(lathe([[0.01, 0.9], [sr * 0.6, 0.8], [sr, 0.2], [sr * 0.95, 0], [0.3, -0.3]], seg(14)), MAT.capPurple(), { pos: [Math.cos(a) * (r + sr * 0.6), y, Math.sin(a) * (r + sr * 0.6)] })
    }
    P.add(new THREE.ConeGeometry(0.6, 5, seg(8)), MAT.stalk(), { pos: [0, stalkH + podH + 2.5, 0] })
  }
  // doorway at the stalk foot
  P.add(new THREE.CircleGeometry(0.9, seg(12)), MAT.planks(), { pos: [0, 1.2, -r * 1.05], rot: [0, Math.PI, 0], scale: [1, 1.4, 1] })
  P.add(new THREE.TorusGeometry(0.95, 0.14, 5, seg(14)), MAT.stalk(), { pos: [0, 1.2, -r * 1.05], scale: [1, 1.4, 1] })
}

function imperialHouse(P, b) {
  const { w, d } = b
  if (b.type === "fort") return imperialFort(P, b)
  const wallH = 4.4
  P.box(w + 0.4, 1, d + 0.4, MAT.darkStone(), 0, 0, 0)
  P.box(w, wallH, d, MAT.stone(), 0, wallH / 2 + 0.3, 0)
  P.box(w + 0.35, 0.35, d + 0.35, MAT.darkStone(), 0, wallH + 0.4, 0) // cornice
  const rise = 2.4
  const halfW = w / 2 + 0.6
  const slope = Math.atan2(rise, halfW)
  const len = Math.hypot(halfW, rise)
  for (const sx of [-1, 1]) P.box(len, 0.25, d + 1, MAT.shingles(), (sx * halfW) / 2, wallH + 0.5 + rise / 2, 0, { rot: [0, 0, -sx * slope] })
  const gable = new THREE.CylinderGeometry(1, 1, 0.3, 3)
  for (const sz of [-1, 1]) P.add(gable, MAT.stone(), { pos: [0, wallH + 0.5 + rise / 3, (sz * d) / 2], rot: [-Math.PI / 2, 0, 0], scale: [w / 1.73, 1, rise * 0.667] })
  P.box(0.9, 2.6, 0.9, MAT.darkStone(), w * 0.28, wallH + 1.6, d * 0.15) // chimney
  door(P, -d / 2, 1.4, 2.4, MAT.planks(), MAT.darkStone())
  for (const sx of [-1, 1]) {
    windowFrame(P, sx * w * 0.3, 2.3, -d / 2, Math.PI, 0.8, 1, MAT.darkStone())
    // shutters
    for (const k of [-1, 1]) P.box(0.45, 1.1, 0.08, MAT.planks(), sx * w * 0.3 + k * 0.7, 2.3, -d / 2 - 0.1)
  }
  windowFrame(P, 0, 2.3, d / 2, 0, 0.8, 1, MAT.darkStone())
  lantern(P, 1.3, 2.8, -d / 2 - 0.4)
  barrel(P, -w / 2 - 0.6, -d * 0.25, 0.9)
}

function imperialFort(P, b) {
  const { w, d, h } = b
  P.box(w, h, d, MAT.stone(), 0, h / 2 - 0.3, 0)
  // crenellations
  const n = 6
  for (let i = 0; i < n; i++) {
    const t = -w / 2 + (i + 0.5) * (w / n)
    for (const sz of [-1, 1]) P.box(0.9, 1, 0.8, MAT.stone(), t, h + 0.2, (sz * d) / 2 - sz * 0.4)
    for (const sx of [-1, 1]) P.box(0.8, 1, 0.9, MAT.stone(), (sx * w) / 2 - sx * 0.4, h + 0.2, t)
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const tx = (sx * w) / 2
      const tz = (sz * d) / 2
      P.cyl(1.8, 2.1, h + 3.5, MAT.stone(), tx, (h + 3.5) / 2 - 0.3, tz, { segs: seg(14) })
      P.add(new THREE.ConeGeometry(2.3, 2.8, seg(14)), MAT.shingles(), { pos: [tx, h + 4.6, tz] })
      for (let k = 0; k < 3; k++) windowFrame(P, tx, 3 + k * 2.5, tz + sz * 2.05, sz > 0 ? 0 : Math.PI, 0.25, 0.9, MAT.darkStone())
    }
  // gatehouse arch
  P.box(4.4, 5, 1.2, MAT.darkStone(), 0, 2.3, -d / 2 - 0.4)
  P.add(new THREE.CylinderGeometry(1.5, 1.5, 1.3, seg(16), 1, false, 0, Math.PI), MAT.planks(), { pos: [0, 2.6, -d / 2 - 0.45], rot: [Math.PI / 2, 0, Math.PI / 2] })
  P.box(3, 2.6, 0.2, MAT.planks(), 0, 1.3, -d / 2 - 1.05)
  for (let i = -2; i <= 2; i++) P.box(0.08, 3.8, 0.08, MAT.iron(), i * 0.6, 2.2, -d / 2 - 1.12)
  // banners
  for (const sx of [-1, 1]) P.add(new THREE.PlaneGeometry(1.3, 3.2, 1, 4), MAT.cloth(), { pos: [sx * 3.2, h - 2, -d / 2 - 0.05], rot: [0, Math.PI, 0], uv: "keep" })
  P.cyl(0.08, 0.08, 5, MAT.timber(), 0, h + 2.5, 0, { segs: 6 })
  P.add(new THREE.PlaneGeometry(2, 1.2), MAT.cloth(), { pos: [1, h + 4.2, 0], uv: "keep" })
}

function ashlanderYurt(P, b) {
  const r = b.w / 2
  P.add(lathe([[r, 0], [r * 1.02, 1.3], [r * 0.85, 2.4], [r * 0.45, 3.3], [0.3, 3.7]], seg(16)), MAT.hide(), { uv: 2.5 })
  // poles through the smoke hole
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    P.add(taperTube([V3(Math.cos(a) * r * 0.9, 1.2, Math.sin(a) * r * 0.9), V3(Math.cos(a) * 0.3, 3.8, Math.sin(a) * 0.3), V3(-Math.cos(a) * 0.3, 4.6, -Math.sin(a) * 0.3)], 0.07, 0.05, 4, 6), MAT.timber())
  }
  // bound ropes
  for (const y of [1.3, 2.4]) P.add(new THREE.TorusGeometry(y > 2 ? r * 0.85 : r * 1.02, 0.04, 4, seg(20)), MAT.timber(), { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0] })
  // entrance flap
  P.add(new THREE.PlaneGeometry(1.3, 1.9, 1, 3), MAT.hide(), { pos: [0.3, 0.95, -r - 0.05], rot: [0, Math.PI + 0.35, 0] })
  P.box(1.2, 1.8, 0.05, GLOW, 0, 0.9, -r + 0.02)
}

function temple(P, b, style) {
  const { w, d } = b
  const stone = style === "imperial" ? MAT.stone() : MAT.sandstone()
  const baseH = b.h * 0.6
  P.box(w + 1, 1, d + 1, stone, 0, 0, 0)
  P.box(w, baseH, d, stone, 0, baseH / 2 + 0.3, 0)
  P.box(w + 0.5, 0.5, d + 0.5, stone, 0, baseH + 0.5, 0)
  // bulbous Tribunal dome on a drum
  P.cyl(w * 0.34, w * 0.36, 1.4, stone, 0, baseH + 1.3, 0, { segs: seg(20) })
  P.add(lathe([[w * 0.36, 0], [w * 0.4, w * 0.18], [w * 0.3, w * 0.36], [w * 0.1, w * 0.48], [0.05, w * 0.55]], seg(22)), TM("dwemerMetal", 0xd0b070, { metal: true }), { pos: [0, baseH + 2, 0] })
  P.add(new THREE.ConeGeometry(0.35, 3, seg(8)), TM("dwemerMetal", 0xe0c070, { metal: true }), { pos: [0, baseH + 2 + w * 0.55 + 1.4, 0] })
  // corner turrets
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      P.cyl(0.8, 0.9, baseH + 1.8, stone, (sx * w) / 2, (baseH + 1.8) / 2, (sz * d) / 2, { segs: seg(10) })
      P.add(lathe([[0.9, 0], [0.8, 0.9], [0.3, 1.6], [0.02, 2]], seg(10)), stone, { pos: [(sx * w) / 2, baseH + 1.7, (sz * d) / 2] })
    }
  // portico with columns
  P.box(5.6, 0.6, 3, stone, 0, 4.6, -d / 2 - 1.3)
  for (const sx of [-2.2, -0.8, 0.8, 2.2]) P.cyl(0.26, 0.3, 4.3, stone, sx, 2.3, -d / 2 - 2.5, { segs: seg(10) })
  P.box(6, 0.3, 3.6, stone, 0, 0.15, -d / 2 - 1.4)
  door(P, -d / 2, 1.8, 3, MAT.planks(), stone)
  for (const sx of [-1, 1]) windowFrame(P, sx * w * 0.32, baseH * 0.6, -d / 2, Math.PI, 0.6, 1.8, stone)
}

// Nord longhouse: log walls on a stone footing, a steep snow-laden roof with
// crossed gable beams, and a smoke hole.
function nordHouse(P, b) {
  const { w, d } = b
  const big = b.type === "manor" || b.type === "hall"
  const L = big ? d * 1.5 : d
  const wallH = big ? 3.4 : 2.8
  P.box(w + 0.5, 0.8, L + 0.5, MAT.darkStone(), 0, 0, 0)
  // stacked logs
  const logs = Math.round(wallH / 0.36)
  for (let i = 0; i < logs; i++) {
    const y = 0.5 + i * 0.36
    for (const sx of [-1, 1]) P.cyl(0.19, 0.19, L + 0.6, MAT.timber(), (sx * w) / 2, y, 0, { rot: [Math.PI / 2, 0, 0], segs: 6 })
    for (const sz of [-1, 1]) P.cyl(0.19, 0.19, w + 0.6, MAT.timber(), 0, y + 0.18, (sz * L) / 2, { rot: [0, 0, Math.PI / 2], segs: 6 })
  }
  // steep roof with a snow cap
  const rise = w * 0.75
  const halfW = w / 2 + 0.8
  const slope = Math.atan2(rise, halfW)
  const len = Math.hypot(halfW, rise)
  const top = 0.5 + wallH
  for (const sx of [-1, 1]) {
    P.box(len, 0.3, L + 1.2, MAT.shingles(), (sx * halfW) / 2, top + rise / 2, 0, { rot: [0, 0, -sx * slope] })
    P.box(len * 0.92, 0.12, L + 1.25, TM("snow", 0xffffff), (sx * halfW) / 2 * 0.98, top + rise / 2 + 0.2, 0, { rot: [0, 0, -sx * slope] })
  }
  const gable = new THREE.CylinderGeometry(1, 1, 0.3, 3)
  for (const sz of [-1, 1]) {
    P.add(gable, MAT.planks(), { pos: [0, top + rise / 3, (sz * L) / 2], rot: [-Math.PI / 2, 0, 0], scale: [w / 1.73, 1, rise * 0.667] })
    // crossed gable beams
    for (const sx of [-1, 1]) P.box(0.18, 1.8, 0.18, MAT.timber(), sx * 0.35, top + rise + 0.5, (sz * L) / 2 + 0.3, { rot: [0, 0, sx * 0.5] })
  }
  P.box(0.6, 0.6, 0.6, MAT.darkStone(), 0, top + rise - 0.1, L * 0.2) // smoke hole
  door(P, -L / 2, 1.3, 2.2, MAT.planks(), MAT.timber())
  lantern(P, 1.2, 2.4, -L / 2 - 0.4)
  if (!big) crate(P, w / 2 + 0.7, L * 0.2, 0.8, 0.3)
  // antlers over the door of the big halls
  if (big) for (const sx of [-1, 1]) P.add(taperTube([V3(sx * 0.1, 0, 0), V3(sx * 0.5, 0.4, 0), V3(sx * 0.7, 0.9, 0.1)], 0.05, 0.015, 4, 5), TM("bone", 0xe8e0c8), { pos: [0, 3.2, -L / 2 - 0.2] })
}

const STYLE_FN = { hlaalu: hlaaluHouse, redoran: redoranHouse, telvanni: telvanniHouse, imperial: imperialHouse, ashlander: ashlanderYurt, nord: nordHouse }

// ---------------- towns ----------------

export function buildTown(town, colliders) {
  const group = new THREE.Group()
  const builder = new Builder()
  const plazaR = town.radius * 0.55
  // cobbled plaza that follows the flattened ground
  const plaza = new THREE.CircleGeometry(plazaR, seg(32))
  plaza.rotateX(-Math.PI / 2)
  builder.add(plaza, town.style === "ashlander" ? TM("dirt", 0xffffff) : town.style === "nord" ? TM("road", 0xffffff) : MAT.cobble(), { pos: [town.x, town.y + 0.05, town.z], uv: 3 })

  for (const b of town.buildings) {
    const P = new Placer(builder, b.x, town.y, b.z, b.rot)
    if (b.type === "temple" && town.style !== "telvanni" && town.style !== "ashlander") temple(P, b, town.style)
    else if (b.type === "fort") imperialFort(P, b)
    else (STYLE_FN[town.style] || hlaaluHouse)(P, b)

    if (b.label) {
      const sign = makeLabel(b.label, { size: 26, scale: 0.02 })
      const off = b.d / 2 + (town.style === "redoran" ? 2.6 : 1)
      sign.position.set(b.x - Math.cos(b.angle) * off, town.y + (town.style === "telvanni" ? 4.2 : 4.1), b.z - Math.sin(b.angle) * off)
      group.add(sign)
    }
    if (town.style === "ashlander" || (town.style === "telvanni" && b.type !== "manor" && b.type !== "temple")) colliders.addCircle(b.x, b.z, town.style === "telvanni" ? b.w * 0.36 : b.w / 2 + 0.2)
    else if (town.style === "redoran") colliders.addBox(b.x, b.z, b.w + 1, b.d + 1, b.rot)
    else if (town.style === "telvanni") colliders.addCircle(b.x, b.z, b.w * 0.4)
    else if (town.style === "nord") colliders.addBox(b.x, b.z, b.w + 0.6, (b.type === "manor" || b.type === "hall" ? b.d * 1.5 : b.d) + 0.6, b.rot)
    else colliders.addBox(b.x, b.z, b.w + 0.2, b.d + 0.2, b.rot)
  }

  // plaza dressing: a well or fire pit, market stall, lamp posts
  const C = new Placer(builder, town.x, town.y, town.z, 0)
  if (town.style === "ashlander" || town.style === "nord") {
    C.add(new THREE.TorusGeometry(0.9, 0.3, 5, seg(10)), MAT.rock(), { pos: [0, 0.15, 0], rot: [Math.PI / 2, 0, 0] })
    C.add(new THREE.ConeGeometry(0.5, 0.9, 6), GLOW, { pos: [0, 0.45, 0] })
  } else {
    C.cyl(1.3, 1.4, 1, MAT.stone(), 0, 0.5, 0, { segs: seg(14) })
    C.add(new THREE.CircleGeometry(1.1, seg(12)), TM("mud", 0x4a6070), { pos: [0, 0.95, 0], rot: [-Math.PI / 2, 0, 0] })
    for (const sx of [-1, 1]) C.box(0.2, 2.6, 0.2, MAT.timber(), sx * 1.1, 1.8, 0)
    C.box(3, 0.2, 1.4, MAT.shingles(), 0, 3.2, 0.3, { rot: [0.3, 0, 0] })
    C.box(3, 0.2, 1.4, MAT.shingles(), 0, 3.2, -0.3, { rot: [-0.3, 0, 0] })
    colliders.addCircle(town.x, town.z, 1.5)
    // market stall
    const sa = 0.9
    const sx0 = Math.cos(sa) * plazaR * 0.55
    const sz0 = Math.sin(sa) * plazaR * 0.55
    const S = new Placer(builder, town.x + sx0, town.y, town.z + sz0, -sa)
    S.box(2.6, 0.9, 1.1, MAT.planks(), 0, 0.45, 0)
    for (const px of [-1.2, 1.2]) for (const pz of [-0.5, 0.5]) S.cyl(0.05, 0.05, 2.4, MAT.timber(), px, 1.2, pz, { segs: 5 })
    S.add(new THREE.PlaneGeometry(3, 1.6, 1, 2), MAT.clothTan(), { pos: [0, 2.45, 0], rot: [-Math.PI / 2 + 0.2, 0, 0], uv: "keep" })
    for (let i = 0; i < 3; i++) S.add(new THREE.SphereGeometry(0.15, 6, 4), TM("parasolCap", 0xffffff), { pos: [-0.6 + i * 0.5, 1, 0] })
    crate(S, 1.8, 0.4, 0.8, 0.4)
    colliders.addCircle(town.x + sx0, town.z + sz0, 1.4)
  }
  // lamp posts around the plaza
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    const lx = Math.cos(a) * plazaR * 0.85
    const lz = Math.sin(a) * plazaR * 0.85
    C.cyl(0.08, 0.1, 3, MAT.timber(), lx, 1.5, lz, { segs: 6 })
    C.box(0.8, 0.08, 0.08, MAT.timber(), lx + 0.35, 3, lz)
    lantern(C, lx + 0.7, 2.6, lz)
  }

  group.add(builder.build())
  const name = makeLabel(town.name, { size: 34, scale: 0.035, color: "#f0dca0" })
  name.position.set(town.x, town.y + 16, town.z)
  group.add(name)

  let strider = null
  if (town.style !== "nord") {
    strider = buildSiltStrider()
    strider.position.set(town.port.x, town.y, town.port.z)
    strider.rotation.y = -town.port.angle
    group.add(strider)
    colliders.addCircle(town.port.x, town.port.z, 1.2)
  }

  const light = new THREE.PointLight(0xffb060, 0, 45, 1.4)
  light.position.set(town.x, town.y + 6, town.z)
  group.add(light)
  return { group, light, glows: [], strider }
}

// ---------------- silt strider ----------------

export function buildSiltStrider() {
  const g = new THREE.Group()
  const body = new THREE.Group()
  const bb = new Builder()
  const shell = TM("chitinShell", 0xc0a080)
  const flesh = TM("hide", 0x9a7a60)
  // segmented carapace
  for (let i = 0; i < 5; i++) {
    const z = -3.2 + i * 1.6
    const r = 2.6 - Math.abs(i - 2) * 0.35
    const seg1 = new THREE.SphereGeometry(1, seg(16), seg(10), 0, Math.PI * 2, 0, Math.PI * 0.62)
    bb.add(seg1, shell, { pos: [0, 0, z], scale: [r, r * 0.85, 1.25], uv: 2 })
  }
  bb.add(new THREE.SphereGeometry(1, seg(16), seg(10)), flesh, { pos: [0, -0.6, 0], scale: [2.2, 1.6, 4.8], uv: 2 })
  // head with a trumpet mouth
  bb.add(new THREE.SphereGeometry(1, seg(12), 8), shell, { pos: [0, -0.9, 5.2], scale: [1.2, 1, 1.6], uv: 1.5 })
  bb.add(lathe([[0.3, 0], [0.6, 0.8], [1.1, 1.4], [1.2, 1.5]], seg(12)), flesh, { pos: [0, -1.2, 6.3], rot: [Math.PI / 2, 0, 0] })
  for (const sx of [-1, 1]) bb.add(new THREE.SphereGeometry(0.22, 8, 6), TM("chitin", 0x222222), { pos: [sx * 0.8, -0.5, 5.9] })
  // saddle cabin with rails
  bb.add(new THREE.BoxGeometry(2.4, 0.2, 3.2), TM("planks", 0xffffff), { pos: [0, 2.2, -0.5] })
  for (const sx of [-1, 1]) bb.add(new THREE.BoxGeometry(0.1, 0.7, 3.2), TM("wood", 0xffffff), { pos: [sx * 1.2, 2.6, -0.5] })
  const bodyMesh = bb.build()
  body.add(bodyMesh)
  body.position.y = 13
  g.add(body)
  // six long jointed legs
  const lb = new Builder()
  const legMat = TM("chitin", 0x8a6a4a)
  for (const [sx, sz] of [[-1, 1.2], [1, 1.2], [-1, -0.2], [1, -0.2], [-1, -1.6], [1, -1.6]]) {
    const hip = V3(sx * 1.8, 12.5, sz * 2)
    const knee = V3(sx * 6.5, 15.5, sz * 3.2)
    const foot = V3(sx * 5.5, 0, sz * 5)
    lb.add(taperTube([hip, hip.clone().lerp(knee, 0.5).add(V3(0, 1, 0)), knee], 0.35, 0.25, 7, 8), legMat, { uv: 2 })
    lb.add(taperTube([knee, knee.clone().lerp(foot, 0.4).add(V3(sx * 0.5, 0, 0)), foot], 0.25, 0.08, 7, 10), legMat, { uv: 2 })
    lb.add(new THREE.SphereGeometry(0.4, 8, 6), legMat, { pos: [knee.x, knee.y, knee.z] })
  }
  g.add(lb.build())
  g.userData.body = body
  return g
}

export function placeLimb(mesh, a, b) {
  const dir = new THREE.Vector3().subVectors(b, a)
  const len = dir.length()
  mesh.scale.set(1, len / (mesh.geometry.parameters.height || 1), 1)
  mesh.position.copy(a).addScaledVector(dir, 0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
}

// ---------------- dungeon entrances ----------------

export function buildEntrance(d, colliders) {
  const rot = (d.seed % 628) / 100 || 0
  const builder = new Builder()
  const P = new Placer(builder, d.x, d.y, d.z, rot)
  const group = new THREE.Group()
  if (d.type === "cave") {
    for (const [x, y, z, s] of [[-2.8, 1.4, 0, 1.6], [2.8, 1.4, 0, 1.6], [0, 4.4, 0.3, 1.9], [-3.6, 0.8, 1.8, 1.4], [3.4, 0.9, 1.9, 1.3], [0, 2, 2.6, 2.4]])
      P.add(rockGeometry(x * 7 + z, 2, 1, 0.4), MAT.rock(), { pos: [x, y, z], scale: [s * 1.2, s * 1.4, s], uv: 2 })
    P.box(2.8, 3.6, 0.2, TM("mud", 0x111111), 0, 1.8, -0.6)
    P.box(0.14, 2.6, 0.14, MAT.timber(), -1.2, 1.3, -1)
    P.box(0.14, 2.6, 0.14, MAT.timber(), 1.2, 1.3, -1)
    P.box(2.8, 0.18, 0.18, MAT.timber(), 0, 2.6, -1)
    lantern(P, 1.5, 2.2, -1.2)
  } else if (d.tower) {
    buildVelothiTower(P)
  } else if (d.type === "tomb") {
    P.add(rockGeometry(d.seed % 97, 2, 4, 0.2), TM("grass", 0xa0a080), { pos: [0, -0.4, 2], scale: [1.1, 0.55, 1.1], uv: 3 })
    P.box(4.2, 3.8, 1.4, MAT.tomb(), 0, 1.7, -1.6)
    P.box(4.8, 0.5, 1.8, MAT.sandstone(), 0, 3.8, -1.6)
    P.add(new THREE.CylinderGeometry(1, 1, 0.5, 3), MAT.sandstone(), { pos: [0, 4.35, -1.6], rot: [-Math.PI / 2, 0, 0], scale: [2.6, 1, 0.8] })
    for (const sx of [-1, 1]) P.cyl(0.25, 0.3, 3.4, MAT.sandstone(), sx * 1.5, 1.7, -2.4, { segs: seg(8) })
    P.box(1.8, 2.6, 0.2, MAT.planks(), 0, 1.4, -2.35)
    for (let i = 0; i < 3; i++) P.box(3 - i * 0.3, 0.2, 0.6, MAT.sandstone(), 0, 0.1 + i * 0.2 - 0.4, -3.2 + i * 0.4)
    P.add(new THREE.SphereGeometry(0.4, 8, 6), TM("bone", 0xe0d8c0), { pos: [0, 3.2, -2.35], scale: [1, 1.1, 0.5] })
  } else if (d.type === "barrow") {
    // a snowy burial mound ringed by standing stones, with a carved stone door
    P.add(rockGeometry(d.seed % 89, 2, 4, 0.2), TM("snow", 0xffffff), { pos: [0, -0.6, 2.5], scale: [1.4, 0.7, 1.4], uv: 3 })
    P.box(4, 3.4, 1.2, MAT.darkStone(), 0, 1.5, -1.6)
    P.box(4.8, 0.6, 1.6, MAT.darkStone(), 0, 3.4, -1.6)
    for (const sx of [-1, 1]) P.box(0.7, 3.8, 0.7, MAT.darkStone(), sx * 2.1, 1.9, -2.2)
    P.box(1.9, 2.6, 0.2, MAT.stone(), 0, 1.3, -2.25)
    P.add(new THREE.TorusGeometry(0.45, 0.07, 4, seg(12)), MAT.iron(), { pos: [0, 1.6, -2.4] })
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3
      P.box(0.6, 2.4 + (i % 3) * 0.5, 0.4, MAT.darkStone(), Math.cos(a) * 6.5, 1, Math.sin(a) * 6.5 + 2, { rot: [0, a, (i % 2 ? 1 : -1) * 0.06] })
    }
  } else if (d.type === "dwemer") {
    P.add(lathe([[3.6, 0], [3.4, 1.6], [2.4, 3.2], [0.6, 3.9], [0.01, 4]], seg(20)), MAT.dwemer(), { pos: [0, 0, 1.5], uv: 2 })
    P.box(3.6, 4, 1.6, MAT.dwemer(), 0, 2, -1.4)
    P.box(4.2, 0.6, 2, MAT.dwemer(), 0, 4.2, -1.4)
    P.box(2, 2.9, 0.2, TM("dwemerFloor", 0x8a6a3a, { metal: true }), 0, 1.5, -2.25)
    for (const sx of [-1, 1]) {
      P.cyl(0.32, 0.32, 7, MAT.dwemer(), sx * 2.4, 3.5, 0.5, { segs: seg(10) })
      P.cyl(0.5, 0.4, 0.5, MAT.dwemer(), sx * 2.4, 7, 0.5, { segs: seg(10) })
      P.add(new THREE.TorusGeometry(0.4, 0.08, 5, seg(12)), MAT.dwemer(), { pos: [sx * 2.4, 5, 0.5], rot: [Math.PI / 2, 0, 0] })
    }
    P.add(new THREE.TorusGeometry(1.1, 0.25, 6, 12), MAT.dwemer(), { pos: [0, 3.2, -2.3] })
    lantern(P, 1.6, 3, -2.4)
    for (const [x, z, r] of buildDwemerRuins(P, d.seed)) colliders.addCircle(d.x + x * Math.cos(rot) + z * Math.sin(rot), d.z - x * Math.sin(rot) + z * Math.cos(rot), r)
  } else {
    const big = d.type === "citadel" ? 1.8 : 1
    const stone = d.type === "citadel" ? MAT.flesh() : MAT.daedric()
    for (const sx of [-1, 1]) {
      P.box(1.4 * big, 7.5 * big, 1.4 * big, MAT.daedric(), sx * 2.8 * big, 3.75 * big, 0)
      P.add(new THREE.ConeGeometry(0.9 * big, 2.6 * big, 4), MAT.daedric(), { pos: [sx * 2.8 * big, 8.6 * big, 0] })
      for (let k = 0; k < 3; k++) P.add(new THREE.ConeGeometry(0.2 * big, 1.2 * big, 4), MAT.daedric(), { pos: [sx * (2.8 + 0.8) * big, (2 + k * 2) * big, 0], rot: [0, 0, -sx * 1.2] })
    }
    P.box(7.2 * big, 1.2 * big, 1.6 * big, stone, 0, 7.4 * big, 0)
    P.add(lathe([[1.4 * big, 0], [1 * big, 1 * big], [0.1, 1.8 * big]], 4), MAT.daedric(), { pos: [0, 8 * big, 0] })
    for (let i = 0; i < 4; i++) P.box(6 * big - i * 0.5, 0.35, 1, MAT.daedric(), 0, 0.17 + i * 0.35 - 0.5, -1.2 - i * 0.5)
    P.box(1.8, 1, 1, MAT.daedric(), 3.5 * big + 2, 0.5, -2)
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(4 * big, 6 * big), new THREE.MeshBasicMaterial({ color: d.type === "citadel" ? 0x8a1a08 : 0x1a0808, side: THREE.DoubleSide }))
    portal.position.set(0, 3 * big, -0.1)
    const holder = new THREE.Group()
    holder.position.set(d.x, d.y, d.z)
    holder.rotation.y = rot
    holder.add(portal)
    if (d.type === "citadel") {
      const glow = new THREE.PointLight(0xff4010, 20, 30, 1.5)
      glow.position.set(0, 4, -3)
      holder.add(glow)
    }
    group.add(holder)
  }
  group.add(builder.build())
  colliders.addCircle(d.x + Math.sin(rot) * (d.tower ? 0.6 : 1.2), d.z + Math.cos(rot) * (d.tower ? 0.6 : 1.2), d.type === "citadel" ? 3.5 : d.tower ? 3.3 : 2.2)
  const doorPos = new THREE.Vector3(d.x - Math.sin(rot) * 3, d.y + 1.5, d.z - Math.cos(rot) * 3)
  return { group, doorPos }
}
