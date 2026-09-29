// Furnished interiors for town buildings. Pure data: room size, furniture
// (type, position, rotation), where the people inside stand, and lights.
// The room is centred on the origin with the floor at y = 0 and the door in
// the wall at -z.
import { RNG } from "../core/rng.js"

// Furniture footprints for collision: [half-width, half-depth] boxes, or a
// radius for round things. null means you can walk over it.
export const FOOTPRINT = {
  counter: [1.6, 0.4], shelf: [1.2, 0.3], bookshelf: [1.1, 0.3], rack: [1.1, 0.3], table: [0.9, 0.55], longtable: [2.6, 0.6],
  chair: 0.3, stool: 0.25, bed: [0.55, 1.05], bunk: [0.55, 1.05], barrel: 0.45, crate: [0.45, 0.45], anvil: [0.4, 0.25],
  forge: [0.9, 0.7], altar: [1.2, 0.5], pew: [1.4, 0.3], statue: 0.55, hearth: [1.1, 0.5], firepit: 0.9, throne: [0.6, 0.55],
  dummy: 0.35, chest: [0.5, 0.35], urn: 0.3, bedroll: null, rug: null, banner: null, candles: null, totem: 0.3, loom: [0.8, 0.4],
}

export function generateInterior(town, b) {
  const rng = new RNG(`interior:${town.id}:${b.idx}:${town.x.toFixed(1)}`)
  const style = town.style
  const big = b.type === "temple" || b.type === "manor" || b.type === "fort" || b.type === "hall"
  const W = Math.round(Math.max(8, b.w * 1.25) + (big ? 4 : 0))
  const D = Math.round(Math.max(8, b.d * 1.35) + (big ? 5 : 0))
  const H = big ? 6 : 4
  const f = []
  const spots = [] // where the people inside stand: {x, z, yaw}
  const lights = []
  const add = (type, x, z, rot = 0, extra = {}) => f.push({ type, x, z, rot, ...extra })
  const back = D / 2 - 0.8
  const left = -W / 2 + 0.6
  const right = W / 2 - 0.6
  // facing the door (toward -z) is yaw π
  const facingDoor = Math.PI
  const kind = b.label === "Fighters Guild" ? "fighters" : b.label === "Mages Guild" ? "mages" : b.label === "Cornerclub" ? "thieves" : b.label === "Morag Tong Guildhall" ? "tong" : b.type

  switch (kind) {
    case "shop":
      add("counter", 0, back - 1.6)
      spots.push({ x: 0, z: back - 0.6, yaw: facingDoor })
      for (let x = left + 1; x < right - 0.8; x += 2.4) add("shelf", x, back, 0)
      for (let i = 0; i < 3; i++) add(rng.chance(0.5) ? "barrel" : "crate", left + 0.3, -D / 4 + i * 1.1)
      add("rug", 0, 0)
      lights.push([0, H - 0.6, 0])
      break
    case "smithy":
      add("forge", right - 1, back - 0.8)
      add("anvil", right - 2.4, back - 2.2, 0.3)
      spots.push({ x: right - 2.4, z: back - 3.1, yaw: 0, work: "hammer" })
      add("rack", left, 0, Math.PI / 2)
      add("rack", left, 2.4, Math.PI / 2)
      add("counter", -0.5, back - 1.4)
      add("barrel", right - 0.4, -D / 4)
      lights.push([right - 1, 1.2, back - 0.8, 0xff7a30])
      lights.push([0, H - 0.6, -1])
      break
    case "temple":
      add("altar", 0, back - 0.8)
      add("statue", -2.2, back - 0.5)
      add("statue", 2.2, back - 0.5)
      spots.push({ x: 0, z: back - 2, yaw: facingDoor })
      for (let z = -D / 2 + 3; z < back - 3.4; z += 1.8) for (const sx of [-1, 1]) add("pew", sx * (W / 4 + 0.2), z)
      add("candles", -1, back - 0.6)
      add("candles", 1, back - 0.6)
      for (const sx of [-1, 1]) add("banner", sx * (W / 2 - 0.05), 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2)
      lights.push([0, H - 1, back - 2, 0xffd8a0], [0, H - 1, -1])
      break
    case "mages":
      for (let x = left + 1.1; x < right - 0.9; x += 2.3) add("bookshelf", x, back)
      add("bookshelf", left, 0, Math.PI / 2)
      add("table", 0, 0.5)
      add("candles", 0, 0.5)
      add("chair", 0, 1.4, Math.PI)
      spots.push({ x: 0, z: 2, yaw: facingDoor })
      add("rug", 0, 0.2)
      lights.push([0, H - 0.8, 0.5, 0xc0d0ff])
      break
    case "fighters":
      add("rack", left, 0, Math.PI / 2)
      add("rack", right, 0, -Math.PI / 2)
      add("dummy", -1.8, 2)
      add("dummy", 1.8, 2)
      add("table", 0, back - 1)
      spots.push({ x: 0, z: back - 2, yaw: facingDoor })
      add("chest", right - 0.7, back - 0.5)
      lights.push([0, H - 0.6, 0])
      break
    case "thieves":
      add("counter", -W / 4, back - 1.2)
      spots.push({ x: -W / 4, z: back - 0.4, yaw: facingDoor })
      for (let i = 0; i < 3; i++) {
        const x = W / 4 - 0.4 + (i % 2) * 0.6
        const z = -D / 4 + i * 2
        add("table", x, z)
        add("stool", x - 1.1, z)
        add("stool", x + 1.1, z)
      }
      add("barrel", left + 0.2, back - 0.3)
      add("barrel", left + 1.1, back - 0.3)
      lights.push([0, H - 0.8, 0, 0xffb060])
      break
    case "tong":
      add("table", 0, back - 1.4)
      add("chair", 0, back - 0.6, facingDoor)
      spots.push({ x: 1.2, z: back - 1.6, yaw: facingDoor })
      add("banner", 0, back + 0.25, Math.PI)
      add("statue", left + 0.6, back - 0.6)
      lights.push([0, H - 1, back - 1.4, 0xff5a40])
      break
    case "manor":
    case "hall":
      add("longtable", 0, 0.5)
      for (let x = -2; x <= 2; x += 1.3) for (const sz of [-1, 1]) add("chair", x, 0.5 + sz * 1.1, sz > 0 ? Math.PI : 0)
      add("throne", 0, back - 0.8)
      spots.push({ x: 0, z: back - 1.8, yaw: facingDoor })
      if (style === "nord") add("hearth", 0, -1.2)
      for (const sx of [-1, 1]) add("banner", sx * (W / 2 - 0.05), 1, sx > 0 ? -Math.PI / 2 : Math.PI / 2)
      lights.push([0, H - 1, 0], [0, H - 1, back - 2])
      break
    case "fort":
      for (let z = -D / 2 + 2.5; z < back - 2; z += 2.4) add("bunk", left + 0.6, z)
      add("rack", right, 0, -Math.PI / 2)
      add("table", 0, back - 1.5)
      spots.push({ x: 0, z: back - 2.6, yaw: facingDoor })
      add("banner", 0, back + 0.25, Math.PI)
      lights.push([0, H - 0.8, 0])
      break
    case "yurt":
      add("firepit", 0, 0.3)
      add("bedroll", -W / 4, back - 0.8)
      add("bedroll", W / 4, back - 0.8)
      add("totem", right - 0.5, back - 0.5)
      spots.push({ x: 0, z: back - 1.8, yaw: facingDoor })
      lights.push([0, 1.2, 0.3, 0xff8a40])
      break
    default: {
      // a home: bed, table and chairs, a hearth or stove, a chest
      add("bed", right - 0.7, back - 1.1)
      add("chest", right - 0.7, back - 2.6)
      add("table", -0.6, 0.6)
      add("chair", -0.6, 1.5, Math.PI)
      add("chair", -1.6, 0.6, Math.PI / 2)
      add(style === "nord" ? "hearth" : rng.chance(0.5) ? "loom" : "shelf", left + (style === "nord" ? 1.2 : 0), back - (style === "nord" ? 0.6 : 0), 0)
      add("rug", 0.3, -0.5)
      if (rng.chance(0.6)) add("barrel", left + 0.3, -D / 2 + 1.2)
      if (rng.chance(0.6)) add("urn", right - 0.4, -D / 2 + 1)
      spots.push({ x: -1.4, z: 2, yaw: facingDoor, wander: true }, { x: 1.6, z: -0.8, yaw: -Math.PI / 2, wander: true })
      lights.push([0, H - 0.6, 0.4])
    }
  }
  // lanterns glow where the lights hang
  return { W, D, H, style, kind, furniture: f, spots, lights, name: b.label || "Home" }
}
