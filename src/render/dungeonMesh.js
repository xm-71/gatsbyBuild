import * as THREE from "three"
import { CELL, FLOOR } from "../logic/dungeongen.js"
import { detailTexture, srgbColor } from "./textures.js"

export const THEME_LOOK = {
  cave: { floor: [0x5a, 0x4e, 0x40], wall: [0x6a, 0x5e, 0x50], ceil: [0x3a, 0x32, 0x28], tex: "ground", height: 5, light: 0xffa050, fog: 0x0c0906, ambient: 0x3a3026 },
  tomb: { floor: [0x6a, 0x62, 0x58], wall: [0x8a, 0x7e, 0x68], ceil: [0x4a, 0x42, 0x38], tex: "stone", height: 3.6, light: 0xc0d0ff, fog: 0x08080c, ambient: 0x2e3038 },
  dwemer: { floor: [0x7a, 0x64, 0x40], wall: [0xa0, 0x80, 0x40], ceil: [0x5a, 0x46, 0x28], tex: "metal", height: 6, light: 0xffd080, fog: 0x0e0a06, ambient: 0x3a3020 },
  daedric: { floor: [0x3a, 0x2a, 0x26], wall: [0x5a, 0x3a, 0x30], ceil: [0x2a, 0x1a, 0x16], tex: "stone", height: 7, light: 0xff5a30, fog: 0x0c0404, ambient: 0x3a2020 },
  citadel: { floor: [0x4a, 0x2a, 0x22], wall: [0x6a, 0x30, 0x28], ceil: [0x3a, 0x1a, 0x14], tex: "flesh", height: 7, light: 0xff4020, fog: 0x100404, ambient: 0x3a1a14 },
}

export function buildDungeonMesh(lvl) {
  const look = THEME_LOOK[lvl.type]
  const H = look.height
  const pos = []
  const col = []
  const uv = []
  const idx = []
  const tmp = new THREE.Color()
  let seed = 1
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

  function quad(a, b, c, d, rgb, u0, v0, u1, v1) {
    const base = pos.length / 3
    for (const p of [a, b, c, d]) pos.push(p[0], p[1], p[2])
    const f = 0.85 + rand() * 0.3
    tmp.copy(srgbColor(rgb[0] * f, rgb[1] * f, rgb[2] * f))
    for (let i = 0; i < 4; i++) col.push(tmp.r, tmp.g, tmp.b)
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1)
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  const isFloor = (x, y) => x >= 0 && y >= 0 && x < lvl.w && y < lvl.h && lvl.grid[y * lvl.w + x] === FLOOR
  const s = CELL / 4
  for (let y = 0; y < lvl.h; y++) {
    for (let x = 0; x < lvl.w; x++) {
      if (!isFloor(x, y)) continue
      const x0 = x * CELL
      const x1 = x0 + CELL
      const z0 = y * CELL
      const z1 = z0 + CELL
      // floor (counter-clockwise when seen from above => normal up)
      quad([x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0], look.floor, x0 / 4, z0 / 4, x1 / 4, z1 / 4)
      // ceiling (normal down)
      quad([x0, H, z0], [x1, H, z0], [x1, H, z1], [x0, H, z1], look.ceil, x0 / 4, z0 / 4, x1 / 4, z1 / 4)
      // walls facing into this cell
      const u0 = 0
      const u1 = s
      const v1 = H / 4
      if (!isFloor(x, y - 1)) quad([x0, 0, z0], [x1, 0, z0], [x1, H, z0], [x0, H, z0], look.wall, u0, 0, u1, v1)
      if (!isFloor(x, y + 1)) quad([x1, 0, z1], [x0, 0, z1], [x0, H, z1], [x1, H, z1], look.wall, u0, 0, u1, v1)
      if (!isFloor(x - 1, y)) quad([x0, 0, z1], [x0, 0, z0], [x0, H, z0], [x0, H, z1], look.wall, u0, 0, u1, v1)
      if (!isFloor(x + 1, y)) quad([x1, 0, z0], [x1, 0, z1], [x1, H, z1], [x1, H, z0], look.wall, u0, 0, u1, v1)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3))
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTexture(look.tex), side: THREE.FrontSide })
  const mesh = new THREE.Mesh(geo, material)
  mesh.receiveShadow = true
  const group = new THREE.Group()
  group.add(mesh)

  // lights
  const lightObjs = []
  for (const l of lvl.lights.slice(0, 9)) {
    const light = new THREE.PointLight(look.light, 45, 30, 1.5)
    light.position.set(l.x * CELL + CELL / 2, H - 1, l.y * CELL + CELL / 2)
    group.add(light)
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: look.light }))
    flame.position.copy(light.position)
    group.add(flame)
    lightObjs.push(light)
  }

  for (const p of lvl.props) group.add(buildProp(p, look))
  return { group, height: H, look, lights: lightObjs }
}

const pm = new Map()
function propMat(color, basic = false) {
  const key = color + (basic ? "b" : "")
  if (!pm.has(key)) pm.set(key, basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color }))
  return pm.get(key)
}

function buildProp(p, look) {
  const g = new THREE.Group()
  const m = (geo, color, basic) => {
    const mesh = new THREE.Mesh(geo, propMat(color, basic))
    mesh.castShadow = true
    g.add(mesh)
    return mesh
  }
  switch (p.type) {
    case "urn": {
      const u = m(new THREE.SphereGeometry(0.45, 10, 8), 0x8a6a4a)
      u.scale.y = 1.3
      u.position.y = 0.55
      m(new THREE.CylinderGeometry(0.2, 0.25, 0.3, 8), 0x7a5a3a).position.y = 1.15
      break
    }
    case "crate":
      m(new THREE.BoxGeometry(1.1, 1.1, 1.1), 0x6a4a2a).position.y = 0.55
      break
    case "barrel":
      m(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 10), 0x5a3a20).position.y = 0.6
      break
    case "sack":
      m(new THREE.SphereGeometry(0.5, 8, 6), 0x9a8a60).scale.set(1, 0.7, 1)
      g.children[0].position.y = 0.35
      break
    case "bones":
      for (let i = 0; i < 4; i++) {
        const b = m(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 4), 0xd8d0b8)
        b.rotation.z = Math.PI / 2
        b.rotation.y = i
        b.position.set((i - 1.5) * 0.15, 0.05, (i % 2) * 0.2)
      }
      m(new THREE.SphereGeometry(0.15, 6, 5), 0xd8d0b8).position.set(0.3, 0.14, 0.1)
      break
    case "candles":
      for (let i = 0; i < 3; i++) {
        m(new THREE.CylinderGeometry(0.05, 0.05, 0.4 + i * 0.1, 6), 0xe8e0c8).position.set(i * 0.15, 0.2, (i % 2) * 0.12)
        m(new THREE.SphereGeometry(0.04, 5, 4), 0xffc060, true).position.set(i * 0.15, 0.45 + i * 0.1, (i % 2) * 0.12)
      }
      break
    case "coffin":
      m(new THREE.BoxGeometry(0.9, 0.6, 2.1), 0x4a3a2a).position.y = 0.3
      break
    case "pipe":
      m(new THREE.CylinderGeometry(0.3, 0.3, look.height, 8), 0x8a6a2e).position.y = look.height / 2
      break
    case "gear": {
      const t = m(new THREE.TorusGeometry(0.6, 0.15, 6, 10), 0xa08040)
      t.position.y = 0.2
      t.rotation.x = Math.PI / 2
      break
    }
    case "lamp":
      m(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), 0x6a5020).position.y = 0.8
      m(new THREE.SphereGeometry(0.2, 8, 6), 0xffd070, true).position.y = 1.7
      break
    case "stalagmite":
      m(new THREE.ConeGeometry(0.5, 2.2, 6), 0x5a5046).position.y = 1.1
      break
    case "statue":
      m(new THREE.BoxGeometry(0.9, 0.5, 0.9), 0x3a2a26).position.y = 0.25
      m(new THREE.CylinderGeometry(0.3, 0.4, 2.4, 6), 0x4a3430).position.y = 1.7
      m(new THREE.SphereGeometry(0.35, 8, 6), 0x4a3430).position.y = 3.1
      break
    case "brazier":
      m(new THREE.CylinderGeometry(0.5, 0.3, 1, 8), 0x3a2a20).position.y = 0.5
      m(new THREE.ConeGeometry(0.35, 0.7, 6), 0xff7020, true).position.y = 1.3
      break
    case "altar":
      m(new THREE.BoxGeometry(2, 1, 1), 0x3a2622).position.y = 0.5
      break
    case "fleshpillar":
      m(new THREE.CylinderGeometry(0.5, 0.8, look.height, 8), 0x7a3028).position.y = look.height / 2
      break
    default:
      m(new THREE.BoxGeometry(0.6, 0.6, 0.6), 0x6a5a4a).position.y = 0.3
  }
  g.position.set(p.x * CELL + CELL / 2 + p.ox, 0, p.y * CELL + CELL / 2 + p.oz)
  g.rotation.y = p.rot
  return g
}

export function buildChestMesh(open = false) {
  const g = new THREE.Group()
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.7), propMat(0x5a3a1e))
  base.position.y = 0.3
  base.castShadow = true
  g.add(base)
  const lidPivot = new THREE.Group()
  lidPivot.position.set(0, 0.6, -0.35)
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.22, 0.74), propMat(0x6a4422))
  lid.position.set(0, 0.11, 0.35)
  lidPivot.add(lid)
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.08, 0.76), propMat(0xa08040))
  band.position.set(0, 0.2, 0.35)
  lidPivot.add(band)
  g.add(lidPivot)
  if (open) lidPivot.rotation.x = -1.2
  g.userData.lid = lidPivot
  return g
}

export function buildStairs(down, look) {
  const g = new THREE.Group()
  const frame = new THREE.MeshLambertMaterial({ color: srgbColor(look.wall[0], look.wall[1], look.wall[2]) })
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.2, 0.5), frame)
    post.position.set(sx * 1.2, 1.6, 0)
    g.add(post)
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 0.6), frame)
  top.position.y = 3.2
  g.add(top)
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 3), new THREE.MeshBasicMaterial({ color: down ? 0x050302 : 0x8a7a5a, side: THREE.DoubleSide }))
  portal.position.y = 1.5
  g.add(portal)
  if (!down) {
    const l = new THREE.PointLight(0xfff0c0, 6, 10, 1.5)
    l.position.set(0, 2, 0.8)
    g.add(l)
  }
  return g
}
