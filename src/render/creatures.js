import * as THREE from "three"
import { characterAtlas, atlasUV } from "./texgen.js"
import { Builder, lathe, taperTube } from "./geom.js"
import { npcWeapon, buildShield } from "./items.js"
import { Q, seg } from "../core/quality.js"

// ---------------------------------------------------------------------------
// Characters and creatures share one atlas material; colour comes from vertex
// colours so a whole body segment is a single draw call.
// ---------------------------------------------------------------------------
let MAT = null
let GHOST = null
const EYE_MATS = new Map()
function mats() {
  if (!MAT) {
    const a = characterAtlas()
    MAT = new THREE.MeshLambertMaterial({ map: a.map, normalMap: a.normalMap, vertexColors: true })
    GHOST = new THREE.MeshLambertMaterial({ map: a.map, vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, emissive: 0x203040 })
  }
  return { MAT, GHOST }
}
function eyeMat(color) {
  if (!EYE_MATS.has(color)) EYE_MATS.set(color, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5) }))
  return EYE_MATS.get(color)
}

const V3 = (x, y, z) => new THREE.Vector3(x, y, z)
const shade = (c, f) => new THREE.Color(c).multiplyScalar(f).getHex()

// A body segment: parts merged into one mesh, attached to a pivot.
class Seg {
  constructor(ghost = false) {
    this.b = new Builder()
    this.ghost = ghost
    this.extra = []
  }
  add(geo, tile, color, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) {
    atlasUV(geo, tile)
    const { MAT, GHOST } = mats()
    this.b.add(geo, this.ghost ? GHOST : MAT, { pos, rot, scale, uv: "keep", color })
    return this
  }
  glow(geo, color, pos) {
    this.b.add(geo, eyeMat(color), { pos, uv: "keep" })
    return this
  }
  into(pivot) {
    const g = this.b.build({ castShadow: Q.charShadows, receiveShadow: false })
    for (const c of [...g.children]) pivot.add(c)
    return pivot
  }
}

const sphere = (r, w = 12, h = 10) => new THREE.SphereGeometry(r, seg(w), seg(h))
const cyl = (rt, rb, h, s = 8) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg(s))
  return g
}
// limb segment hanging down from its pivot
const limbGeo = (len, r0, r1, s = 8) => {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg(s), 2)
  g.translate(0, -len / 2, 0)
  return g
}

const FACE_MATS = new Map()
function faceMat(color) {
  if (!FACE_MATS.has(color)) FACE_MATS.set(color, new THREE.MeshLambertMaterial({ color }))
  return FACE_MATS.get(color)
}
const hcol = o => o.hair

function pivot(parent, x, y, z) {
  const p = new THREE.Group()
  p.position.set(x, y, z)
  parent.add(p)
  return p
}

// ---------------------------------------------------------------------------
// Humanoid
// ---------------------------------------------------------------------------
// opts: skin, cloth, cloth2, pants, boots, hair, hairStyle, eye, race, female,
//       robe, armor ("bonemold"|"chain"|"daedric"|"plate"|"chitin"), helm,
//       weapon (base name) | null, weaponColor, shield, thin, bulk, bigHead,
//       tentacles, mask, horns, tail, skull, ghost, float, wheel, wings
function humanoid(o) {
  const ghost = !!o.ghost
  const root = new THREE.Group()
  const hips = pivot(root, 0, 0.96, 0)
  const thin = o.thin ? 0.55 : 1
  const bulk = o.bulk || 1
  const fem = o.female ? 1 : 0
  const skinTile = o.race === "argonian" ? "scales" : o.race === "khajiit" ? "fur" : o.skull ? "bone" : "skin"
  const torsoTile = o.armor === "chain" ? "chainmail" : o.armor === "plate" || o.armor === "daedric" ? "plate" : o.armor === "bonemold" ? "bonemold" : o.armor === "brass" ? "brass" : o.robe ? "robe" : "fabricTrim"

  // ---- torso ----
  const torso = pivot(hips, 0, 0, 0)
  const T = new Seg(ghost)
  const tw = (1.1 - fem * 0.12) * bulk * thin
  if (o.skull) {
    for (let i = 0; i < 5; i++) T.add(new THREE.TorusGeometry(0.13 - Math.abs(i - 2) * 0.012, 0.012, 4, seg(10)), "bone", o.skin, { pos: [0, 0.26 + i * 0.055, 0], rot: [Math.PI / 2, 0, 0], scale: [1.1, 0.75, 1] })
    T.add(cyl(0.02, 0.02, 0.6), "bone", o.skin, { pos: [0, 0.3, -0.06] })
    T.add(sphere(0.1), "bone", o.skin, { scale: [1.3, 0.5, 0.9] })
  } else {
    const prof = [[0.13 + fem * 0.03, -0.02], [0.155 + fem * 0.03, 0.1], [0.14 - fem * 0.015, 0.24], [0.175, 0.4], [0.18, 0.48], [0.12, 0.56], [0.05, 0.59]]
    T.add(lathe(prof, seg(12)), torsoTile, o.cloth, { scale: [tw * 1.05, 1, 0.72 * bulk] })
    if (fem && !o.armor && !o.robe) for (const sx of [-1, 1]) T.add(sphere(0.06, 8, 6), torsoTile, o.cloth, { pos: [sx * 0.07, 0.4, 0.09], scale: [1, 0.9, 0.8] })
    // belt with buckle
    T.add(new THREE.TorusGeometry(0.155 + fem * 0.02, 0.018, 4, seg(14)), "leather", 0x4a3020, { pos: [0, 0.08, 0], rot: [Math.PI / 2, 0, 0], scale: [tw, 0.72 * bulk / 1, 1] })
    T.add(new THREE.BoxGeometry(0.05, 0.04, 0.02), "brass", 0xc8a040, { pos: [0, 0.08, 0.12 * bulk] })
    if (o.armor) {
      // pauldrons and a plated chest overlay
      const ptile = o.armor === "chain" ? "plate" : torsoTile
      for (const sx of [-1, 1]) {
        const g = sphere(0.1, 10, 8)
        T.add(g, ptile, o.armorColor ?? o.cloth, { pos: [sx * 0.2 * tw, 0.52, 0], scale: [1.2, 0.7, 1.1] })
        if (o.armor === "daedric" || o.armor === "bonemold") T.add(new THREE.ConeGeometry(0.03, 0.12, 4), ptile, o.armorColor ?? o.cloth, { pos: [sx * 0.24 * tw, 0.6, 0], rot: [0, 0, -sx * 0.6] })
      }
      T.add(lathe([[0.16, 0.22], [0.19, 0.4], [0.17, 0.5], [0.1, 0.56]], seg(12)), ptile, o.armorColor ?? o.cloth, { scale: [tw * 1.12, 1, 0.8 * bulk] })
    }
    if (o.robe || o.skirt) {
      const len = o.robe ? 0.92 : 0.42
      T.add(lathe([[0.16, 0.12], [0.2, 0], [0.24 + len * 0.1, -len * 0.6], [0.27 + len * 0.12, -len]], seg(14)), o.robe ? "robe" : torsoTile, o.cloth2 ?? o.cloth, { scale: [tw, 1, 0.85] })
    }
    if (o.hood) T.add(sphere(0.16, 10, 8), "robe", o.cloth2 ?? o.cloth, { pos: [0, 0.66, -0.04], scale: [1, 0.9, 1.05] })
  }
  if (o.wings) {
    for (const sx of [-1, 1]) {
      // bat-like wing: scalloped trailing edge between finger struts
      const s = new THREE.Shape()
      s.moveTo(0, 0)
      s.lineTo(0.35, 0.55)
      s.lineTo(1.0, 0.75)
      s.quadraticCurveTo(0.85, 0.35, 0.95, 0.1)
      s.quadraticCurveTo(0.7, 0.05, 0.62, -0.35)
      s.quadraticCurveTo(0.4, -0.2, 0.3, -0.7)
      s.quadraticCurveTo(0.15, -0.3, 0, -0.2)
      const w = new THREE.ShapeGeometry(s, 6)
      w.scale(sx, 1, 1)
      const pos = w.attributes.position
      const uv = w.attributes.uv
      for (let i = 0; i < pos.count; i++) uv.setXY(i, Math.abs(pos.getX(i)), pos.getY(i) * 0.5 + 0.5)
      T.add(w, "membrane", o.wingColor ?? 0x3a5a8a, { pos: [sx * 0.08, 0.42, -0.12], rot: [0.2, sx * 0.5, 0] })
      const back = w.clone()
      back.scale(1, 1, -1)
      T.add(back, "membrane", o.wingColor ?? 0x3a5a8a, { pos: [sx * 0.08, 0.42, -0.125], rot: [0.2, sx * 0.5, 0] })
      for (const [ex, ey] of [[0.35, 0.55], [1.0, 0.75], [0.62, -0.35]]) T.add(taperTube([V3(0, 0, 0), V3(sx * ex * 0.5, ey * 0.5 + 0.05, 0), V3(sx * ex, ey, 0)], 0.02, 0.006, 4, 4), "bone", 0x2a2a3a, { pos: [sx * 0.08, 0.42, -0.12], rot: [0.2, sx * 0.5, 0] })
    }
  }
  T.into(torso)

  // ---- head ----
  const neck = pivot(torso, 0, 0.58, 0)
  const H = new Seg(ghost)
  const hs = (o.bigHead ? 1.45 : 1) * (o.skull ? 0.95 : 1)
  H.add(cyl(0.045, 0.05, 0.1), skinTile, o.skin, { pos: [0, 0.03, 0] })
  const headY = 0.14 * hs
  const faceTile = o.race === "argonian" ? "scales" : o.race === "khajiit" ? "fur" : o.skull ? "bone" : "face"
  // face shape: nose, jaw, brow, chin and markings vary from person to person
  const F = { nose: 1, jaw: 1, brow: 1, chin: 1, ...(o.face || {}) }
  H.add(sphere(0.1, 14, 12), faceTile, o.skin, { pos: [0, headY, 0], scale: [0.95 * hs * F.jaw, 1.12 * hs, 1.02 * hs] })
  const eyeY = headY + 0.018 * hs
  const eyeZ = 0.088 * hs
  const eyeCol = o.eye ?? 0x1a1208
  if (o.race === "argonian") {
    H.add(sphere(0.08, 10, 8), "scales", o.skin, { pos: [0, headY - 0.03, 0.08], scale: [0.8, 0.65, 1.3] })
    for (let i = 0; i < 4; i++) H.add(new THREE.ConeGeometry(0.02, 0.12, 4), "scales", shade(o.skin, 0.75), { pos: [(i - 1.5) * 0.04, headY + 0.1, -0.06], rot: [-0.9, 0, (i - 1.5) * 0.3] })
  } else if (o.race === "khajiit") {
    H.add(sphere(0.05, 8, 6), "fur", shade(o.skin, 1.1), { pos: [0, headY - 0.04, 0.085], scale: [1.1, 0.8, 0.9] })
    H.add(sphere(0.012, 6, 4), "skin", 0x2a1a1a, { pos: [0, headY - 0.02, 0.13] })
    for (const sx of [-1, 1]) H.add(new THREE.ConeGeometry(0.035, 0.08, 4), "fur", o.skin, { pos: [sx * 0.06, headY + 0.1, -0.01], rot: [0, 0, -sx * 0.25] })
  } else if (!o.skull) {
    H.add(new THREE.ConeGeometry(0.018, 0.05, 5), faceTile, shade(o.skin, 0.95), { pos: [0, headY - 0.005, 0.1 * hs], rot: [Math.PI / 2 - 0.3, 0, 0], scale: [F.nose, F.nose * (F.noseLong || 1), F.nose] })
    // chin and cheekbones
    H.add(sphere(0.032, 8, 6), faceTile, o.skin, { pos: [0, headY - 0.085 * hs, 0.06 * hs], scale: [1.3 * F.chin * F.jaw, 0.8, 0.9] })
    if (F.cheeks) for (const sx of [-1, 1]) H.add(sphere(0.025, 6, 5), faceTile, o.skin, { pos: [sx * 0.05 * hs, headY - 0.01, 0.07 * hs], scale: [1, 0.7, 0.8] })
    // war paint and tattoos (Dunmer and Ashlanders especially), and scars
    if (F.tattoo) for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) H.add(new THREE.BoxGeometry(0.006, 0.05, 0.004), "plain", F.tattoo, { pos: [sx * (0.03 + k * 0.014) * hs, headY - 0.028, 0.089 * hs - k * 0.004], rot: [0, 0, sx * 0.15] })
    if (F.scar) H.add(new THREE.BoxGeometry(0.005, 0.06, 0.004), "plain", shade(o.skin, 0.6), { pos: [F.scar * 0.034 * hs, eyeY + 0.005, 0.092 * hs], rot: [0, 0, F.scar * 0.35] })
    if (F.mustache && hcol(o) !== undefined) H.add(new THREE.BoxGeometry(0.06, 0.012, 0.012), "hair", hcol(o), { pos: [0, headY - 0.042 * hs, 0.093 * hs], scale: [1, 1, 1] })
    if (o.elf) for (const sx of [-1, 1]) H.add(new THREE.ConeGeometry(0.018, 0.1, 4), "skin", o.skin, { pos: [sx * 0.095 * hs, headY + 0.03, -0.01], rot: [0, 0, -sx * 1.1] })
    else for (const sx of [-1, 1]) H.add(sphere(0.022, 6, 5), "skin", o.skin, { pos: [sx * 0.093 * hs, headY, -0.005], scale: [0.5, 1, 0.8] })
    if (o.race === "orc") {
      for (const sx of [-1, 1]) H.add(new THREE.ConeGeometry(0.008, 0.035, 4), "bone", 0xe8e0c8, { pos: [sx * 0.025, headY - 0.06, 0.085] })
      H.add(new THREE.BoxGeometry(0.15, 0.022, 0.03), "skin", shade(o.skin, 0.8), { pos: [0, eyeY + 0.03, 0.078] })
    }
    // brows
    if (o.hair !== undefined) for (const sx of [-1, 1]) H.add(new THREE.BoxGeometry(0.035, 0.008 * F.brow, 0.01 * F.brow), "hair", o.hair, { pos: [sx * 0.035, eyeY + 0.025, eyeZ + 0.005], rot: [0, 0, sx * (0.15 + (F.browTilt || 0))] })
  }
  if (o.tentacles) for (let i = 0; i < 6; i++) H.add(taperTube([V3((i - 2.5) * 0.02, headY - 0.05, 0.08), V3((i - 2.5) * 0.03, headY - 0.15, 0.12), V3((i - 2.5) * 0.02, headY - 0.26, 0.1)], 0.014, 0.004, 4, 5), "flesh", shade(o.skin, 0.8))
  if (o.mask) {
    H.add(sphere(0.1, 12, 10, 0, Math.PI), "brass", 0xd8b040, { pos: [0, headY, 0.02], scale: [1, 1.2, 0.9] })
    for (const sx of [-1, 1]) H.add(new THREE.ConeGeometry(0.02, 0.18, 4), "brass", 0xd8b040, { pos: [sx * 0.07, headY + 0.14, 0.02], rot: [0, 0, -sx * 0.4] })
  }
  if (o.horns) for (const sx of [-1, 1]) H.add(taperTube([V3(sx * 0.06, headY + 0.07, 0), V3(sx * 0.12, headY + 0.16, -0.03), V3(sx * 0.1, headY + 0.26, -0.1)], 0.022, 0.004, 5, 6), "chitin", 0x2a1a14)
  // hair styles
  const hc = o.hair
  if (hc !== undefined && !o.helm && !o.hood) {
    const st = o.hairStyle || "short"
    if (st !== "bald") H.add(sphere(0.105, 12, 8), "hair", hc, { pos: [0, headY + 0.03, -0.012], scale: [1.0 * hs, 0.9 * hs, 1.05 * hs] })
    if (st === "long") H.add(lathe([[0.1, 0], [0.11, -0.12], [0.08, -0.26]], seg(10)), "hair", hc, { pos: [0, headY + 0.02, -0.02], scale: [1, 1, 0.8] })
    if (st === "crest") for (let i = 0; i < 4; i++) H.add(new THREE.BoxGeometry(0.03, 0.07, 0.05), "hair", hc, { pos: [0, headY + 0.12, 0.05 - i * 0.05] })
    if (st === "tail") H.add(taperTube([V3(0, headY + 0.04, -0.1), V3(0, headY - 0.05, -0.15), V3(0, headY - 0.2, -0.14)], 0.03, 0.01, 5, 6), "hair", hc)
    if (o.beard) H.add(sphere(0.07, 10, 8), "hair", hc, { pos: [0, headY - 0.08, 0.05], scale: [0.95, 1.1, 0.8] })
  }
  if (o.helm) {
    H.add(sphere(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), o.helmTile || "bonemold", o.helm, { pos: [0, headY + 0.01, 0], scale: [1.02 * hs, 1.05, 1.08] })
    H.add(new THREE.TorusGeometry(0.12, 0.014, 4, seg(14)), o.helmTile || "bonemold", shade(o.helm, 0.8), { pos: [0, headY - 0.01, 0], rot: [Math.PI / 2, 0, 0], scale: [1.1, 1.15, 1] })
    if (o.helmCrest) H.add(new THREE.BoxGeometry(0.02, 0.08, 0.2), o.helmTile || "bonemold", shade(o.helm, 0.85), { pos: [0, headY + 0.13, 0] })
  }
  if (o.skull || o.glowEyes) {
    for (const sx of [-1, 1]) H.glow(sphere(0.014, 6, 4), o.glowEyes ?? 0xff6a20, [sx * 0.034 * hs, eyeY, eyeZ])
  } else {
    for (const sx of [-1, 1]) {
      H.add(sphere(0.014, 6, 5), "plain", 0xf0ece0, { pos: [sx * 0.034 * hs, eyeY, eyeZ - 0.004], scale: [1.2, 0.8, 0.6] })
      H.glow(sphere(0.008, 6, 4), eyeCol, [sx * 0.034 * hs, eyeY, eyeZ + 0.002])
    }
  }
  const head = pivot(neck, 0, 0, 0)
  H.into(head)
  // eyelids that blink and a mouth that moves when they talk
  const face = {}
  if (!o.skull && !o.glowEyes && !o.mask && !ghost) {
    const lidMat = faceMat(o.skin)
    face.lids = [-1, 1].map(sx => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.0165, 8, 6), lidMat)
      m.position.set(sx * 0.034 * hs, eyeY + 0.002, eyeZ - 0.001)
      m.scale.set(1.25, 0.05, 0.75)
      head.add(m)
      return m
    })
    if (o.race !== "argonian" && o.race !== "khajiit") {
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.007, 0.01), faceMat(0x3a1814))
      mouth.position.set(0, headY - 0.056 * hs, 0.093 * hs)
      head.add(mouth)
      face.mouth = mouth
      face.mouthY = mouth.position.y
    }
  }

  // ---- arms ----
  const arms = []
  for (const sx of [-1, 1]) {
    const sh = pivot(torso, sx * (0.2 * tw + 0.03), 0.52, 0)
    const up = new Seg(ghost)
    const armTile = o.armor ? (o.armor === "chain" ? "chainmail" : torsoTile) : o.robe ? "robe" : "fabric"
    const aw = 0.048 * bulk * thin
    up.add(sphere(aw * 1.15, 8, 6), armTile, o.cloth, {})
    up.add(limbGeo(0.29, aw, aw * 0.85), armTile, o.sleeves === false ? o.skin : o.cloth, {})
    up.into(sh)
    const el = pivot(sh, 0, -0.29, 0)
    const lo = new Seg(ghost)
    lo.add(limbGeo(0.26, aw * 0.85, aw * 0.65), o.gloves ? "leather" : o.robe ? "robe" : skinTile, o.gloves ? 0x4a3020 : o.robe ? o.cloth : o.skin, {})
    if (o.armor) lo.add(limbGeo(0.14, aw * 1.05, aw * 0.95), torsoTile, o.armorColor ?? o.cloth, { pos: [0, -0.1, 0] })
    lo.add(new THREE.BoxGeometry(0.055, 0.085, 0.03), skinTile, o.skin, { pos: [0, -0.3, 0.005] })
    lo.add(new THREE.BoxGeometry(0.018, 0.045, 0.018), skinTile, o.skin, { pos: [-sx * 0.03, -0.28, 0.02], rot: [0, 0, sx * 0.5] })
    if (o.claws) for (let i = 0; i < 3; i++) lo.add(new THREE.ConeGeometry(0.008, 0.05, 4), "bone", 0x2a1a14, { pos: [(i - 1) * 0.018, -0.36, 0.01], rot: [Math.PI, 0, 0] })
    lo.into(el)
    arms.push({ sh, el, sx })
  }
  if (o.weapon) {
    const w = npcWeapon(o.weapon, o.weaponMaterial, o.weaponColor)
    w.position.set(0, -0.3, 0.03)
    w.rotation.x = Math.PI / 2 - 0.2
    arms[1].el.add(w)
  }
  if (o.shield) {
    const s = buildShield({ material: o.shield, color: o.shieldColor })
    s.scale.setScalar(0.85)
    s.position.set(-0.06, -0.2, 0.05)
    s.rotation.y = -Math.PI / 2 + 0.2
    arms[0].el.add(s)
  }

  // ---- legs ----
  const legs = []
  if (o.float) {
    // wisp tail instead of legs
    const L = new Seg(ghost)
    L.add(lathe([[0.18, 0], [0.2, -0.3], [0.14, -0.7], [0.02, -1.0]], seg(12)), "robe", o.cloth, {})
    L.into(pivot(hips, 0, 0, 0))
  } else if (o.wheel) {
    const L = new Seg(ghost)
    L.add(new THREE.TorusGeometry(0.42, 0.12, seg(8), seg(18)), "brass", shade(o.cloth, 0.8), { pos: [0, -0.52, 0], rot: [0, Math.PI / 2, 0] })
    L.add(cyl(0.08, 0.08, 0.5), "brass", o.cloth, { pos: [0, -0.52, 0], rot: [0, 0, Math.PI / 2] })
    L.add(cyl(0.1, 0.14, 0.5), "brass", o.cloth, { pos: [0, -0.25, 0] })
    L.into(pivot(hips, 0, 0, 0))
  } else {
    for (const sx of [-1, 1]) {
      const hp = pivot(hips, sx * (0.085 + fem * 0.015) * bulk, 0, 0)
      const lw = 0.07 * bulk * thin
      const th = new Seg(ghost)
      const pantsTile = o.armor === "chain" ? "chainmail" : o.armor ? torsoTile : o.skull ? "bone" : "fabric"
      th.add(limbGeo(0.46, lw, lw * 0.78), pantsTile, o.pants ?? o.cloth, {})
      th.into(hp)
      const kn = pivot(hp, 0, -0.46, 0)
      const sh = new Seg(ghost)
      sh.add(limbGeo(0.42, lw * 0.78, lw * 0.6), o.skull ? "bone" : "fabric", o.pants ?? o.cloth, {})
      if (!o.skull) {
        sh.add(limbGeo(0.24, lw * 0.9, lw * 0.8), o.digitigrade ? skinTile : "leather", o.boots ?? 0x3a2818, { pos: [0, -0.2, 0] })
        sh.add(new THREE.BoxGeometry(0.09, 0.07, 0.2), o.digitigrade ? skinTile : "leather", o.boots ?? 0x3a2818, { pos: [0, -0.43, 0.04] })
      } else sh.add(new THREE.BoxGeometry(0.06, 0.03, 0.16), "bone", o.skin, { pos: [0, -0.43, 0.03] })
      if (o.armor && o.armor !== "chain") sh.add(sphere(0.055, 8, 6), torsoTile, o.armorColor ?? o.cloth, { pos: [0, 0, 0.04], scale: [1, 1, 0.7] })
      sh.into(kn)
      legs.push({ hp, kn, phase: sx > 0 ? 0 : Math.PI })
    }
  }
  if (o.tail) {
    const tl = pivot(hips, 0, 0.02, -0.12)
    const S = new Seg(ghost)
    S.add(taperTube([V3(0, 0, 0), V3(0, -0.25, -0.2), V3(0, -0.55, -0.35), V3(0, -0.8, -0.3)], 0.05, 0.01, 6, 10), skinTile, o.skin, {})
    S.into(tl)
    legs.tail = tl
  }

  const baseY = o.float ? 1.45 : o.wheel ? 1.0 : 0.96
  hips.position.y = baseY
  const hunch = o.hunch || 0
  torso.rotation.x = hunch
  return {
    root,
    head,
    rig: { hips, torso, head, arms, legs, face },
    // x (all optional): variant 0 overhead / 1 sweep / 2 thrust, flinch 0..1,
    // dying 0..1 (knees buckle), ik [left, right] foot lift in metres,
    // look (head yaw toward someone), seed (desynchronises idle fidgets)
    anim(t, move, attack, x = {}) {
      const w = t * 8
      const dying = x.dying || 0
      const flinch = x.flinch || 0
      for (const L of legs) {
        const s = Math.sin(w + L.phase)
        L.hp.rotation.x = -s * 0.55 * move
        L.kn.rotation.x = Math.max(0, Math.cos(w + L.phase)) * 0.9 * move + 0.05
      }
      // feet meet the ground: bend the uphill leg (two equal segments)
      if (x.ik && legs.length === 2) {
        legs.forEach((L, i) => {
          const lift = Math.min(0.5, x.ik[i] || 0)
          if (lift < 0.01) return
          const th = Math.acos(Math.max(0.3, 1 - lift / 0.88))
          L.hp.rotation.x -= th
          L.kn.rotation.x += th * 2
        })
      }
      if (legs.tail) legs.tail.rotation.y = Math.sin(t * 2) * 0.3
      const [left, right] = arms
      left.sh.rotation.x = Math.sin(w) * 0.5 * move
      left.el.rotation.x = -0.25 - Math.max(0, Math.sin(w)) * 0.3 * move
      left.sh.rotation.z = -0.08
      right.el.rotation.x = -0.25 - attack * 0.6
      torso.rotation.y = Math.sin(w) * 0.08 * move
      const v = x.variant || 0
      if (v === 1) {
        // side sweep: arm out wide, torso winds up and uncoils
        right.sh.rotation.x = -Math.sin(w) * 0.5 * move - attack * 1.2
        right.sh.rotation.z = 0.08 + attack * 1.3
        torso.rotation.y += -attack * 0.55
      } else if (v === 2) {
        // thrust: arm drawn back level, then driven forward
        right.sh.rotation.x = -Math.sin(w) * 0.5 * move - attack * 1.45
        right.sh.rotation.z = 0.08 + attack * 0.15
        right.el.rotation.x = -0.25 - attack * 1.4
        torso.rotation.y += attack * 0.35
      } else {
        right.sh.rotation.x = -Math.sin(w) * 0.5 * move - attack * 2.2
        right.sh.rotation.z = 0.08 + attack * 0.4
      }
      hips.position.y = baseY + (o.float ? Math.sin(t * 2) * 0.1 : Math.abs(Math.sin(w)) * 0.035 * move)
      hips.rotation.z = 0
      torso.rotation.x = hunch + attack * 0.25 - flinch * 0.35
      torso.scale.y = 1 + Math.sin(t * 1.6) * 0.008
      head.rotation.x = -flinch * 0.3
      // idle life: glances, weight shifts and the odd gesture
      const idle = move < 0.1 && attack < 0.05 && !dying && x.talk == null ? 1 : 0
      if (x.look != null) head.rotation.y = Math.max(-0.9, Math.min(0.9, x.look))
      else head.rotation.y = idle ? Math.sin(t * 0.37) * 0.4 + Math.sin(t * 1.3) * 0.05 : 0
      if (idle) {
        hips.rotation.z = Math.sin(t * 0.45) * 0.035
        torso.rotation.z = -Math.sin(t * 0.45) * 0.025
        const cyc = (t + (x.seed || 0)) % 13
        if (cyc < 1.8) {
          const g = Math.sin((cyc / 1.8) * Math.PI)
          if (Math.floor((t + (x.seed || 0)) / 13) % 2) {
            // scratch the head
            left.sh.rotation.x = -2.3 * g
            left.sh.rotation.z = -0.08 - 0.5 * g
            left.el.rotation.x = -0.25 - 1.5 * g
          } else {
            // hand on hip
            left.sh.rotation.z = -0.08 - 0.55 * g
            left.el.rotation.x = -0.25 - 1.1 * g
          }
        }
      }
      // blink every few seconds; talk with a moving jaw
      if (face.lids) {
        const bc = (t * 0.93 + (x.seed || 0) * 1.7) % 4.3
        const shut = dying >= 1 ? 1 : bc < 0.12 ? Math.sin((bc / 0.12) * Math.PI) : 0
        for (const l of face.lids) l.scale.y = 0.05 + shut * 0.85
      }
      if (x.talk) {
        // talk with the hands a little
        const g = Math.max(0, Math.sin(t * 2.3)) * 0.5
        right.sh.rotation.x = -0.3 - g * 0.5
        right.el.rotation.x = -0.6 - g * 0.6
      }
      if (face.mouth) {
        const open = x.talk ? Math.max(0, Math.abs(Math.sin(t * 11) + Math.sin(t * 7.3) * 0.6) - 0.2) : 0
        face.mouth.scale.y = 1 + open * 3.2
        face.mouth.position.y = face.mouthY - open * 0.008
      }
      if (flinch > 0) {
        left.sh.rotation.x -= flinch * 0.5
        right.sh.rotation.x -= flinch * 0.3
      }
      if (dying > 0) {
        // knees buckle, hips drop, body slumps and arms go limp
        for (const L of legs) {
          L.hp.rotation.x = -dying * 0.9
          L.kn.rotation.x = dying * 1.5
        }
        hips.position.y = baseY - dying * 0.32
        torso.rotation.x = hunch + dying * 0.45
        head.rotation.x = dying * 0.5
        for (const a of arms) {
          a.sh.rotation.x = dying * 0.35
          a.el.rotation.x = -0.1
        }
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Quadrupeds and other creatures
// ---------------------------------------------------------------------------

function quadruped(def, o) {
  const root = new THREE.Group()
  const body = pivot(root, 0, o.legLen, 0)
  const c = def.color
  const tile = o.tile || "creatureHide"
  const B = new Seg()
  B.add(sphere(1, 14, 10), tile, c, { scale: [o.bodyW, o.bodyH, o.bodyL] })
  if (o.spines) for (let i = 0; i < 5; i++) B.add(new THREE.ConeGeometry(0.05, 0.25, 4), "chitin", shade(c, 0.6), { pos: [0, o.bodyH * 0.95, o.bodyL * (0.6 - i * 0.3)], rot: [-0.4, 0, 0] })
  B.add(sphere(1, 10, 8), tile, shade(c, 1.1), { pos: [0, -o.bodyH * 0.35, 0], scale: [o.bodyW * 0.8, o.bodyH * 0.6, o.bodyL * 0.8] })
  B.into(body)
  const neck = pivot(body, 0, o.headY, o.bodyL * 0.85)
  const Hd = new Seg()
  Hd.add(sphere(1, 12, 10), tile, shade(c, 0.95), { pos: [0, 0, o.headL * 0.5], scale: [o.headW, o.headW * 0.8, o.headL] })
  if (o.snout) Hd.add(sphere(1, 10, 8), tile, shade(c, 0.9), { pos: [0, -o.headW * 0.2, o.headL * 1.3], scale: [o.headW * 0.55, o.headW * 0.45, o.headL * 0.6] })
  if (o.tusks) for (const sx of [-1, 1]) Hd.add(taperTube([V3(sx * o.headW * 0.5, -o.headW * 0.3, o.headL), V3(sx * o.headW * 0.8, 0, o.headL * 1.3), V3(sx * o.headW * 0.7, o.headW * 0.4, o.headL * 1.4)], 0.035, 0.005, 5, 6), "bone", 0xe8e0c8)
  if (o.mouth) {
    Hd.add(new THREE.BoxGeometry(o.headW * 1.7, 0.08, o.headL * 1.2), "teeth", 0xffffff, { pos: [0, -o.headW * 0.05, o.headL * 0.9] })
  }
  if (o.ears) for (const sx of [-1, 1]) Hd.add(new THREE.ConeGeometry(0.05, 0.16, 4), tile, c, { pos: [sx * o.headW * 0.6, o.headW * 0.7, o.headL * 0.2], rot: [-0.3, 0, -sx * 0.4] })
  for (const sx of [-1, 1]) Hd.glow(sphere(0.035, 6, 4), o.eye ?? 0x100808, [sx * o.headW * 0.62, o.headW * 0.3, o.headL * 0.95])
  const head = pivot(neck, 0, 0, 0)
  Hd.into(head)
  const legs = []
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const hp = pivot(body, sx * o.bodyW * 0.62, -o.bodyH * 0.2, sz * o.bodyL * 0.58)
    const up = new Seg()
    up.add(limbGeo(o.legLen * 0.55, o.legR * 1.4, o.legR), tile, shade(c, 0.9), {})
    up.into(hp)
    const kn = pivot(hp, 0, -o.legLen * 0.55, 0)
    const lo = new Seg()
    lo.add(limbGeo(o.legLen * 0.52, o.legR, o.legR * 0.7), tile, shade(c, 0.8), {})
    lo.add(sphere(o.legR * 1.2, 6, 5), "chitin", shade(c, 0.5), { pos: [0, -o.legLen * 0.52, o.legR * 0.5], scale: [1, 0.6, 1.4] })
    lo.into(kn)
    legs.push({ hp, kn, phase: sx * sz > 0 ? 0 : Math.PI, back: sz < 0 })
  }
  let tail = null
  if (o.tail) {
    tail = pivot(body, 0, 0, -o.bodyL * 0.9)
    const S = new Seg()
    S.add(taperTube([V3(0, 0, 0), V3(0, -0.1, -o.tail * 0.4), V3(0, -0.15, -o.tail)], o.bodyH * 0.25, 0.02, 6, 8), tile, shade(c, 0.9), {})
    S.into(tail)
  }
  return {
    root,
    anim(t, move, attack) {
      const w = t * 10
      for (const L of legs) {
        L.hp.rotation.x = Math.sin(w + L.phase) * 0.6 * move
        L.kn.rotation.x = (L.back ? -1 : 1) * Math.max(0, Math.cos(w + L.phase)) * 0.7 * move
      }
      body.position.y = o.legLen + Math.abs(Math.sin(w)) * 0.05 * move + Math.sin(t * 2) * 0.01
      head.rotation.x = -attack * 0.6 + Math.sin(t * 1.3) * 0.05
      if (tail) tail.rotation.y = Math.sin(t * 3) * 0.3
    },
  }
}

function biped(def, o) {
  // guar, clannfear, daedroth
  const root = new THREE.Group()
  const c = def.color
  const tile = o.tile || "scales"
  const body = pivot(root, 0, 1.25, 0)
  const B = new Seg()
  B.add(sphere(1, 14, 10), tile, c, { rot: [-0.35, 0, 0], scale: [0.55, 0.62, 0.95] })
  B.add(sphere(1, 10, 8), tile, shade(c, 1.15), { pos: [0, -0.2, 0.25], rot: [-0.35, 0, 0], scale: [0.42, 0.45, 0.7] })
  if (o.plates) for (let i = 0; i < 5; i++) B.add(new THREE.ConeGeometry(0.08, 0.3, 4), "chitin", shade(c, 0.6), { pos: [0, 0.55 - i * 0.07, 0.4 - i * 0.28], rot: [-0.6, 0, 0] })
  B.into(body)
  const neck = pivot(body, 0, 0.45, 0.8)
  const Hd = new Seg()
  Hd.add(sphere(1, 12, 10), tile, shade(c, 0.95), { pos: [0, 0.1, 0.3], scale: [0.36, 0.34, 0.55] })
  Hd.add(new THREE.BoxGeometry(0.5, 0.06, 0.5), "teeth", 0xffffff, { pos: [0, -0.06, 0.55] })
  if (o.frill) {
    Hd.add(lathe([[0.2, 0], [0.55, 0.1], [0.62, 0.18]], seg(12)), "chitin", shade(c, 0.7), { pos: [0, 0.15, 0.05], rot: [-Math.PI / 2 + 0.3, 0, 0] })
    for (let i = 0; i < 5; i++) Hd.add(new THREE.ConeGeometry(0.04, 0.3, 4), "bone", 0xd8d0b8, { pos: [Math.cos(i * 0.6 + 0.3) * 0.5, 0.35 + Math.sin(i * 0.6 + 0.3) * 0.25, 0], rot: [0, 0, -(i - 2) * 0.4] })
  }
  if (o.beak) Hd.add(new THREE.ConeGeometry(0.12, 0.35, 5), "chitin", 0x3a2a1a, { pos: [0, 0.05, 0.85], rot: [Math.PI / 2, 0, 0] })
  for (const sx of [-1, 1]) Hd.glow(sphere(0.04, 6, 4), o.eye ?? 0x100808, [sx * 0.24, 0.2, 0.55])
  const head = pivot(neck, 0, 0, 0)
  Hd.into(head)
  const legs = []
  for (const sx of [-1, 1]) {
    const hp = pivot(body, sx * 0.38, -0.15, -0.1)
    const T = new Seg()
    T.add(limbGeo(0.7, 0.2, 0.13), tile, shade(c, 0.9), {})
    T.into(hp)
    const kn = pivot(hp, 0, -0.7, 0.05)
    const L = new Seg()
    L.add(limbGeo(0.6, 0.12, 0.08), tile, shade(c, 0.8), {})
    for (let i = -1; i <= 1; i++) L.add(new THREE.ConeGeometry(0.04, 0.25, 4), "bone", 0x2a2018, { pos: [i * 0.06, -0.6, 0.12], rot: [Math.PI / 2, 0, 0] })
    L.into(kn)
    legs.push({ hp, kn, phase: sx > 0 ? 0 : Math.PI })
  }
  const arms = []
  for (const sx of [-1, 1]) {
    const a = pivot(body, sx * 0.4, 0.15, 0.6)
    const S = new Seg()
    S.add(limbGeo(0.45, 0.07, 0.04), tile, shade(c, 0.85), {})
    for (let i = 0; i < 3; i++) S.add(new THREE.ConeGeometry(0.02, 0.12, 4), "bone", 0x2a2018, { pos: [(i - 1) * 0.03, -0.5, 0.02], rot: [Math.PI, 0, 0] })
    S.into(a)
    a.rotation.x = -0.9
    arms.push(a)
  }
  const tail = pivot(body, 0, 0, -0.85)
  const S = new Seg()
  S.add(taperTube([V3(0, 0, 0), V3(0, -0.2, -0.6), V3(0, -0.45, -1.3), V3(0, -0.5, -1.8)], 0.22, 0.02, 7, 10), tile, shade(c, 0.9), {})
  S.into(tail)
  return {
    root,
    anim(t, move, attack) {
      const w = t * 8
      for (const L of legs) {
        L.hp.rotation.x = Math.sin(w + L.phase) * 0.7 * move
        L.kn.rotation.x = Math.max(0, Math.cos(w + L.phase)) * 0.8 * move
      }
      body.position.y = 1.25 + Math.abs(Math.sin(w)) * 0.07 * move
      head.rotation.x = -attack * 0.7
      for (const a of arms) a.rotation.x = -0.9 - attack * 0.9
      tail.rotation.y = Math.sin(t * 2.5) * 0.25
    },
  }
}

function crab(def) {
  const root = new THREE.Group()
  const body = pivot(root, 0, 0.45, 0)
  const c = def.color
  const B = new Seg()
  B.add(lathe([[0.01, 0.3], [0.5, 0.25], [0.85, 0.05], [0.9, -0.05], [0.6, -0.2], [0.01, -0.22]], seg(16)), "chitin", c, { scale: [1, 1, 0.8] })
  for (let i = 0; i < 6; i++) B.add(new THREE.ConeGeometry(0.05, 0.18, 4), "chitin", shade(c, 0.7), { pos: [Math.cos(i) * 0.5, 0.22, Math.sin(i) * 0.35], rot: [0, 0, -Math.cos(i) * 0.5] })
  for (const sx of [-1, 1]) {
    B.add(cyl(0.02, 0.02, 0.18), "chitin", c, { pos: [sx * 0.15, 0.32, 0.5] })
    B.glow(sphere(0.04, 6, 4), 0x0a0a0a, [sx * 0.15, 0.42, 0.5])
  }
  B.into(body)
  const legs = []
  for (let i = 0; i < 6; i++) {
    const sx = i < 3 ? -1 : 1
    const hp = pivot(body, sx * 0.7, -0.05, ((i % 3) - 1) * 0.35)
    hp.rotation.z = sx * 0.9
    const S = new Seg()
    S.add(limbGeo(0.45, 0.05, 0.035), "chitin", shade(c, 0.85), {})
    S.into(hp)
    const kn = pivot(hp, 0, -0.45, 0)
    kn.rotation.z = -sx * 1.2
    const L = new Seg()
    L.add(limbGeo(0.4, 0.035, 0.01), "chitin", shade(c, 0.75), {})
    L.into(kn)
    legs.push(hp)
  }
  const claws = []
  for (const sx of [-1, 1]) {
    const cp = pivot(body, sx * 0.5, 0.05, 0.6)
    const S = new Seg()
    S.add(sphere(1, 10, 8), "chitin", shade(c, 1.1), { pos: [0, 0, 0.2], scale: [0.18, 0.13, 0.28] })
    S.add(new THREE.ConeGeometry(0.07, 0.3, 5), "chitin", shade(c, 0.9), { pos: [0.04, 0.03, 0.5], rot: [Math.PI / 2, 0, 0] })
    S.into(cp)
    const pin = pivot(cp, -0.04, -0.03, 0.4)
    const P2 = new Seg()
    P2.add(new THREE.ConeGeometry(0.05, 0.25, 5), "chitin", shade(c, 0.8), { pos: [0, 0, 0.1], rot: [Math.PI / 2, 0, 0] })
    P2.into(pin)
    claws.push({ cp, pin })
  }
  return {
    root,
    anim(t, move, attack) {
      legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 14 + i) * 0.4 * move))
      claws.forEach((cl, i) => {
        cl.cp.rotation.x = -attack * 0.8 + Math.sin(t * 3 + i) * 0.1
        cl.pin.rotation.y = Math.abs(Math.sin(t * 4 + i)) * 0.4
      })
      body.position.y = 0.45 + Math.sin(t * 14) * 0.02 * move
    },
  }
}

function spider(def, o = {}) {
  const root = new THREE.Group()
  const body = pivot(root, 0, 0.6, 0)
  const c = def.color
  const tile = o.tile || "chitin"
  const B = new Seg()
  B.add(sphere(1, 14, 10), tile, c, { pos: [0, 0, -0.2], scale: [0.5, 0.4, 0.62] })
  B.add(sphere(1, 12, 8), tile, shade(c, 0.85), { pos: [0, 0.05, 0.45], scale: [0.3, 0.25, 0.3] })
  if (o.dwemer) {
    B.add(new THREE.TorusGeometry(0.4, 0.05, 5, seg(14)), "brass", shade(c, 0.7), { pos: [0, 0, -0.2], rot: [Math.PI / 2, 0, 0] })
    B.add(cyl(0.05, 0.05, 0.6), "brass", c, { pos: [0, 0.35, -0.5], rot: [-0.8, 0, 0] })
    B.add(new THREE.ConeGeometry(0.06, 0.3, 4), "plate", 0xc0c0c0, { pos: [0, 0.6, -0.75], rot: [-0.8, 0, 0] })
  }
  for (const sx of [-1, 1]) B.glow(sphere(0.04, 6, 4), o.eye ?? 0x100808, [sx * 0.12, 0.12, 0.72])
  for (const sx of [-1, 1]) B.add(new THREE.ConeGeometry(0.03, 0.15, 4), tile, shade(c, 0.6), { pos: [sx * 0.08, -0.08, 0.75], rot: [Math.PI / 2 + 0.4, 0, 0] })
  B.into(body)
  const legs = []
  for (let i = 0; i < 8; i++) {
    const sx = i < 4 ? -1 : 1
    const hp = pivot(body, sx * 0.3, 0.05, ((i % 4) - 1.5) * 0.22)
    hp.rotation.z = sx * 1.9
    hp.rotation.y = ((i % 4) - 1.5) * 0.35 * sx
    const S = new Seg()
    S.add(limbGeo(0.5, 0.045, 0.03), tile, shade(c, 0.8), {})
    S.into(hp)
    const kn = pivot(hp, 0, -0.5, 0)
    kn.rotation.z = -sx * 1.6
    const L = new Seg()
    L.add(limbGeo(0.62, 0.03, 0.008), tile, shade(c, 0.7), {})
    L.into(kn)
    legs.push(hp)
  }
  return {
    root,
    anim(t, move, attack) {
      legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 16 + i * 1.3) * 0.35 * move))
      body.position.y = 0.6 + Math.sin(t * 16) * 0.03 * move
      body.rotation.x = -attack * 0.3
    },
  }
}

function worm(def) {
  const root = new THREE.Group()
  const segs = []
  for (let i = 0; i < 6; i++) {
    const p = pivot(root, 0, 0.32, 0.55 - i * 0.34)
    const S = new Seg()
    S.add(sphere(1, 10, 8), "flesh", i === 0 ? shade(def.color, 0.9) : def.color, { scale: [0.33 - i * 0.025, 0.3 - i * 0.025, 0.24] })
    if (i === 0) {
      for (const sx of [-1, 1]) S.add(new THREE.ConeGeometry(0.04, 0.22, 4), "bone", 0x3a2a1a, { pos: [sx * 0.12, -0.05, 0.25], rot: [Math.PI / 2, 0, sx * 0.4] })
      for (const sx of [-1, 1]) S.glow(sphere(0.03, 6, 4), 0x0a0a0a, [sx * 0.14, 0.12, 0.2])
    }
    S.into(p)
    segs.push(p)
  }
  return {
    root,
    anim(t, move, attack) {
      segs.forEach((s, i) => {
        s.position.y = 0.32 + Math.max(0, Math.sin(t * 8 - i)) * 0.12 * move + (i === 0 ? attack * 0.3 : 0)
        s.position.x = Math.sin(t * 4 - i * 0.8) * 0.08 * move
      })
    },
  }
}

function flier(def) {
  // cliff racer: long beak, dorsal sail, whip tail with a fin, membranous wings
  const root = new THREE.Group()
  const body = pivot(root, 0, 0, 0)
  const c = def.color
  const B = new Seg()
  B.add(sphere(1, 12, 10), "scales", c, { scale: [0.28, 0.24, 0.75] })
  const sail = new THREE.PlaneGeometry(0.9, 0.6, 3, 2)
  sail.translate(0, 0.3, 0)
  B.add(sail, "membrane", shade(c, 1.2), { pos: [0, 0.15, -0.1], rot: [0, Math.PI / 2, 0] })
  B.add(taperTube([V3(0, 0.05, 0.6), V3(0, 0.25, 0.9), V3(0, 0.3, 1.15)], 0.1, 0.07, 6, 6), "scales", c, {})
  B.add(sphere(1, 10, 8), "scales", shade(c, 0.95), { pos: [0, 0.32, 1.25], scale: [0.14, 0.13, 0.22] })
  B.add(new THREE.ConeGeometry(0.06, 0.7, 5), "chitin", 0x4a3420, { pos: [0, 0.28, 1.7], rot: [Math.PI / 2 + 0.15, 0, 0] })
  for (const sx of [-1, 1]) B.glow(sphere(0.025, 6, 4), 0xffe060, [sx * 0.1, 0.38, 1.33])
  B.add(taperTube([V3(0, 0, -0.6), V3(0, -0.05, -1.2), V3(0, 0.05, -1.9), V3(0, 0.15, -2.4)], 0.09, 0.015, 5, 10), "scales", shade(c, 0.9), {})
  const fin = new THREE.PlaneGeometry(0.35, 0.3)
  B.add(fin, "membrane", shade(c, 1.2), { pos: [0, 0.2, -2.35], rot: [0, Math.PI / 2, 0] })
  for (const sx of [-1, 1]) B.add(limbGeo(0.35, 0.04, 0.02), "scales", c, { pos: [sx * 0.12, -0.15, 0.1], rot: [0.5, 0, 0] })
  B.into(body)
  const wings = []
  for (const sx of [-1, 1]) {
    const wp = pivot(body, sx * 0.2, 0.08, 0.15)
    const W = new Seg()
    const g = new THREE.BufferGeometry()
    const verts = new Float32Array([0, 0, 0.35, 0, 0, -0.45, sx * 1.9, 0.05, -0.2, 0, 0, 0.35, sx * 1.9, 0.05, -0.2, sx * 1.6, 0.05, 0.4])
    g.setAttribute("position", new THREE.BufferAttribute(verts, 3))
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0.5, 0, 1, 1, 0.5, 1, 1]), 2))
    g.computeVertexNormals()
    const two = g.clone()
    const idx = two.attributes.position.array
    // flip winding for the underside
    for (let k = 0; k < idx.length; k += 9) for (let q = 0; q < 3; q++) [idx[k + 3 + q], idx[k + 6 + q]] = [idx[k + 6 + q], idx[k + 3 + q]]
    two.computeVertexNormals()
    W.add(g, "membrane", shade(c, 1.1), {})
    W.add(two, "membrane", shade(c, 1.1), {})
    W.add(taperTube([V3(0, 0, 0.3), V3(sx * 0.9, 0.1, 0.35), V3(sx * 1.6, 0.05, 0.4)], 0.035, 0.01, 4, 6), "bone", shade(c, 0.8), {})
    W.into(wp)
    wings.push({ wp, sx })
  }
  return {
    root,
    anim(t, move, attack) {
      const f = Math.sin(t * 11) * 0.7
      for (const w of wings) w.wp.rotation.z = w.sx * f
      body.rotation.x = attack * 0.6
      body.position.y = Math.sin(t * 11 + 1) * 0.08
    },
  }
}

function netch(def) {
  const root = new THREE.Group()
  const c = def.color
  const body = pivot(root, 0, 0, 0)
  const B = new Seg()
  B.add(lathe([[0.01, -0.9], [0.9, -0.7], [1.25, 0], [1.1, 0.6], [0.6, 0.95], [0.01, 1.05]], seg(20)), "membrane", c, { rot: [Math.PI / 2, 0, 0], scale: [1, 1.2, 0.85] })
  for (let i = 0; i < 3; i++) B.add(new THREE.TorusGeometry(1.05 - i * 0.12, 0.05, 5, seg(18), Math.PI), "chitin", shade(c, 0.7), { pos: [0, 0.2, (i - 1) * 0.6], rot: [0, 0, 0] })
  const fin = new THREE.PlaneGeometry(1.6, 0.5, 4, 1)
  B.add(fin, "membrane", shade(c, 1.2), { pos: [0, 0.95, 0], rot: [0, Math.PI / 2, 0] })
  B.into(body)
  const tents = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const tp = pivot(body, Math.cos(a) * 0.55, -0.6, Math.sin(a) * 0.7)
    const S = new Seg()
    S.add(taperTube([V3(0, 0, 0), V3(0.05, -0.8, 0), V3(-0.05, -1.6, 0.05), V3(0, -2.4, 0)], 0.07, 0.01, 5, 10), "flesh", shade(c, 0.8), {})
    S.into(tp)
    tents.push(tp)
  }
  return {
    root,
    anim(t, move, attack) {
      body.scale.y = 1 + Math.sin(t * 2) * 0.05
      tents.forEach((tt, i) => {
        tt.rotation.x = Math.sin(t * 2 + i) * 0.25 + attack * 0.5
        tt.rotation.z = Math.cos(t * 1.7 + i) * 0.15
      })
    },
  }
}

function sphereBot(def) {
  const root = new THREE.Group()
  const c = def.color
  const ball = pivot(root, 0, 0.6, 0)
  const B = new Seg()
  B.add(sphere(0.6, 16, 12), "brass", c, {})
  for (let i = 0; i < 3; i++) B.add(new THREE.TorusGeometry(0.61, 0.035, 5, seg(20)), "brass", shade(c, 0.7), { rot: [0, (i * Math.PI) / 3, 0] })
  B.into(ball)
  const torso = pivot(root, 0, 1.2, 0)
  const T = new Seg()
  T.add(lathe([[0.2, -0.1], [0.34, 0.1], [0.32, 0.45], [0.18, 0.6], [0.01, 0.62]], seg(14)), "brass", c, {})
  T.add(sphere(0.16, 10, 8), "brass", shade(c, 0.9), { pos: [0, 0.72, 0.02] })
  T.glow(new THREE.BoxGeometry(0.2, 0.04, 0.02), 0xffc040, [0, 0.74, 0.16])
  T.into(torso)
  const arm = pivot(torso, 0.4, 0.35, 0)
  const A = new Seg()
  A.add(limbGeo(0.5, 0.06, 0.05), "brass", c, {})
  A.add(new THREE.BoxGeometry(0.04, 0.7, 0.16), "plate", 0xd8d0b8, { pos: [0, -0.8, 0.05] })
  A.into(arm)
  const arm2 = pivot(torso, -0.4, 0.35, 0)
  const A2 = new Seg()
  A2.add(limbGeo(0.45, 0.06, 0.05), "brass", c, {})
  A2.add(cyl(0.22, 0.22, 0.05), "brass", shade(c, 0.8), { pos: [0, -0.5, 0.1], rot: [Math.PI / 2, 0, 0] })
  A2.into(arm2)
  return {
    root,
    anim(t, move, attack) {
      ball.rotation.x += 0.12 * move
      arm.rotation.x = -attack * 1.8 - 0.2
      torso.position.y = 1.2 + Math.sin(t * 3) * 0.04
    },
  }
}

// ---------------------------------------------------------------------------

export function buildCreatureMesh(def) {
  let built
  const c = def.color
  switch (def.body) {
    case "quad":
      built = quadruped(def, { legLen: 0.3, legR: 0.045, bodyW: 0.28, bodyH: 0.24, bodyL: 0.55, headW: 0.16, headL: 0.22, headY: 0.08, tail: 0.7, snout: true, ears: true, tile: "fur" })
      break
    case "hound":
      built = quadruped(def, { legLen: 1.0, legR: 0.06, bodyW: 0.32, bodyH: 0.34, bodyL: 0.85, headW: 0.22, headL: 0.4, headY: 0.35, tail: 0.6, snout: true, tile: "spots", eye: 0xffd040 })
      break
    case "kagouti":
      built = quadruped(def, { legLen: 0.6, legR: 0.12, bodyW: 0.62, bodyH: 0.55, bodyL: 0.95, headW: 0.45, headL: 0.45, headY: 0.1, tusks: true, tail: 0.4, snout: true, tile: "creatureHide", spines: true })
      break
    case "alit":
      built = quadruped(def, { legLen: 0.55, legR: 0.11, bodyW: 0.6, bodyH: 0.6, bodyL: 0.75, headW: 0.58, headL: 0.4, headY: 0.1, mouth: true, tail: 0.8, tile: "scales" })
      break
    case "guar":
      built = biped(def, { tile: "scales" })
      break
    case "clannfear":
      built = biped(def, { tile: "scales", frill: def.name === "Clannfear", beak: def.name === "Clannfear", plates: true, eye: 0xff4020 })
      break
    case "crab":
      built = crab(def)
      break
    case "spider":
      built = spider(def, def.construct ? { tile: "brass", dwemer: true, eye: 0xffb020 } : { tile: "chitin" })
      break
    case "worm":
      built = worm(def)
      break
    case "flier":
      built =
        def.name === "Winged Twilight"
          ? humanoid({ skin: 0x5a7a9a, cloth: 0x2a3a5a, female: true, wings: true, wingColor: 0x3a5a8a, claws: true, digitigrade: true, horns: true, glowEyes: 0x80c0ff, sleeves: false, hair: 0x1a1a2a, hairStyle: "long" })
          : flier(def)
      break
    case "netch":
      built = netch(def)
      break
    case "sphere":
      built = sphereBot(def)
      break
    case "riekling":
      built = humanoid({ bigHead: true, skin: c, cloth: 0x5a4a3a, pants: 0x3a2e24, hair: 0xe0e0e8, hairStyle: "crest", elf: true, weapon: "spear", weaponMaterial: "chitin", weaponColor: 0x8a8070, sleeves: false, eye: 0x101820 })
      break
    case "draugr":
      built = humanoid({ skull: true, thin: true, skin: c, cloth: 0x3a3e44, armor: "chain", armorColor: 0x5a5e66, helm: 0x4a4e56, helmTile: "plate", helmCrest: def.level > 8, weapon: def.level > 8 ? "battle axe" : "war axe", weaponMaterial: "iron", weaponColor: 0x6a6e73, shield: def.level > 8 ? null : "iron", glowEyes: 0x70c0ff })
      break
    case "skeleton":
      built = humanoid({ skull: true, thin: true, skin: c, cloth: c, weapon: "shortsword", weaponMaterial: "iron", weaponColor: 0x7a7a7a, shield: def.level > 4 ? "iron" : null, glowEyes: 0xff6a20 })
      break
    case "ghost":
      built = humanoid({ ghost: true, float: true, skull: true, skin: c, cloth: c, robe: true, glowEyes: 0xa0f0ff, claws: true })
      break
    case "scamp":
      built = humanoid({ bigHead: true, skin: c, cloth: c, pants: shade(c, 0.7), horns: true, elf: true, hunch: 0.35, tail: true, claws: true, sleeves: false, digitigrade: true, boots: c, eye: 0xffc020, armor: null })
      break
    case "ash":
      built = humanoid({ bigHead: true, skin: c, cloth: 0x3a2a24, cloth2: 0x2a1e1a, robe: def.name !== "Corprus Stalker", glowEyes: 0xff3010, tentacles: def.name === "Ash Ghoul", hunch: def.name === "Corprus Stalker" ? 0.4 : 0.15, claws: true, sleeves: false })
      break
    case "sleeper":
      built = humanoid({ bigHead: true, tentacles: true, skin: c, cloth: 0x3a1a14, cloth2: 0x2a1410, robe: true, glowEyes: 0xff3010, bulk: 1.2, claws: true })
      break
    case "dagoth":
      built = humanoid({ mask: true, skin: 0x6a4a3a, cloth: 0x6a1a10, cloth2: 0x4a120a, robe: true, weapon: "claymore", weaponMaterial: "daedric", weaponColor: 0x6a1a10, bulk: 1.15, hair: 0x100808 })
      break
    case "centurion":
      built = humanoid({ bulk: 1.6, skin: c, cloth: c, armor: "brass", armorColor: c, wheel: true, weapon: "halberd", weaponMaterial: "dwemer", weaponColor: 0xb08a3e, glowEyes: 0xffc040, skull: false, sleeves: false, helm: c, helmTile: "brass" })
      break
    case "humanoid":
    default: {
      const daedra = def.daedra
      built = humanoid({
        skin: daedra ? 0x7a2a22 : 0xb08a6a,
        cloth: daedra ? 0x2a0a0a : c,
        pants: daedra ? 0x1a0808 : shade(c, 0.7),
        hair: daedra ? undefined : 0x2a1a10,
        hairStyle: "short",
        horns: daedra,
        robe: !!def.caster,
        hood: !!def.caster,
        armor: daedra ? "daedric" : def.name === "Smuggler" ? "chain" : "leather" === "x" ? null : null,
        armorColor: daedra ? 0x3a0a0a : undefined,
        helm: daedra ? 0x2a0808 : undefined,
        helmTile: "plate",
        helmCrest: daedra,
        weapon: def.caster ? "club" : daedra ? "katana" : def.name === "Bandit" ? "war axe" : "shortsword",
        weaponMaterial: daedra ? "daedric" : "iron",
        weaponColor: daedra ? 0x4a1010 : 0x8a8a8a,
        eye: daedra ? 0xff4010 : undefined,
        gloves: true,
      })
    }
  }
  const holder = new THREE.Group()
  holder.add(built.root)
  holder.scale.setScalar(def.scale || 1)
  return { group: holder, anim: built.anim, head: built.head, rig: built.rig }
}

// ---------------------------------------------------------------------------
// Townsfolk
// ---------------------------------------------------------------------------

const ROLE_CLOTH = {
  trader: [0x7a5a3a, 0x5a4a30],
  smith: [0x4a3a2a, 0x3a2a1a],
  priest: [0xc8a040, 0x8a6a20],
  guildmaster: [0x3a4a6a, 0x2a3450],
  caravaner: [0x8a7a5a, 0x5a4a30],
  commoner: [0x7a6040, 0x5a5040],
  guard: [0x8a5a2a, 0x5a3a1a],
  blade: [0x2a2a3a, 0x1a1a24],
}

const EYE = { dunmer: 0xd02010, altmer: 0xc8a020, khajiit: 0xd0c020, argonian: 0xd07020, bosmer: 0x4a3010, orc: 0x3a1a0a }

export function buildNpcMesh(npc, race, factionColor) {
  const rnd = (() => {
    let s = npc.seed >>> 0
    return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) % 10000) / 10000
  })()
  const female = rnd() < 0.45
  npc.female = female // the voice and greetings use it
  let [cloth, pants] = ROLE_CLOTH[npc.role] || [0x6a5a4a, 0x4a3a2a]
  if (factionColor && npc.role === "guildmaster") cloth = new THREE.Color(factionColor).getHex()
  if (npc.role === "commoner") cloth = new THREE.Color().setHSL(rnd() * 0.15 + 0.03, 0.25 + rnd() * 0.3, 0.25 + rnd() * 0.2).getHex()
  const raceKey = race.name.toLowerCase()
  const styles = female ? ["long", "tail", "long", "short"] : ["short", "crest", "bald", "short", "tail"]
  const robe = npc.role === "priest" || npc.faction === "magesGuild" || npc.faction === "telvanni"
  const guard = npc.role === "guard"
  const built = humanoid({
    race: raceKey,
    female,
    elf: ["dunmer", "altmer", "bosmer"].includes(raceKey),
    skin: race.skin,
    hair: race.hair,
    hairStyle: styles[Math.floor(rnd() * styles.length)],
    beard: !female && (raceKey === "nord" ? rnd() < 0.7 : ["imperial", "breton", "redguard", "orc", "dunmer"].includes(raceKey) && rnd() < 0.2),
    face: {
      nose: 0.75 + rnd() * 0.6,
      noseLong: 0.85 + rnd() * 0.4,
      jaw: (female ? 0.92 : 1) + (rnd() - 0.5) * 0.14 + (raceKey === "orc" || raceKey === "nord" ? 0.06 : 0),
      chin: 0.8 + rnd() * 0.45,
      brow: 0.7 + rnd() * 0.9,
      browTilt: (rnd() - 0.5) * 0.35,
      cheeks: rnd() < 0.4,
      tattoo: (raceKey === "dunmer" && rnd() < 0.35) || npc.role === "ashlander" ? (rnd() < 0.5 ? 0x2a1a3a : 0x8a1a10) : 0,
      scar: rnd() < 0.12 ? (rnd() < 0.5 ? -1 : 1) : 0,
      mustache: !female && !["argonian", "khajiit", "altmer", "bosmer"].includes(raceKey) && rnd() < 0.18,
    },
    eye: EYE[raceKey],
    cloth,
    cloth2: shade(cloth, 0.8),
    pants,
    robe,
    skirt: !robe && female && rnd() < 0.6,
    tail: raceKey === "khajiit" || raceKey === "argonian",
    digitigrade: raceKey === "khajiit",
    armor: guard ? "bonemold" : npc.role === "blade" ? "chain" : npc.faction === "fightersGuild" || npc.faction === "legion" || npc.faction === "redoran" ? "chain" : null,
    armorColor: guard ? 0xc8a878 : undefined,
    helm: guard ? 0xc8a878 : undefined,
    helmCrest: guard,
    weapon: guard ? "spear" : npc.role === "smith" ? "warhammer" : null,
    weaponMaterial: "steel",
    weaponColor: 0xa8adb3,
    shield: guard && rnd() < 0.5 ? "iron" : null,
    gloves: guard || npc.role === "smith",
    bulk: raceKey === "orc" || raceKey === "nord" ? 1.12 : raceKey === "bosmer" ? 0.9 : 1,
  })
  const holder = new THREE.Group()
  holder.add(built.root)
  if (raceKey === "altmer") holder.scale.setScalar(1.06)
  if (raceKey === "bosmer") holder.scale.setScalar(0.92)
  return { group: holder, anim: built.anim, head: built.head, rig: built.rig }
}

// Distance level of detail: bake a character's current pose into one merged
// mesh per material (one or two draw calls instead of a dozen).
export function makeLod(root) {
  const b = new Builder()
  root.updateMatrix()
  b.addObject(root, new THREE.Matrix4(), "keep")
  const g = b.build({ castShadow: Q.charShadows, receiveShadow: false })
  g.visible = false
  return g
}

// Swap between the animated model and its baked LOD by distance.
export class LodSwitch {
  constructor(holder, anim, dist = 30) {
    this.holder = holder
    this.root = holder.children[0]
    this.anim = anim
    this.dist = dist
    this.lod = null
    this.far = false
  }

  // Returns true when the animated model is showing (so the caller animates it).
  update(distance) {
    const far = distance > this.dist
    if (far && !this.lod) {
      this.anim(0, 0, 0) // bake a neutral pose
      this.lod = makeLod(this.root)
      this.holder.add(this.lod)
    }
    if (far !== this.far) {
      this.far = far
      this.root.visible = !far
      if (this.lod) this.lod.visible = far
    }
    return !far
  }
}
