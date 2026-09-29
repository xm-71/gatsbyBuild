import * as THREE from "three"
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import { CELL, FLOOR } from "../logic/dungeongen.js"
import { texture, texturedMaterial } from "./texgen.js"
import { Builder, lathe, rockGeometry, taperTube } from "./geom.js"
import { GLOW } from "./buildings.js"
import { createNoise2D } from "../core/noise.js"
import { srgbColor } from "./textures.js"
import { Q, seg } from "../core/quality.js"

export const THEME_LOOK = {
  cave: { floor: "caveRock", wall: "caveRock", ceil: "caveRock", floorTint: 0x8a7a68, wallTint: 0xb0a090, ceilTint: 0x6a5e50, height: 5, light: 0xffa050, fog: 0x0c0906, ambient: 0x3a3026, wall3: [0x6a, 0x5e, 0x50], organic: true },
  barrow: { floor: "floorTiles", wall: "tombBrick", ceil: "caveRock", floorTint: 0x9aa4b0, wallTint: 0x9aa8b8, ceilTint: 0x6a7a8a, height: 4.2, light: 0x9ac8ff, fog: 0x06090e, ambient: 0x283444, wall3: [0x6a, 0x74, 0x80], trim: "sandstone", beams: "planks" },
  tomb: { floor: "floorTiles", wall: "tombBrick", ceil: "tombBrick", floorTint: 0xb0a898, wallTint: 0xd0c4b0, ceilTint: 0x8a8070, height: 3.8, light: 0xc0d0ff, fog: 0x08080c, ambient: 0x2e3038, wall3: [0x8a, 0x7e, 0x68], trim: "sandstone", beams: "planks" },
  dwemer: { floor: "dwemerFloor", wall: "dwemerMetal", ceil: "dwemerMetal", floorTint: 0xffffff, wallTint: 0xffffff, ceilTint: 0x9a8a70, height: 6, light: 0xffd080, fog: 0x0e0a06, ambient: 0x3a3020, wall3: [0xa0, 0x80, 0x40], trim: "dwemerMetal", pipes: true },
  daedric: { floor: "daedricStone", wall: "daedricStone", ceil: "daedricStone", floorTint: 0xb0a0a0, wallTint: 0xffffff, ceilTint: 0x6a5a5a, height: 7, light: 0xff5a30, fog: 0x0c0404, ambient: 0x3a2020, wall3: [0x5a, 0x3a, 0x30], trim: "daedricStone", ribs: true },
  citadel: { floor: "flesh", wall: "flesh", ceil: "flesh", floorTint: 0x9a7a70, wallTint: 0xffffff, ceilTint: 0x7a5a50, height: 7, light: 0xff4020, fog: 0x100404, ambient: 0x3a1a14, wall3: [0x6a, 0x30, 0x28], organic: true },
}

function surfaceMat(tex, tint) {
  return texturedMaterial(tex, { color: tint })
}

export function buildDungeonMesh(lvl) {
  const look = THEME_LOOK[lvl.type]
  const H = look.height
  const noise = createNoise2D(`cave:${lvl.type}:${lvl.level}`)
  const isFloor = (x, y) => x >= 0 && y >= 0 && x < lvl.w && y < lvl.h && lvl.grid[y * lvl.w + x] === FLOOR
  const organic = !!look.organic
  const sub = organic ? Math.max(2, Math.round(3 * Q.seg)) : 1

  // Continuous displacement field so shared edges of neighbouring quads agree.
  const disp = (x, y, z, out) => {
    if (!organic) return out.set(x, y, z)
    const amp = 0.75
    const dx = noise.fbm(x * 0.35 + y * 0.21, z * 0.35, 3) * amp
    const dz = noise.fbm(x * 0.35 + 40, z * 0.35 + y * 0.19, 3) * amp
    let dy = noise.fbm(x * 0.4 + 90, z * 0.4 - y * 0.3, 3)
    if (y < 0.01) dy = dy * 0.12
    else if (y > H - 0.01) dy = dy * 0.9 - 0.2
    else dy *= 0.4
    return out.set(x + dx, y + dy, z + dz)
  }

  const buckets = { floor: [], wall: [], ceil: [] }
  const tmp = new THREE.Vector3()
  // emit a (possibly subdivided and displaced) quad; corners a,b,c,d counter-clockwise from the visible side
  function quad(kind, a, b, c, d, uvFn) {
    const arr = buckets[kind]
    const P = (u, v) => {
      const x = a[0] + (b[0] - a[0]) * u + (d[0] - a[0]) * v
      const y = a[1] + (b[1] - a[1]) * u + (d[1] - a[1]) * v
      const z = a[2] + (b[2] - a[2]) * u + (d[2] - a[2]) * v
      disp(x, y, z, tmp)
      const [tu, tv] = uvFn(x, y, z)
      // darken near floor/ceiling seams (cheap ambient occlusion)
      let ao = 1
      if (kind === "wall") ao = 0.55 + 0.45 * Math.min(1, y / 1.2) * Math.min(1, (H - y) / 0.8)
      return [tmp.x, tmp.y, tmp.z, tu, tv, ao]
    }
    for (let j = 0; j < sub; j++)
      for (let i = 0; i < sub; i++) {
        const u0 = i / sub
        const u1 = (i + 1) / sub
        const v0 = j / sub
        const v1 = (j + 1) / sub
        const p00 = P(u0, v0)
        const p10 = P(u1, v0)
        const p11 = P(u1, v1)
        const p01 = P(u0, v1)
        arr.push(p00, p10, p11, p00, p11, p01)
      }
  }

  // floors follow the level's corner heights (ramps between raised and
  // sunken rooms); walls reach down past the lowest floor
  const CH = lvl.corners
  const cw = lvl.w + 1
  const ch = (x, y) => (CH ? CH[y * cw + x] : 0)
  const WB = -1.8 // wall bottom
  for (let y = 0; y < lvl.h; y++) {
    for (let x = 0; x < lvl.w; x++) {
      if (!isFloor(x, y)) continue
      const x0 = x * CELL
      const x1 = x0 + CELL
      const z0 = y * CELL
      const z1 = z0 + CELL
      const fuv = (px, py, pz) => [px / 4, pz / 4]
      quad("floor", [x0, ch(x, y), z0], [x0, ch(x, y + 1), z1], [x1, ch(x + 1, y + 1), z1], [x1, ch(x + 1, y), z0], fuv)
      quad("ceil", [x0, H, z0], [x1, H, z0], [x1, H, z1], [x0, H, z1], fuv)
      const wx = (px, py) => [px / 4, py / 4]
      const wz = (px, py, pz) => [pz / 4, py / 4]
      if (!isFloor(x, y - 1)) quad("wall", [x0, WB, z0], [x1, WB, z0], [x1, H, z0], [x0, H, z0], wx)
      if (!isFloor(x, y + 1)) quad("wall", [x1, WB, z1], [x0, WB, z1], [x0, H, z1], [x1, H, z1], wx)
      if (!isFloor(x - 1, y)) quad("wall", [x0, WB, z1], [x0, WB, z0], [x0, H, z0], [x0, H, z1], wz)
      if (!isFloor(x + 1, y)) quad("wall", [x1, WB, z0], [x1, WB, z1], [x1, H, z1], [x1, H, z0], wz)
    }
  }

  const group = new THREE.Group()
  const materials = { floor: surfaceMat(look.floor, look.floorTint), wall: surfaceMat(look.wall, look.wallTint), ceil: surfaceMat(look.ceil, look.ceilTint) }
  for (const kind of ["floor", "wall", "ceil"]) {
    const verts = buckets[kind]
    const pos = new Float32Array(verts.length * 3)
    const uv = new Float32Array(verts.length * 2)
    const col = new Float32Array(verts.length * 3)
    verts.forEach((v, i) => {
      pos.set([v[0], v[1], v[2]], i * 3)
      uv.set([v[3], v[4]], i * 2)
      col.set([v[5], v[5], v[5]], i * 3)
    })
    let geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2))
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3))
    if (organic) {
      geo = mergeVertices(geo, 1e-3)
      geo.computeVertexNormals()
    } else geo.computeVertexNormals()
    const m = materials[kind].clone()
    m.vertexColors = true
    const mesh = new THREE.Mesh(geo, m)
    mesh.receiveShadow = true
    group.add(mesh)
  }

  // architectural detail, props and lights merged per level
  const B = new Builder()
  const trim = look.trim ? texturedMaterial(look.trim, { color: 0xb0a8a0, metal: look.trim === "dwemerMetal" }) : null
  const center = (x, y) => [x * CELL + CELL / 2, y * CELL + CELL / 2]
  if (!organic) {
    for (let y = 0; y < lvl.h; y++)
      for (let x = 0; x < lvl.w; x++) {
        if (!isFloor(x, y)) continue
        const [cx, cz] = center(x, y)
        // baseboards and cornices on each wall face
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          if (isFloor(x + dx, y + dy)) continue
          const along = dx === 0
          const px = cx + dx * (CELL / 2 - 0.12)
          const pz = cz + dy * (CELL / 2 - 0.12)
          B.add(new THREE.BoxGeometry(along ? CELL : 0.26, 0.4, along ? 0.26 : CELL), trim, { pos: [px, 0.2 + (lvl.heights ? lvl.heights[y * lvl.w + x] : 0), pz], uv: 1.5 })
          B.add(new THREE.BoxGeometry(along ? CELL : 0.3, 0.3, along ? 0.3 : CELL), trim, { pos: [px, H - 0.15, pz], uv: 1.5 })
        }
        // pillars where two walls meet at an inside corner
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          if (!isFloor(x + dx, y) && !isFloor(x, y + dy)) {
            B.add(new THREE.CylinderGeometry(0.32, 0.38, H + 1.8, seg(10)), trim, { pos: [cx + dx * (CELL / 2 - 0.3), (H - 1.8) / 2, cz + dy * (CELL / 2 - 0.3)], uv: 1.5 })
          }
        }
        // ceiling beams, pipes or ribs every other cell
        if ((x + y) % 2 === 0) {
          const horiz = isFloor(x - 1, y) || isFloor(x + 1, y)
          if (look.beams) B.add(new THREE.BoxGeometry(horiz ? 0.35 : CELL, 0.35, horiz ? CELL : 0.35), texturedMaterial("planks", { color: 0x9a8a70 }), { pos: [cx, H - 0.2, cz], uv: 1 })
          if (look.ribs) B.add(new THREE.TorusGeometry(CELL / 2 - 0.1, 0.18, 5, seg(10), Math.PI), trim, { pos: [cx, H - CELL / 2 + 0.3, cz], rot: [0, horiz ? Math.PI / 2 : 0, 0], scale: [1, 0.35, 1], uv: 1.5 })
        }
        if (look.pipes && (x * 7 + y * 3) % 5 === 0) {
          for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            if (isFloor(x + dx, y + dy)) continue
            const along = dx === 0
            B.add(new THREE.CylinderGeometry(0.22, 0.22, CELL, seg(10)), trim, { pos: [cx + dx * (CELL / 2 - 0.35), H - 0.9, cz + dy * (CELL / 2 - 0.35)], rot: along ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0], uv: 1 })
            break
          }
        }
      }
  } else {
    // stalactites and stalagmites for organic caves
    const rng = mulberry(lvl.w * 31 + lvl.level)
    for (let i = 0; i < lvl.rooms.length * 5; i++) {
      const r = lvl.rooms[Math.floor(rng() * lvl.rooms.length)]
      const gx = r.x + Math.floor(rng() * r.w)
      const gy = r.y + Math.floor(rng() * r.h)
      if (!isFloor(gx, gy)) continue
      const [cx, cz] = center(gx, gy)
      const ox = (rng() - 0.5) * 3
      const oz = (rng() - 0.5) * 3
      const h = 0.6 + rng() * 1.6
      B.add(lathe([[0.35 * h, 0], [0.18 * h, h * 0.5], [0.02, h]], seg(7)), texturedMaterial(look.wall, { color: look.wallTint }), { pos: [cx + ox, H + 0.2, cz + oz], rot: [Math.PI, 0, 0], uv: 1 })
    }
  }

  // lights: hanging lanterns / braziers
  const lightObjs = []
  const lights = lvl.lights.slice(0, 9)
  for (const l of lights) {
    const [cx, cz] = center(l.x, l.y)
    const light = new THREE.PointLight(look.light, 45, 30, 1.5)
    light.position.set(cx, H - 1.4, cz)
    group.add(light)
    lightObjs.push(light)
    if (lvl.type === "cave") {
      // torch on a pole
      B.add(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 6), texturedMaterial("wood"), { pos: [cx + 1.2, 1.1, cz], uv: 1 })
      B.add(new THREE.ConeGeometry(0.16, 0.4, 6), GLOW, { pos: [cx + 1.2, 2.35, cz] })
      light.position.set(cx + 1.2, 2.6, cz)
    } else {
      B.add(new THREE.CylinderGeometry(0.015, 0.015, 1, 4), texturedMaterial("plate", { color: 0x3a3a3a }), { pos: [cx, H - 0.5, cz], uv: 1 })
      B.add(lathe([[0.02, -0.35], [0.28, -0.25], [0.32, 0], [0.26, 0.2], [0.05, 0.3]], seg(10)), GLOW, { pos: [cx, H - 1.35, cz] })
      B.add(new THREE.TorusGeometry(0.3, 0.03, 4, seg(10)), texturedMaterial("plate", { color: 0x5a4a30 }), { pos: [cx, H - 1.35, cz], rot: [Math.PI / 2, 0, 0], uv: 1 })
    }
  }

  const reserved = new Set()
  const cellH = (x, y) => (lvl.heights ? lvl.heights[y * lvl.w + x] : 0)
  for (const p of lvl.props) addProp(B, { ...p, hy: cellH(p.x, p.y) }, look, center)
  void reserved
  group.add(B.build())
  return { group, height: H, look, lights: lightObjs }
}

function mulberry(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function addProp(B, p, look, center) {
  const [cx0, cz0] = center(p.x, p.y)
  const cx = cx0 + p.ox
  const cz = cz0 + p.oz
  const r = p.rot
  const TM = (n, c = 0xffffff, extra) => texturedMaterial(n, { color: c, ...extra })
  const hy = p.hy || 0
  const at = (dx, dy, dz) => [cx + Math.cos(r) * dx + Math.sin(r) * dz, dy + hy, cz - Math.sin(r) * dx + Math.cos(r) * dz]
  switch (p.type) {
    case "urn":
      B.add(lathe([[0.01, 0], [0.28, 0.02], [0.42, 0.4], [0.36, 0.8], [0.18, 0.95], [0.22, 1.1], [0.2, 1.15]], seg(14)), TM("plaster", 0xa87a58), { pos: at(0, 0, 0), uv: 1 })
      B.add(new THREE.TorusGeometry(0.4, 0.03, 4, seg(14)), TM("plaster", 0x5a3a28), { pos: at(0, 0.45, 0), rot: [Math.PI / 2, 0, 0], uv: 1 })
      break
    case "crate":
      B.add(new THREE.BoxGeometry(1.1, 1.1, 1.1), TM("planks"), { pos: at(0, 0.55, 0), rot: [0, r, 0], uv: 1.1 })
      for (const s of [-1, 1]) B.add(new THREE.BoxGeometry(1.14, 0.12, 0.12), TM("wood"), { pos: at(0, 0.55 + s * 0.45, 0.52), rot: [0, r, 0], uv: 1 })
      break
    case "barrel":
      B.add(lathe([[0.01, 0], [0.42, 0], [0.5, 0.6], [0.42, 1.2], [0.01, 1.2]], seg(14)), TM("planks"), { pos: at(0, 0, 0), uv: 1 })
      for (const y of [0.18, 1.02]) B.add(new THREE.TorusGeometry(0.46, 0.035, 4, seg(16)), TM("plate", 0x5a5a5a), { pos: at(0, y, 0), rot: [Math.PI / 2, 0, 0], uv: 1 })
      break
    case "sack":
      B.add(new THREE.SphereGeometry(0.5, seg(10), 8), TM("hide", 0xc0b090), { pos: at(0, 0.35, 0), scale: [1, 0.7, 0.9], uv: 1 })
      B.add(new THREE.ConeGeometry(0.15, 0.3, 6), TM("hide", 0xc0b090), { pos: at(0, 0.8, 0), uv: 1 })
      break
    case "bones":
      for (let i = 0; i < 5; i++) B.add(new THREE.CylinderGeometry(0.035, 0.045, 0.55, 5), TM("bone", 0xe0d8c0), { pos: at((i - 2) * 0.14, 0.05, (i % 2) * 0.2), rot: [Math.PI / 2, 0, i * 0.7], uv: 0.5 })
      B.add(new THREE.SphereGeometry(0.14, seg(8), 6), TM("bone", 0xe0d8c0), { pos: at(0.35, 0.12, 0.1), scale: [1, 0.9, 1.2], uv: 0.5 })
      B.add(new THREE.SphereGeometry(0.1, 6, 4), TM("bone", 0xe0d8c0), { pos: at(-0.4, 0.08, -0.1), scale: [1.3, 0.7, 1], uv: 0.5 })
      break
    case "candles":
      for (let i = 0; i < 4; i++) {
        const h = 0.25 + i * 0.1
        B.add(new THREE.CylinderGeometry(0.05, 0.055, h, 6), TM("plaster", 0xf0e8d0), { pos: at(i * 0.16 - 0.24, h / 2, (i % 2) * 0.14), uv: 0.5 })
        B.add(new THREE.ConeGeometry(0.03, 0.08, 5), GLOW, { pos: at(i * 0.16 - 0.24, h + 0.05, (i % 2) * 0.14) })
      }
      break
    case "coffin":
      B.add(new THREE.BoxGeometry(0.95, 0.6, 2.2), TM("planks", 0x8a7060), { pos: at(0, 0.3, 0), rot: [0, r, 0], uv: 1 })
      B.add(new THREE.BoxGeometry(1.05, 0.12, 2.3), TM("wood", 0x6a5040), { pos: at(0, 0.66, 0), rot: [0, r + 0.08, 0], uv: 1 })
      break
    case "pipe":
      B.add(new THREE.CylinderGeometry(0.3, 0.3, look.height, seg(12)), TM("dwemerMetal", 0xffffff, { metal: true }), { pos: at(0, look.height / 2, 0), uv: 1 })
      for (const y of [0.4, look.height - 0.6]) B.add(new THREE.TorusGeometry(0.34, 0.07, 5, seg(14)), TM("dwemerMetal", 0xa08050, { metal: true }), { pos: at(0, y, 0), rot: [Math.PI / 2, 0, 0], uv: 1 })
      break
    case "gear": {
      const m = TM("dwemerMetal", 0xffffff, { metal: true })
      B.add(new THREE.CylinderGeometry(0.6, 0.6, 0.12, seg(16)), m, { pos: at(0, 0.08, 0), uv: 1 })
      for (let i = 0; i < 12; i++) B.add(new THREE.BoxGeometry(0.16, 0.12, 0.2), m, { pos: at(Math.cos((i / 12) * Math.PI * 2) * 0.68, 0.08, Math.sin((i / 12) * Math.PI * 2) * 0.68), rot: [0, -(i / 12) * Math.PI * 2, 0], uv: 1 })
      break
    }
    case "lamp":
      B.add(new THREE.CylinderGeometry(0.05, 0.12, 1.7, 8), TM("dwemerMetal", 0xffffff, { metal: true }), { pos: at(0, 0.85, 0), uv: 1 })
      B.add(new THREE.SphereGeometry(0.22, seg(10), 8), GLOW, { pos: at(0, 1.85, 0) })
      B.add(new THREE.TorusGeometry(0.24, 0.04, 4, seg(12)), TM("dwemerMetal", 0xffffff, { metal: true }), { pos: at(0, 1.85, 0), uv: 1 })
      break
    case "stalagmite":
      B.add(rockGeometry(p.x * 13 + p.y, 1, 0.5, 0.3), TM(look.wall, look.wallTint), { pos: at(0, 0, 0), scale: [1, 3.2, 1], uv: 1 })
      break
    case "statue": {
      const m = TM("daedricStone", 0x9a8a8a)
      B.add(new THREE.BoxGeometry(1, 0.6, 1), m, { pos: at(0, 0.3, 0), rot: [0, r, 0], uv: 1 })
      B.add(lathe([[0.3, 0], [0.42, 0.4], [0.28, 1.2], [0.36, 1.8], [0.2, 2.1], [0.01, 2.15]], seg(10)), m, { pos: at(0, 0.6, 0), uv: 1 })
      B.add(new THREE.SphereGeometry(0.28, seg(10), 8), m, { pos: at(0, 3, 0), uv: 1 })
      for (const s of [-1, 1]) B.add(taperTube([new THREE.Vector3(s * 0.15, 3.15, 0), new THREE.Vector3(s * 0.4, 3.5, -0.1), new THREE.Vector3(s * 0.35, 3.9, -0.3)], 0.07, 0.01, 5, 6), m, { pos: [cx, hy, cz], uv: 1 })
      break
    }
    case "brazier":
      B.add(lathe([[0.1, 0], [0.12, 0.7], [0.45, 0.9], [0.5, 1.1], [0.4, 1.12]], seg(12)), TM("plate", 0x4a3a30), { pos: at(0, 0, 0), uv: 1 })
      B.add(new THREE.ConeGeometry(0.35, 0.8, 7), GLOW, { pos: at(0, 1.45, 0) })
      break
    case "altar":
      B.add(new THREE.BoxGeometry(2.2, 1, 1.1), TM("daedricStone"), { pos: at(0, 0.5, 0), rot: [0, r, 0], uv: 1 })
      B.add(new THREE.BoxGeometry(2.4, 0.15, 1.3), TM("daedricStone", 0x8a7070), { pos: at(0, 1.05, 0), rot: [0, r, 0], uv: 1 })
      for (const s of [-0.8, 0.8]) B.add(new THREE.ConeGeometry(0.04, 0.1, 5), GLOW, { pos: at(s, 1.2, 0) })
      break
    case "fleshpillar":
      B.add(lathe([[0.9, 0], [0.6, 1.2], [0.8, 2.4], [0.55, 3.8], [0.75, 5.2], [0.9, look.height]], seg(12)), TM("flesh"), { pos: at(0, 0, 0), uv: 1.5 })
      break
    default:
      B.add(new THREE.BoxGeometry(0.6, 0.6, 0.6), TM("planks"), { pos: at(0, 0.3, 0), uv: 1 })
  }
}

export function buildChestMesh(open = false) {
  const g = new THREE.Group()
  const wood = texturedMaterial("planks", { color: 0x9a7050 })
  const iron = texturedMaterial("plate", { color: 0x4a4038, metal: true })
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.72), wood)
  base.position.y = 0.3
  base.castShadow = true
  g.add(base)
  for (const x of [-0.45, 0.45]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 0.76), iron)
    band.position.set(x, 0.3, 0)
    g.add(band)
  }
  const lidPivot = new THREE.Group()
  lidPivot.position.set(0, 0.6, -0.36)
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 1.2, seg(12), 1, false, 0, Math.PI), wood)
  lid.rotation.z = Math.PI / 2
  lid.rotation.x = -Math.PI / 2
  lid.position.set(0, 0, 0.36)
  lid.scale.set(1, 1, 0.55)
  lidPivot.add(lid)
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.05), iron)
  lock.position.set(0, -0.05, 0.74)
  lidPivot.add(lock)
  g.add(lidPivot)
  if (open) lidPivot.rotation.x = -1.2
  g.userData.lid = lidPivot
  return g
}

export function buildStairs(down, look) {
  const g = new THREE.Group()
  const stone = texturedMaterial(look.trim || look.wall, { color: 0xc0b8a8 })
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.3, 0.6), stone)
    post.position.set(sx * 1.25, 1.65, 0)
    g.add(post)
  }
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.6, seg(14), 1, false, 0, Math.PI), stone)
  top.rotation.z = Math.PI / 2
  top.rotation.y = Math.PI / 2
  top.position.y = 3.2
  top.scale.set(0.5, 1, 1)
  g.add(top)
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(2, 3.2), new THREE.MeshBasicMaterial({ color: down ? 0x050302 : 0x3a3024, side: THREE.DoubleSide }))
  portal.position.y = 1.6
  g.add(portal)

  void srgbColor
  void texture
  return g
}
