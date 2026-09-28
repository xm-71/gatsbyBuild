import * as THREE from "three"
import { texture } from "./texgen.js"
import { lathe, taperTube } from "./geom.js"
import { seg } from "../core/quality.js"

const cache = new Map()
function metalMat(material, color) {
  const key = `m:${material}:${color}`
  if (cache.has(key)) return cache.get(key)
  const t = texture("plate")
  const opts = { color, map: t.map, normalMap: t.normalMap, metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide }
  if (material === "glass") Object.assign(opts, { metalness: 0.1, roughness: 0.1, transparent: true, opacity: 0.85, emissive: 0x1a5a30, emissiveIntensity: 0.6 })
  if (material === "ebony") Object.assign(opts, { metalness: 0.5, roughness: 0.2 })
  if (material === "daedric") Object.assign(opts, { emissive: 0x5a0808, emissiveIntensity: 0.5, roughness: 0.5 })
  if (material === "chitin" || material === "bonemold" || material === "netch leather") Object.assign(opts, { metalness: 0.05, roughness: 0.6 })
  if (material === "dwemer") Object.assign(opts, { map: texture("dwemerMetal").map, normalMap: texture("dwemerMetal").normalMap, color: 0xffffff })
  const m = new THREE.MeshStandardMaterial(opts)
  cache.set(key, m)
  return m
}
function woodMat() {
  if (!cache.has("wood")) cache.set("wood", new THREE.MeshLambertMaterial({ map: texture("wood").map, normalMap: texture("wood").normalMap }))
  return cache.get("wood")
}
function leatherMat() {
  if (!cache.has("leather")) cache.set("leather", new THREE.MeshLambertMaterial({ map: texture("hide").map, normalMap: texture("hide").normalMap, color: 0x7a5a40 }))
  return cache.get("leather")
}
function goldMat() {
  if (!cache.has("gold")) cache.set("gold", new THREE.MeshStandardMaterial({ color: 0xc8a040, metalness: 0.9, roughness: 0.3 }))
  return cache.get("gold")
}

function extrude(shape, depth, bevel = 0.004) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 1, curveSegments: seg(8) })
  g.translate(0, 0, -depth / 2)
  // map UVs from the XY footprint
  const pos = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * 4, pos.getY(i) * 4)
  g.computeVertexNormals()
  return g
}

function bladeShape(len, width, kind) {
  const s = new THREE.Shape()
  const w = width / 2
  if (kind === "scimitar") {
    // widens toward a curved, clipped tip
    s.moveTo(-w, 0)
    s.quadraticCurveTo(-w * 0.8 + len * 0.1, len * 0.55, -w * 0.2 + len * 0.2, len)
    s.lineTo(w * 1.6 + len * 0.16, len * 0.8)
    s.quadraticCurveTo(w * 1.8 + len * 0.05, len * 0.4, w, 0)
  } else if (kind === "katana") {
    s.moveTo(-w, 0)
    s.quadraticCurveTo(-w * 0.6 + len * 0.05, len * 0.5, -w * 0.2 + len * 0.1, len)
    s.lineTo(w + len * 0.08, len * 0.92)
    s.quadraticCurveTo(w + len * 0.04, len * 0.5, w, 0)
  } else if (kind === "leaf") {
    s.moveTo(-w, 0)
    s.quadraticCurveTo(-w * 1.6, len * 0.45, 0, len)
    s.quadraticCurveTo(w * 1.6, len * 0.45, w, 0)
  } else if (kind === "tanto") {
    s.moveTo(-w, 0)
    s.lineTo(-w, len * 0.85)
    s.lineTo(w * 0.2, len)
    s.lineTo(w, len * 0.9)
    s.lineTo(w, 0)
  } else {
    s.moveTo(-w, 0)
    s.lineTo(-w * 0.92, len * 0.82)
    s.lineTo(0, len)
    s.lineTo(w * 0.92, len * 0.82)
    s.lineTo(w, 0)
  }
  s.closePath()
  return s
}

function mesh(g, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(g, m)
  o.position.set(x, y, z)
  o.rotation.set(rx, ry, rz)
  o.castShadow = true
  return o
}

// Weapon model with the grip at the origin and the business end along +Y.
export function buildWeapon(item) {
  const g = new THREE.Group()
  const base = item.base
  const material = item.material || "iron"
  const color = item.color ?? 0x9a9a9a
  const metal = metalMat(material, color)
  const accent = material === "daedric" ? metalMat("daedric", 0x2a0a0a) : material === "ebony" ? goldMat() : metalMat("iron", 0x6a5a40)
  const blades = { dagger: [0.34, 0.05, "leaf"], tanto: [0.4, 0.045, "tanto"], wakizashi: [0.55, 0.04, "katana"], shortsword: [0.58, 0.055, "straight"], longsword: [0.86, 0.055, "straight"], broadsword: [0.8, 0.075, "straight"], saber: [0.8, 0.045, "katana"], scimitar: [0.72, 0.05, "scimitar"], katana: [0.85, 0.04, "katana"], "dai-katana": [1.12, 0.045, "katana"], claymore: [1.2, 0.085, "straight"] }
  const curved = base === "katana" || base === "wakizashi" || base === "dai-katana"
  if (blades[base]) {
    const [len, width, kind] = blades[base]
    g.add(mesh(extrude(bladeShape(len, width, kind), 0.012, 0.003), metal, 0, 0.1, 0))
    // fuller groove hint
    if (kind === "straight" && len > 0.5) g.add(mesh(new THREE.BoxGeometry(width * 0.18, len * 0.6, 0.016), metalMat("iron", 0x444444), 0, 0.1 + len * 0.35, 0))
    const guardW = curved ? 0.07 : width * 3.2
    if (material === "daedric") {
      const gs = new THREE.Shape()
      gs.moveTo(-guardW, 0.03)
      gs.lineTo(-guardW * 0.3, -0.01)
      gs.lineTo(0, -0.03)
      gs.lineTo(guardW * 0.3, -0.01)
      gs.lineTo(guardW, 0.03)
      gs.lineTo(guardW * 0.6, 0.06)
      gs.lineTo(-guardW * 0.6, 0.06)
      gs.closePath()
      g.add(mesh(extrude(gs, 0.03), accent, 0, 0.07, 0))
    } else if (curved) {
      g.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, seg(12)), accent, 0, 0.09, 0))
    } else if (base === "saber") {
      // knuckle bow sweeping from the guard to the pommel
      g.add(mesh(new THREE.BoxGeometry(0.1, 0.02, 0.03), accent, 0, 0.09, 0))
      g.add(mesh(new THREE.TorusGeometry(0.075, 0.008, 5, seg(12), Math.PI), accent, 0.035, 0.02, 0, 0, 0, -Math.PI / 2))
    } else {
      g.add(mesh(new THREE.BoxGeometry(guardW, 0.025, 0.035), accent, 0, 0.09, 0))
      for (const sx of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.018, 6, 4), accent, (sx * guardW) / 2, 0.09, 0))
    }
    const gripLen = base === "dai-katana" ? 0.34 : base === "claymore" || base === "katana" ? 0.28 : 0.14
    g.add(mesh(new THREE.CylinderGeometry(0.016, 0.018, gripLen, 8), leatherMat(), 0, 0.08 - gripLen / 2, 0))
    g.add(mesh(new THREE.SphereGeometry(0.026, 8, 6), accent, 0, 0.08 - gripLen - 0.01, 0))
    return g
  }
  const haft = (len, r = 0.02) => g.add(mesh(new THREE.CylinderGeometry(r, r * 1.1, len, 8), woodMat(), 0, len / 2 - 0.12, 0))
  if (base === "war axe" || base === "battle axe") {
    const L = base === "battle axe" ? 1.15 : 0.75
    haft(L)
    const s = new THREE.Shape()
    const H = base === "battle axe" ? 0.34 : 0.24
    s.moveTo(0, -H * 0.2)
    s.lineTo(0.14, -H * 0.45)
    s.quadraticCurveTo(0.22, 0, 0.14, H * 0.55)
    s.lineTo(0, H * 0.25)
    s.closePath()
    g.add(mesh(extrude(s, 0.018), metal, 0.02, L - 0.24, 0))
    if (base === "battle axe") g.add(mesh(extrude(s, 0.018), metal, -0.02, L - 0.24, 0, 0, Math.PI, 0))
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), accent, 0, L - 0.2, 0))
    return g
  }
  if (base === "staff") {
    g.add(mesh(lathe([[0.018, -0.3], [0.022, 0.4], [0.02, 1.2], [0.026, 1.45], [0.01, 1.5]], seg(8)), woodMat()))
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8), metal, 0, 1.36, 0))
    g.add(mesh(new THREE.SphereGeometry(0.045, seg(10), 8), metal, 0, 1.5, 0))
    g.add(mesh(new THREE.CylinderGeometry(0.026, 0.02, 0.06, 8), metal, 0, -0.3, 0))
    return g
  }
  if (base === "spiked club") {
    g.add(mesh(lathe([[0.02, -0.12], [0.03, 0.2], [0.055, 0.5], [0.06, 0.62], [0.012, 0.67]], seg(10)), woodMat()))
    for (let r = 0; r < 3; r++)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + r * 0.5
        const y = 0.38 + r * 0.1
        const rad = 0.045 + r * 0.006
        g.add(mesh(new THREE.ConeGeometry(0.012, 0.05, 4), metal, Math.cos(a) * rad, y, Math.sin(a) * rad, Math.sin(a) * Math.PI / 2, 0, -Math.cos(a) * Math.PI / 2))
      }
    return g
  }
  if (item.thrown) {
    if (base === "throwing star") {
      const st = new THREE.Shape()
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const r = i % 2 ? 0.02 : 0.075
        st[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r)
      }
      st.closePath()
      const hole = new THREE.Path()
      hole.absarc(0, 0, 0.01, 0, Math.PI * 2, true)
      st.holes.push(hole)
      g.add(mesh(extrude(st, 0.006, 0.002), metal, 0, 0.06, 0))
      return g
    }
    if (base === "throwing knife") {
      g.add(mesh(extrude(bladeShape(0.17, 0.035, "leaf"), 0.008, 0.002), metal, 0, 0.06, 0))
      g.add(mesh(new THREE.BoxGeometry(0.02, 0.07, 0.012), leatherMat(), 0, 0.025, 0))
      g.add(mesh(new THREE.TorusGeometry(0.018, 0.004, 4, 10), metal, 0, -0.022, 0))
      return g
    }
    // dart: needle point, shaft and fletching
    g.add(mesh(new THREE.ConeGeometry(0.01, 0.07, 6), metal, 0, 0.2, 0))
    g.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.17, 5), woodMat(), 0, 0.08, 0))
    for (const r of [0, Math.PI / 2]) g.add(mesh(new THREE.BoxGeometry(0.04, 0.05, 0.002), new THREE.MeshLambertMaterial({ color: 0x8a3020, side: THREE.DoubleSide }), 0, 0.0, 0, 0, r, 0))
    return g
  }
  if (base === "crossbow") {
    // stock along +Y (the bolt's direction), prod across the front
    g.add(mesh(new THREE.BoxGeometry(0.05, 0.62, 0.06), woodMat(), 0, 0.12, 0))
    g.add(mesh(new THREE.BoxGeometry(0.04, 0.16, 0.08), woodMat(), 0, -0.2, -0.03, 0.35, 0, 0))
    const prod = []
    for (let i = 0; i <= 8; i++) {
      const t = i / 8 - 0.5
      prod.push(new THREE.Vector3(t * 0.56, 0.4 - Math.abs(t) * Math.abs(t) * 0.35, 0.015))
    }
    g.add(mesh(taperTube(prod, 0.014, 0.014, 6, 12), metal))
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.52, 3), new THREE.MeshBasicMaterial({ color: 0xd8d0c0 }))
    str.rotation.z = Math.PI / 2
    str.position.set(0, 0.32, 0.015)
    str.name = "string"
    g.add(str)
    g.add(mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), metal, 0, 0.0, -0.045))
    if (material === "dwemer") for (const y of [0.05, 0.22]) g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, seg(10)), metal, 0.04, y, 0, 0, 0, Math.PI / 2))
    return g
  }
  if (base === "club" || base === "mace" || base === "warhammer") {
    const L = base === "warhammer" ? 1.1 : 0.7
    if (base === "club") {
      g.add(mesh(lathe([[0.02, -0.12], [0.028, 0.2], [0.05, 0.5], [0.055, 0.62], [0.01, 0.66]], seg(10)), woodMat()))
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        g.add(mesh(new THREE.ConeGeometry(0.012, 0.04, 4), accent, Math.cos(a) * 0.05, 0.5, Math.sin(a) * 0.05, 0, 0, -Math.PI / 2 * Math.cos(a)))
      }
      return g
    }
    haft(L)
    if (base === "mace") {
      g.add(mesh(new THREE.SphereGeometry(0.05, seg(10), 8), metal, 0, L - 0.12, 0))
      for (let i = 0; i < 6; i++) g.add(mesh(new THREE.BoxGeometry(0.012, 0.13, 0.07), metal, 0, L - 0.12, 0, 0, (i / 6) * Math.PI, 0))
    } else {
      g.add(mesh(new THREE.BoxGeometry(0.28, 0.12, 0.12), metal, 0.04, L - 0.18, 0))
      g.add(mesh(new THREE.ConeGeometry(0.04, 0.18, 4), metal, -0.17, L - 0.18, 0, 0, 0, Math.PI / 2))
    }
    return g
  }
  if (base === "spear" || base === "halberd" || base === "long spear") {
    const H = base === "long spear" ? 2.4 : 1.9
    haft(H, 0.018)
    g.add(mesh(extrude(bladeShape(base === "long spear" ? 0.36 : 0.3, 0.06, "leaf"), 0.012), metal, 0, H - 0.18, 0))
    if (base === "long spear") g.add(mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.08, 8), accent, 0, H - 0.2, 0))
    if (base === "halberd") {
      const s = new THREE.Shape()
      s.moveTo(0, 0)
      s.lineTo(0.2, -0.08)
      s.quadraticCurveTo(0.26, 0.08, 0.2, 0.22)
      s.lineTo(0, 0.12)
      s.closePath()
      g.add(mesh(extrude(s, 0.016), metal, 0.02, 1.5, 0))
    }
    g.add(mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.08, 8), accent, 0, 1.7, 0))
    return g
  }
  if (item.ranged) {
    const L = base === "long bow" ? 0.75 : 0.6
    const pts = []
    for (let i = 0; i <= 10; i++) {
      const t = i / 10 - 0.5
      pts.push(new THREE.Vector3(-Math.cos(t * Math.PI * 0.9) * 0.12 + 0.12 - Math.abs(t) * 0.04, t * L * 2, 0))
    }
    const bowMat = material === "chitin" ? metalMat("chitin", 0x6a5a30) : metal
    g.add(mesh(taperTube(pts, 0.018, 0.018, 6, 20), bowMat))
    g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.14, 8), leatherMat(), 0.13, 0, 0))
    const string = mesh(new THREE.CylinderGeometry(0.002, 0.002, L * 1.9, 3), new THREE.MeshBasicMaterial({ color: 0xd8d0c0 }), 0.12 - 0.12 * Math.cos(0.45 * Math.PI * 0.9) + 0.02, 0, 0)
    string.name = "string"
    g.add(string)
    return g
  }
  haft(0.6)
  return g
}

export function buildShield(item) {
  const g = new THREE.Group()
  const m = item.material || "iron"
  const mat = metalMat(m, item.color ?? 0x888888)
  const heavy = ["steel", "dwemer", "ebony", "daedric"].includes(m)
  if (heavy) {
    const s = new THREE.Shape()
    s.moveTo(-0.25, 0.3)
    s.lineTo(0.25, 0.3)
    s.lineTo(0.25, -0.1)
    s.quadraticCurveTo(0.2, -0.35, 0, -0.45)
    s.quadraticCurveTo(-0.2, -0.35, -0.25, -0.1)
    s.closePath()
    g.add(mesh(extrude(s, 0.03, 0.01), mat))
    g.add(mesh(new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), metalMat("iron", 0x777777), 0, 0, 0.02, Math.PI / 2, 0, 0))
  } else {
    g.add(mesh(lathe([[0.01, 0.07], [0.15, 0.05], [0.3, 0.0], [0.32, -0.02]], seg(18)), mat, 0, 0, 0, Math.PI / 2, 0, 0))
    g.add(mesh(new THREE.TorusGeometry(0.31, 0.018, 5, seg(20)), metalMat("iron", 0x5a5040)))
    g.add(mesh(new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), metalMat("iron", 0x777777), 0, 0, 0.06, Math.PI / 2, 0, 0))
  }
  return g
}

// Simple humanoid weapon from a base name and colour (for NPCs and creatures).
export function npcWeapon(base, material = "steel", color = 0x9a9a9a) {
  return buildWeapon({ base, material, color, ranged: base.includes("bow") })
}
