import * as THREE from "three"
import { makeLabel, detailTexture } from "./textures.js"

const matCache = new Map()
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts)
  if (!matCache.has(key)) {
    const m = opts.basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color, map: opts.tex ? detailTexture(opts.tex) : null, emissive: opts.emissive || 0x000000 })
    matCache.set(key, m)
  }
  return matCache.get(key)
}

function box(w, h, d, color, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts))
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function add(group, mesh, x, y, z) {
  mesh.position.set(x, y, z)
  group.add(mesh)
  return mesh
}

function door(group, w, h, d, color = 0x3a2616) {
  add(group, box(1.6, 2.6, 0.3, color), 0, 1.3, -d / 2 - 0.05)
}

function lanterns(group, d, lights) {
  for (const sx of [-1.4, 1.4]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat(0xffc870, { basic: true }))
    add(group, l, sx, 2.8, -d / 2 - 0.35)
    lights.push(l)
  }
}

const STYLE = {
  hlaalu(b) {
    const g = new THREE.Group()
    const wallH = b.h * 0.7
    add(g, box(b.w, wallH + 1, b.d, 0xd8c8a0, { tex: "ground" }), 0, wallH / 2 - 0.5, 0)
    const roof = box(b.w + 1.2, 0.4, b.d + 1.4, 0x6a4a2a)
    roof.rotation.x = 0.12
    add(g, roof, 0, wallH + 0.3, 0)
    for (const sx of [-1, 1]) add(g, box(0.4, wallH + 1, 0.4, 0x5a3a20), (sx * b.w) / 2, wallH / 2 - 0.5, -b.d / 2)
    add(g, box(b.w + 0.2, 0.4, 0.4, 0x5a3a20), 0, wallH - 0.4, -b.d / 2 - 0.05)
    door(g, b.w, b.h, b.d)
    return g
  },
  redoran(b) {
    const g = new THREE.Group()
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x9a6436, { tex: "ground" }))
    shell.scale.set(b.w / 2 + 0.5, b.h * 0.9, b.d / 2 + 0.5)
    shell.castShadow = true
    add(g, shell, 0, -0.3, 0)
    const ridge = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 20, Math.PI), mat(0x6a3a1a))
    ridge.scale.set(b.w / 2 + 0.6, b.h * 0.92, 1)
    ridge.rotation.y = Math.PI / 2
    add(g, ridge, 0, -0.3, 0)
    for (let i = 0; i < 3; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.6, 5), mat(0x6a3a1a))
      add(g, spike, 0, b.h * 0.9 - 0.2, (i - 1) * 1.6)
    }
    add(g, box(2.4, 3.2, 1.6, 0x8a5a30), 0, 1.3, -b.d / 2 - 0.2)
    add(g, box(1.4, 2.4, 0.3, 0x2a1a10), 0, 1.2, -b.d / 2 - 1.05)
    return g
  },
  telvanni(b) {
    const g = new THREE.Group()
    const tall = b.type === "manor" || b.type === "temple"
    const stalkH = tall ? 14 : 4
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(b.w * 0.22, b.w * 0.34, stalkH, 10), mat(0xb8a078, { tex: "ground" }))
    stalk.castShadow = true
    add(g, stalk, 0, stalkH / 2 - 0.3, 0)
    const pod = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat(0x8a5a7a))
    pod.scale.set(b.w / 2, tall ? 3 : b.h * 0.55, b.d / 2)
    pod.castShadow = true
    add(g, pod, 0, stalkH + (tall ? 1 : 0.8), 0)
    if (tall) {
      for (const [y, s] of [[stalkH * 0.5, 0.7], [stalkH * 0.75, 0.55]]) {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x7a4a6a))
        cap.scale.set(b.w * s, 1.2, b.d * s)
        add(g, cap, 1.2, y, 0.8)
      }
    }
    add(g, box(1.6, 2.6, 0.6, 0x4a2a3a), 0, 1.3, -b.w * 0.3)
    return g
  },
  imperial(b) {
    const g = new THREE.Group()
    if (b.type === "fort") {
      add(g, box(b.w, b.h, b.d, 0x8e8a80, { tex: "stone" }), 0, b.h / 2 - 0.5, 0)
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const t = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, b.h + 3, 8), mat(0x86827a, { tex: "stone" }))
          t.castShadow = true
          add(g, t, (sx * b.w) / 2, (b.h + 3) / 2 - 0.5, (sz * b.d) / 2)
        }
      for (let i = -2; i <= 2; i++) add(g, box(1, 1, 1, 0x86827a), i * (b.w / 5), b.h, -b.d / 2)
      const banner = box(1.4, 3, 0.1, 0xa02828)
      add(g, banner, 2.2, b.h - 2.2, -b.d / 2 - 0.1)
      door(g, b.w, b.h, b.d, 0x4a3020)
      return g
    }
    add(g, box(b.w, b.h * 0.65, b.d, 0x9a948a, { tex: "stone" }), 0, (b.h * 0.65) / 2 - 0.4, 0)
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(b.w, b.d) / 2 + 0.6, 2.6, 4), mat(0x4a3a30))
    roof.rotation.y = Math.PI / 4
    roof.castShadow = true
    add(g, roof, 0, b.h * 0.65 + 0.9, 0)
    door(g, b.w, b.h, b.d)
    return g
  },
  ashlander(b) {
    const g = new THREE.Group()
    const r = b.w / 2
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 2.2, 12), mat(0xb09070, { tex: "ground" }))
    wall.castShadow = true
    add(g, wall, 0, 0.9, 0)
    const roof = new THREE.Mesh(new THREE.ConeGeometry(r + 0.5, 2.6, 12), mat(0x8a6a4a, { tex: "ground" }))
    roof.castShadow = true
    add(g, roof, 0, 3.3, 0)
    add(g, box(1.2, 1.8, 0.3, 0x3a2616), 0, 0.9, -r - 0.05)
    return g
  },
}

function temple(b, style) {
  const g = new THREE.Group()
  const col = style === "imperial" ? 0xb8b0a0 : 0xc8b890
  add(g, box(b.w, b.h * 0.6, b.d, col, { tex: "stone" }), 0, (b.h * 0.6) / 2 - 0.4, 0)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(b.w * 0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xa88a50))
  dome.castShadow = true
  add(g, dome, 0, b.h * 0.6 - 0.4, 0)
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.5, 4, 6), mat(0xd8b040))
  add(g, spire, 0, b.h * 0.6 + b.w * 0.42 + 1.4, 0)
  add(g, box(3, 4, 1.2, col), 0, 1.6, -b.d / 2 - 0.4)
  add(g, box(1.8, 3, 0.3, 0x3a2616), 0, 1.4, -b.d / 2 - 1.05)
  return g
}

export function buildTown(town, colliders) {
  const group = new THREE.Group()
  const glows = []
  // cobbled plaza
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(town.radius * 0.55, 24), mat(town.style === "ashlander" ? 0x8a7a5a : 0x9a9080, { tex: "stone" }))
  plaza.rotation.x = -Math.PI / 2
  plaza.position.set(town.x, town.y + 0.06, town.z)
  plaza.receiveShadow = true
  group.add(plaza)

  for (const b of town.buildings) {
    let g
    if (b.type === "temple" && town.style !== "telvanni" && town.style !== "ashlander") g = temple(b, town.style)
    else if (b.type === "fort") g = STYLE.imperial(b)
    else g = (STYLE[town.style] || STYLE.hlaalu)(b)
    g.position.set(b.x, town.y, b.z)
    g.rotation.y = b.rot
    if (town.style !== "ashlander" && town.style !== "telvanni") lanterns(g, b.d, glows)
    group.add(g)
    if (b.label) {
      const sign = makeLabel(b.label, { size: 26, scale: 0.02 })
      // put the sign above the door on the plaza side
      const off = b.d / 2 + 1
      sign.position.set(b.x - Math.cos(b.angle) * off, town.y + (town.style === "telvanni" ? 4.2 : 4), b.z - Math.sin(b.angle) * off)
      group.add(sign)
    }
    if (town.style === "ashlander" || (town.style === "telvanni" && b.type !== "manor" && b.type !== "temple")) colliders.addCircle(b.x, b.z, b.w / 2 + 0.2)
    else if (town.style === "redoran") colliders.addBox(b.x, b.z, b.w + 0.8, b.d + 0.8, b.rot)
    else if (town.style === "telvanni") colliders.addCircle(b.x, b.z, b.w * 0.36)
    else colliders.addBox(b.x, b.z, b.w, b.d, b.rot)
  }

  // Town name marker
  const name = makeLabel(town.name, { size: 34, scale: 0.035, color: "#f0dca0" })
  name.position.set(town.x, town.y + 14, town.z)
  group.add(name)

  const strider = buildSiltStrider()
  strider.position.set(town.port.x, town.y, town.port.z)
  strider.rotation.y = -town.port.angle
  group.add(strider)
  colliders.addCircle(town.port.x, town.port.z, 1.2)

  const light = new THREE.PointLight(0xffb060, 0, 45, 1.4)
  light.position.set(town.x, town.y + 6, town.z)
  group.add(light)
  return { group, light, glows, strider }
}

export function buildSiltStrider() {
  const g = new THREE.Group()
  const body = new THREE.Group()
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat(0x8a7050, { tex: "ground" }))
  shell.scale.set(2.6, 2.2, 5)
  shell.castShadow = true
  body.add(shell)
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mat(0x6a5038))
  head.scale.set(1.2, 1, 1.6)
  head.position.set(0, -0.8, 5)
  body.add(head)
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 3), mat(0x7a5a30))
  cabin.position.set(0, 2, -0.5)
  body.add(cabin)
  body.position.y = 13
  g.add(body)
  const legMat = mat(0x5a4a38)
  const legs = []
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 9, 5), legMat)
    const knee = new THREE.Vector3(sx * 6, 15, sz * 4)
    const hip = new THREE.Vector3(sx * 1.8, 13, sz * 2)
    const foot = new THREE.Vector3(sx * 5, 0, sz * 6)
    placeLimb(upper, hip, knee)
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.25, 1, 5), legMat)
    placeLimb(lower, knee, foot)
    g.add(upper, lower)
    legs.push(upper, lower)
  }
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

export function buildEntrance(d, colliders) {
  const g = new THREE.Group()
  const rot = ((d.seed % 628) / 100) || 0
  if (d.type === "cave") {
    for (const sx of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 0), mat(0x6a6056, { tex: "ground" }))
      r.scale.set(1, 1.6, 1.2)
      r.castShadow = true
      add(g, r, sx * 2.4, 1.6, 0)
    }
    const lintel = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 0), mat(0x5e564c, { tex: "ground" }))
    lintel.scale.set(1.8, 0.8, 1.2)
    add(g, lintel, 0, 4.2, 0)
    add(g, box(2.6, 3.4, 0.2, 0x0a0806), 0, 1.7, -0.9)
  } else if (d.type === "tomb") {
    const mound = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x6a6048, { tex: "ground" }))
    mound.scale.set(1, 0.7, 1)
    add(g, mound, 0, -0.2, 1.5)
    add(g, box(3.2, 3.4, 1, 0xa89c80, { tex: "stone" }), 0, 1.5, -1.6)
    add(g, box(1.8, 2.6, 0.2, 0x3a2e24), 0, 1.3, -2.15)
    const cap = box(3.8, 0.5, 1.4, 0x8a8068)
    add(g, cap, 0, 3.3, -1.6)
  } else if (d.type === "dwemer") {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xa0823e, { tex: "metal" }))
    add(g, dome, 0, 0, 1.5)
    add(g, box(3.4, 3.8, 1.4, 0xb08a3e, { tex: "metal" }), 0, 1.7, -1.4)
    add(g, box(2, 2.8, 0.2, 0x3a2a14), 0, 1.4, -2.15)
    for (const sx of [-1, 1]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 8), mat(0x8a6a2e))
      add(g, pipe, sx * 2.2, 3, 0.5)
      const puff = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.4, 8), mat(0x6a4a1e))
      add(g, puff, sx * 2.2, 6, 0.5)
    }
  } else if (d.type === "daedric" || d.type === "citadel") {
    const big = d.type === "citadel" ? 1.8 : 1
    const stone = d.type === "citadel" ? 0x3a2622 : 0x5a3e34
    for (const sx of [-1, 1]) {
      const pillar = box(1.2 * big, 7 * big, 1.2 * big, stone, { tex: "stone" })
      add(g, pillar, sx * 2.6 * big, 3.5 * big, 0)
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.8 * big, 2.2 * big, 4), mat(0x8a2a1a))
      add(g, spike, sx * 2.6 * big, 8 * big, 0)
    }
    add(g, box(6.4 * big, 1 * big, 1.4 * big, stone, { tex: "stone" }), 0, 7 * big, 0)
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(4 * big, 6 * big), new THREE.MeshBasicMaterial({ color: d.type === "citadel" ? 0x8a1a08 : 0x2a0a0a, side: THREE.DoubleSide }))
    add(g, portal, 0, 3 * big, -0.1)
    if (d.type === "citadel") {
      const glow = new THREE.PointLight(0xff4010, 3, 30, 1.5)
      add(g, glow, 0, 4, -3)
    }
  }
  g.position.set(d.x, d.y, d.z)
  g.rotation.y = rot
  colliders.addCircle(d.x + Math.sin(rot) * 1.2, d.z + Math.cos(rot) * 1.2, d.type === "citadel" ? 3.5 : 2.2)
  // door position (in front of the entrance, local -z)
  const doorPos = new THREE.Vector3(d.x - Math.sin(rot) * 3, d.y + 1.5, d.z - Math.cos(rot) * 3)
  return { group: g, doorPos }
}
