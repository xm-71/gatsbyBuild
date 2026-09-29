import * as THREE from "three"
import { Builder, lathe } from "./geom.js"
import { seg } from "../core/quality.js"
import { GLOW, GLOW_COOL } from "./buildings.js"
import { Placer, TM } from "./landmarks.js"
import { buildWeapon } from "./items.js"

// Room shells per town style: walls, floor, ceiling and trim.
const SHELL = {
  hlaalu: { wall: ["plaster", 0xf0e8d8], floor: ["planks", 0xc8a888], ceil: ["planks", 0x9a7a5a], trim: ["wood", 0xb09070] },
  redoran: { wall: ["chitinShell", 0xd0b898], floor: ["planks", 0xa88868], ceil: ["chitinShell", 0x8a6a58], trim: ["chitinShell", 0x8a6a58] },
  telvanni: { wall: ["mushroomStalk", 0xe8dcc8], floor: ["mushroomStalk", 0xa89888], ceil: ["mushroomCap", 0xb8a0c0], trim: ["mushroomStalk", 0xb8a898] },
  imperial: { wall: ["stoneBlocks", 0xe0d8c8], floor: ["floorTiles", 0xd0c8b8], ceil: ["planks", 0x8a7058], trim: ["stoneBlocks", 0x8a8078] },
  ashlander: { wall: ["hide", 0xd8c0a0], floor: ["dirt", 0xb0a080], ceil: ["hide", 0xa89070], trim: ["wood", 0x8a7058] },
  nord: { wall: ["wood", 0xb89878], floor: ["planks", 0xb09070], ceil: ["wood", 0x7a6048], trim: ["wood", 0x6a5038] },
  temple: { wall: ["sandstone", 0xe8d8b8], floor: ["floorTiles", 0xd8c8a8], ceil: ["sandstone", 0xa89878], trim: ["sandstone", 0xb8a888] },
}

export function buildInterior(layout) {
  const { W, D, H } = layout
  const shell = layout.kind === "temple" && layout.style !== "telvanni" ? SHELL.temple : SHELL[layout.style] || SHELL.hlaalu
  const M = ([name, color]) => TM(name, color)
  const group = new THREE.Group()
  const b = new Builder()
  const P = new Placer(b, 0, 0, 0, 0)
  // floor, ceiling, walls (inward-facing boxes), skirting and beams
  P.box(W, 0.2, D, M(shell.floor), 0, -0.1, 0, { uv: 1.5 })
  P.box(W, 0.2, D, M(shell.ceil), 0, H + 0.1, 0, { uv: 1.5 })
  for (const [x, z, w, d] of [[0, D / 2 + 0.1, W + 0.4, 0.2], [0, -D / 2 - 0.1, W + 0.4, 0.2], [W / 2 + 0.1, 0, 0.2, D], [-W / 2 - 0.1, 0, 0.2, D]]) P.box(w, H + 0.4, d, M(shell.wall), x, H / 2, z, { uv: 1.5 })
  for (const [x, z, w, d] of [[0, D / 2 - 0.05, W, 0.1], [0, -D / 2 + 0.05, W, 0.1], [W / 2 - 0.05, 0, 0.1, D], [-W / 2 + 0.05, 0, 0.1, D]]) P.box(w, 0.25, d, M(shell.trim), x, 0.12, z)
  for (let z = -D / 2 + 1.5; z < D / 2; z += 2.5) P.box(W, 0.3, 0.3, M(shell.trim), 0, H - 0.15, z)
  // the door out
  P.box(1.5, 2.5, 0.12, TM("planks"), 0, 1.25, -D / 2 + 0.06)
  P.box(1.9, 0.25, 0.25, M(shell.trim), 0, 2.6, -D / 2 + 0.12)
  for (const sx of [-1, 1]) P.box(0.22, 2.6, 0.25, M(shell.trim), sx * 0.86, 1.3, -D / 2 + 0.12)
  P.add(new THREE.SphereGeometry(0.06, 6, 4), TM("dwemerMetal", 0x6a6a6a, { metal: true }), { pos: [0.45, 1.25, -D / 2 + 0.2] })

  const extras = new THREE.Group()
  for (const f of layout.furniture) furniture(P, f, extras, layout)
  // lamps under each light
  const lights = []
  for (const [x, y, z, color] of layout.lights.slice(0, 3)) {
    const light = new THREE.PointLight(color ?? 0xffc080, 26, 16, 1.4)
    light.position.set(x, y, z)
    group.add(light)
    lights.push(light)
    if (y > 2) {
      P.cyl(0.02, 0.02, H - y - 0.3, TM("dwemerMetal", 0x4a4a4a), x, (H + y) / 2 + 0.15, z, { segs: 4 })
      P.add(lathe([[0.01, -0.22], [0.18, -0.16], [0.22, 0], [0.18, 0.16], [0.01, 0.22]], seg(8)), GLOW, { pos: [x, y, z] })
    }
  }
  group.add(b.build(), extras)
  return { group, lights }
}

const GOODS = [0x8a3020, 0x2a5a8a, 0x3a7a3a, 0xc8a040, 0x6a3a7a, 0xd0c8b0]

function furniture(P, f, extras, layout) {
  const { x, z, rot } = f
  const wood = TM("planks", 0xa88868)
  const dark = TM("wood", 0x7a5a3a)
  const r = [0, rot, 0]
  // local offsets rotated with the piece
  const L = (dx, dz) => [x + dx * Math.cos(rot) + dz * Math.sin(rot), z - dx * Math.sin(rot) + dz * Math.cos(rot)]
  const at = (dx, dy, dz) => {
    const [px, pz] = L(dx, dz)
    return [px, dy, pz]
  }
  switch (f.type) {
    case "counter":
      P.box(3.2, 1, 0.8, wood, x, 0.5, z, { rot: r })
      P.box(3.4, 0.1, 0.95, dark, x, 1.05, z, { rot: r })
      for (let i = 0; i < 3; i++) P.add(new THREE.CylinderGeometry(0.08, 0.1, 0.3, 6), TM("fabricTrim", GOODS[i]), { pos: at(-1 + i * 0.6, 1.25, 0) })
      break
    case "shelf":
    case "bookshelf": {
      P.box(2.2, 2.4, 0.5, dark, x, 1.2, z, { rot: r })
      for (let k = 0; k < 4; k++) {
        const y = 0.3 + k * 0.6
        P.box(2.1, 0.06, 0.48, wood, ...at(0, y, 0), { rot: r })
        for (let i = 0; i < (f.type === "bookshelf" ? 9 : 4); i++) {
          const c = GOODS[(i * 3 + k * 5 + Math.round(x * 7)) % GOODS.length]
          if (f.type === "bookshelf") P.box(0.16, 0.42, 0.34, TM("leather", c), ...at(-0.9 + i * 0.22, y + 0.24, 0.02), { rot: r })
          else P.add(new THREE.CylinderGeometry(0.1, 0.12, 0.34, 6), TM("fabricTrim", c), { pos: at(-0.8 + i * 0.5, y + 0.2, 0) })
        }
      }
      break
    }
    case "rack": {
      P.box(2.2, 0.12, 0.3, dark, x, 1.9, z, { rot: r })
      P.box(2.2, 0.12, 0.3, dark, x, 0.3, z, { rot: r })
      const bases = ["longsword", "war axe", "spear", "mace", "claymore"]
      for (let i = 0; i < 4; i++) {
        const w = buildWeapon({ base: bases[(i + Math.round(z)) % bases.length], material: i % 2 ? "steel" : "iron", color: i % 2 ? 0xa8adb3 : 0x6a6e73 })
        const [px, py, pz] = at(-0.75 + i * 0.5, 0.35, 0.05)
        w.position.set(px, py, pz)
        w.rotation.y = rot
        extras.add(w)
      }
      break
    }
    case "table":
      P.box(1.8, 0.1, 1.1, wood, x, 0.8, z, { rot: r })
      for (const sx of [-0.8, 0.8]) for (const sz of [-0.45, 0.45]) P.box(0.1, 0.8, 0.1, dark, ...at(sx, 0.4, sz), { rot: r })
      P.add(new THREE.CylinderGeometry(0.1, 0.08, 0.15, 8), TM("plate", 0xa8a8a8), { pos: at(0.4, 0.93, 0.1) })
      break
    case "longtable":
      P.box(5.2, 0.12, 1.2, wood, x, 0.85, z, { rot: r })
      for (const sx of [-2.4, 0, 2.4]) for (const sz of [-0.5, 0.5]) P.box(0.12, 0.85, 0.12, dark, ...at(sx, 0.42, sz), { rot: r })
      for (let i = 0; i < 4; i++) P.add(new THREE.CylinderGeometry(0.12, 0.1, 0.06, 8), TM("plate", 0xc8c8c8), { pos: at(-1.8 + i * 1.2, 0.93, 0) })
      break
    case "chair":
    case "stool":
      P.box(0.5, 0.08, 0.5, wood, x, 0.48, z, { rot: r })
      for (const sx of [-0.2, 0.2]) for (const sz of [-0.2, 0.2]) P.box(0.06, 0.48, 0.06, dark, ...at(sx, 0.24, sz), { rot: r })
      if (f.type === "chair") P.box(0.5, 0.6, 0.06, wood, ...at(0, 0.8, -0.22), { rot: r })
      break
    case "bed":
    case "bunk":
      P.box(1.1, 0.4, 2.1, dark, x, 0.2, z, { rot: r })
      P.box(1, 0.2, 1.9, TM("fabric", 0xc8b8a0), x, 0.5, z, { rot: r })
      P.box(1, 0.16, 1.2, TM("fabricTrim", 0x7a3a2a), ...at(0, 0.62, 0.35), { rot: r })
      P.box(0.8, 0.14, 0.4, TM("fabric", 0xf0e8d8), ...at(0, 0.66, -0.7), { rot: r })
      if (f.type === "bunk") {
        P.box(1.1, 0.3, 2.1, dark, x, 1.5, z, { rot: r })
        P.box(1, 0.2, 1.9, TM("fabric", 0xb8a890), x, 1.75, z, { rot: r })
        for (const sx of [-0.5, 0.5]) for (const sz of [-1, 1]) P.box(0.08, 2, 0.08, dark, ...at(sx, 1, sz), { rot: r })
      }
      break
    case "bedroll":
      P.box(0.9, 0.15, 2, TM("hide", 0xc8a888), x, 0.08, z, { rot: r })
      break
    case "barrel":
      P.add(lathe([[0.01, 0], [0.4, 0], [0.48, 0.5], [0.4, 1], [0.01, 1]], seg(12)), TM("planks"), { pos: [x, 0, z], uv: 1 })
      break
    case "crate":
      P.box(0.9, 0.9, 0.9, TM("planks"), x, 0.45, z, { rot: r, uv: 1 })
      break
    case "chest":
      P.box(1, 0.55, 0.65, TM("planks", 0x8a6a4a), x, 0.28, z, { rot: r })
      P.box(1.05, 0.2, 0.7, TM("planks", 0x6a4a2a), x, 0.63, z, { rot: r })
      break
    case "anvil":
      P.box(0.3, 0.55, 0.3, TM("dwemerMetal", 0x5a5a5a, { metal: true }), x, 0.28, z, { rot: r })
      P.box(0.75, 0.22, 0.34, TM("dwemerMetal", 0x4a4a4a, { metal: true }), x, 0.66, z, { rot: r })
      P.add(new THREE.ConeGeometry(0.12, 0.35, 4), TM("dwemerMetal", 0x4a4a4a, { metal: true }), { pos: at(0.5, 0.66, 0), rot: [0, rot, -Math.PI / 2] })
      break
    case "forge":
      P.box(1.8, 1, 1.4, TM("stoneBlocks", 0x8a7a6a), x, 0.5, z, { rot: r })
      P.box(1.4, 0.12, 1, GLOW, x, 1.02, z, { rot: r })
      P.cyl(0.5, 0.8, 2.2, TM("stoneBlocks", 0x6a5a4a), x, 2.1, z, { segs: 8 })
      break
    case "altar":
      P.box(2.4, 1.1, 1, TM("sandstone", 0xe0d0b0), x, 0.55, z, { rot: r })
      P.box(2.6, 0.12, 1.15, TM("fabricTrim", 0xa83a2a), x, 1.13, z, { rot: r })
      break
    case "pew":
      P.box(2.8, 0.1, 0.5, wood, x, 0.48, z, { rot: r })
      P.box(2.8, 0.6, 0.08, wood, ...at(0, 0.78, 0.22), { rot: r })
      for (const sx of [-1.3, 1.3]) P.box(0.08, 0.5, 0.5, dark, ...at(sx, 0.25, 0), { rot: r })
      break
    case "statue":
      P.cyl(0.5, 0.55, 0.6, TM("sandstone"), x, 0.3, z, { segs: 8 })
      P.add(lathe([[0.3, 0], [0.35, 0.8], [0.22, 1.5], [0.26, 1.7], [0.14, 2], [0.01, 2.1]], seg(10)), TM("sandstone", 0xd8d0c0), { pos: [x, 0.6, z] })
      P.add(new THREE.SphereGeometry(0.17, 8, 6), TM("sandstone", 0xd8d0c0), { pos: [x, 2.85, z] })
      break
    case "hearth":
      P.box(2.2, 0.5, 1, TM("stoneBlocks", 0x8a8078), x, 0.25, z, { rot: r })
      P.box(1.4, 0.2, 0.6, GLOW, x, 0.55, z, { rot: r })
      for (let i = 0; i < 3; i++) P.cyl(0.08, 0.08, 1, TM("wood", 0x5a4030), ...at(-0.3 + i * 0.3, 0.7, 0), { rot: [0, rot + i, Math.PI / 2], segs: 5 })
      break
    case "firepit":
      P.add(new THREE.TorusGeometry(0.7, 0.2, 5, seg(10)), TM("rock"), { pos: [x, 0.1, z], rot: [Math.PI / 2, 0, 0] })
      P.add(new THREE.ConeGeometry(0.4, 0.7, 6), GLOW, { pos: [x, 0.35, z] })
      break
    case "throne":
      P.box(1.2, 0.6, 1, TM("wood", 0x6a4a2a), x, 0.3, z, { rot: r })
      P.box(1.2, 1.8, 0.2, TM("wood", 0x6a4a2a), ...at(0, 1.2, 0.45), { rot: r })
      P.box(1, 0.1, 0.8, TM("fabricTrim", 0x7a2a2a), x, 0.65, z, { rot: r })
      break
    case "dummy":
      P.cyl(0.05, 0.05, 1.8, dark, x, 0.9, z, { segs: 5 })
      P.cyl(0.25, 0.28, 0.8, TM("hide", 0xc8b090), x, 1.3, z, { segs: 8 })
      P.add(new THREE.SphereGeometry(0.18, 8, 6), TM("hide", 0xc8b090), { pos: [x, 1.9, z] })
      P.box(1, 0.08, 0.08, dark, x, 1.5, z, { rot: r })
      break
    case "urn":
      P.add(lathe([[0.01, 0], [0.2, 0.05], [0.28, 0.3], [0.16, 0.6], [0.2, 0.7]], seg(10)), TM("sandstone", 0xb89878), { pos: [x, 0, z] })
      break
    case "rug":
      P.box(3, 0.02, 2, TM("fabricTrim", 0x8a3a2a), x, 0.01, z, { rot: r, uv: 0.8 })
      break
    case "banner":
      P.add(new THREE.PlaneGeometry(1.2, 2.6, 1, 2), TM("fabricTrim", 0xa83a2a, { side: THREE.DoubleSide }), { pos: [x, layout.H - 1.8, z], rot: r, uv: "keep" })
      break
    case "candles":
      for (let i = 0; i < 3; i++) {
        const [px, , pz] = at(-0.2 + i * 0.2, 0, 0)
        P.cyl(0.035, 0.035, 0.25 + i * 0.05, TM("fabric", 0xf0e8d8), px, 1.25, pz, { segs: 6 })
        P.add(new THREE.SphereGeometry(0.03, 5, 4), GLOW, { pos: [px, 1.42 + i * 0.03, pz] })
      }
      break
    case "totem":
      P.cyl(0.12, 0.15, 2.2, TM("wood", 0x6a4a3a), x, 1.1, z, { segs: 6 })
      P.add(new THREE.SphereGeometry(0.22, 8, 6), TM("bone", 0xe8e0c8), { pos: [x, 2.3, z] })
      break
    case "loom":
      P.box(1.6, 1.6, 0.1, dark, x, 0.8, z, { rot: r })
      P.box(1.3, 1.2, 0.02, TM("fabricTrim", 0x5a7a8a), ...at(0, 0.9, 0.05), { rot: r })
      break
  }
}

export { GLOW_COOL }
