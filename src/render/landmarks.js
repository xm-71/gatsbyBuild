import * as THREE from "three"
import { texturedMaterial } from "./texgen.js"
import { Builder, lathe, rockGeometry, taperTube } from "./geom.js"
import { seg } from "../core/quality.js"
import { GLOW } from "./buildings.js"

// Roadside and coastal structures: signposts, piers and boats, and the
// landmarks scattered over the island.
const TM = (name, color = 0xffffff, extra = {}) => texturedMaterial(name, { color, ...extra })
const V3 = (x, y, z) => new THREE.Vector3(x, y, z)

// Adds parts in a local frame into a shared Builder (same idea as buildings.js).
export class Placer {
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

// A painted board: text burned into planks, readable from both sides.
function boardTexture(text, width, height, shift) {
  const canvas = document.createElement("canvas")
  canvas.width = 512
  canvas.height = Math.round((512 * height) / width)
  const ctx = canvas.getContext("2d")
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height)
  g.addColorStop(0, "#8a6a44")
  g.addColorStop(1, "#6a4e30")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = "rgba(40,24,10,0.5)"
  for (let y = 6; y < canvas.height; y += 11) {
    ctx.beginPath()
    ctx.moveTo(0, y + Math.sin(y) * 2)
    ctx.lineTo(canvas.width, y)
    ctx.stroke()
  }
  ctx.fillStyle = "#1e140a"
  ctx.font = `bold ${Math.round(canvas.height * 0.52)}px Georgia, serif`
  ctx.textBaseline = "middle"
  ctx.textAlign = "center"
  ctx.fillText(text, canvas.width / 2 + shift, canvas.height / 2 + 2)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

export function textBoard(text, width = 1.6, height = 0.34, arrow = true) {
  // arrow-shaped board pointing along +x
  const s = new THREE.Shape()
  const w = width / 2
  const h = height / 2
  s.moveTo(-w, -h)
  s.lineTo(w - (arrow ? h : 0), -h)
  s.lineTo(w, 0)
  s.lineTo(w - (arrow ? h : 0), h)
  s.lineTo(-w, h)
  s.closePath()
  const front = new THREE.ShapeGeometry(s)
  const pos = front.attributes.position
  const uv = front.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w) / width, (pos.getY(i) + h) / height)
  // the back face: reversed winding, mirrored UVs, so the text reads from behind
  const back = front.clone()
  const idx = back.index.array
  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]
  const buv = back.attributes.uv
  for (let i = 0; i < buv.count; i++) buv.setX(i, 1 - buv.getX(i))
  back.computeVertexNormals()
  for (let i = 0; i < back.attributes.normal.count; i++) back.attributes.normal.setXYZ(i, 0, 0, -1)
  const shift = arrow ? 20 : 0
  const g = new THREE.Group()
  g.add(new THREE.Mesh(front, new THREE.MeshLambertMaterial({ map: boardTexture(text, width, height, -shift) })))
  g.add(new THREE.Mesh(back, new THREE.MeshLambertMaterial({ map: boardTexture(text, width, height, shift) })))
  return g
}

// Crossroads signpost with one board per destination.
export function buildSignpost(post, towns, heightAt, colliders) {
  const g = new THREE.Group()
  const y = heightAt(post.x, post.z)
  const b = new Builder()
  const P = new Placer(b, post.x, y, post.z, 0)
  P.cyl(0.08, 0.1, 3, TM("wood", 0xb09070), 0, 1.5, 0, { segs: 6 })
  P.add(new THREE.ConeGeometry(0.12, 0.25, 6), TM("wood", 0x8a6a4a), { pos: [0, 3.1, 0] })
  g.add(b.build())
  post.signs.forEach((sg, i) => {
    const t = towns.find(t => t.id === sg.to)
    if (!t) return
    const label = sg.dist ? `${t.name}  ${Math.max(1, Math.round(sg.dist / 10) * 10)}m` : t.name
    const board = textBoard(label, 1.8, 0.34)
    // boards point away from the post, +x along the heading
    const holder = new THREE.Group()
    holder.position.set(post.x, y + 2.6 - i * 0.45, post.z)
    holder.rotation.y = sg.angle - Math.PI / 2
    board.position.x = 0.95
    holder.add(board)
    g.add(holder)
  })
  colliders.addCircle(post.x, post.z, 0.25)
  return g
}

// A timber pier running out to sea, with a moored ship.
export function buildDock(town, heightAt, colliders) {
  const d = town.dock
  const g = new THREE.Group()
  const b = new Builder()
  const rot = Math.atan2(Math.cos(d.angle), Math.sin(d.angle)) // local +z points out to sea
  const P = new Placer(b, d.x, 0, d.z, rot)
  const wood = TM("planks")
  const deckY = 1.1
  const L = d.length
  P.box(2.6, 0.2, L, wood, 0, deckY, L / 2 - 1)
  for (let z = 0; z < L; z += 3) for (const sx of [-1.2, 1.2]) P.cyl(0.14, 0.16, 5, TM("wood", 0x7a6048), sx, deckY - 2.4, z, { segs: 6 })
  for (const sx of [-1.25, 1.25]) P.box(0.1, 0.1, L, TM("wood", 0x8a7058), sx, deckY + 0.8, L / 2 - 1)
  // ship moored alongside at the end of the pier
  const S = new Placer(b, d.x + Math.cos(d.angle) * (L - 3) + Math.sin(d.angle) * 4.2, 0, d.z + Math.sin(d.angle) * (L - 3) - Math.cos(d.angle) * 4.2, rot)
  const hull = new THREE.SphereGeometry(1, seg(14), 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
  S.add(hull, TM("planks", 0x8a6a4a), { pos: [0, 0.9, 0], scale: [2.2, 1.6, 7], uv: 1 })
  S.box(4.2, 0.15, 12, TM("planks", 0xb09070), 0, 0.95, 0)
  S.box(3.2, 1.2, 3, TM("planks", 0x7a5a3a), 0, 1.6, -4)
  S.cyl(0.14, 0.18, 10, TM("wood", 0x8a6a4a), 0, 6, 0.8, { segs: 6 })
  S.box(5, 0.12, 0.12, TM("wood", 0x8a6a4a), 0, 8.8, 0.8)
  S.add(new THREE.PlaneGeometry(4.6, 4.8, 1, 3), TM("fabricTrim", 0xd8ccb0, { side: THREE.DoubleSide }), { pos: [0, 6.3, 0.9], uv: "keep" })
  S.add(lathe([[0.01, 0], [0.3, 0.2], [0.02, 0.6]], 6), TM("wood", 0x8a6a4a), { pos: [0, 1, 6.6], rot: [Math.PI / 2 - 0.4, 0, 0] })
  lanternAt(P, 1.2, deckY + 1.6, L - 1.4)
  g.add(b.build())
  colliders.addCircle(d.x + Math.cos(d.angle) * (L - 3) + Math.sin(d.angle) * 4.2, d.z + Math.sin(d.angle) * (L - 3) - Math.cos(d.angle) * 4.2, 2.5)
  // a walkable deck: the pier stands a little above the water
  d.deckY = deckY
  return g
}

function lanternAt(P, x, y, z) {
  P.cyl(0.04, 0.04, 0.5, TM("wood", 0xb09070), x, y + 0.45, z, { segs: 5 })
  P.add(lathe([[0.01, -0.28], [0.2, -0.22], [0.26, 0], [0.2, 0.22], [0.01, 0.28]], seg(8)), GLOW, { pos: [x, y, z] })
}

export { TM, V3, rockGeometry, taperTube, lathe }

// ---------------------------------------------------------------------------
// Landmarks
// ---------------------------------------------------------------------------

export const GHOST_GLOW = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x60ffb0).multiplyScalar(1.6), transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
const CRYSTAL = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9ab8ff).multiplyScalar(2.2) })

// Chests sit at a landmark-relative spot; returns its world position.
function chestAt(P, g, l, x, z, rotY = 0) {
  P.box(1.1, 0.55, 0.7, TM("planks", 0x8a6a4a), x, 0.28, z, { rot: [0, rotY, 0] })
  P.box(1.15, 0.2, 0.75, TM("planks", 0x6a4a2a), x, 0.63, z, { rot: [0, rotY, 0] })
  P.box(1.16, 0.08, 0.1, TM("dwemerMetal", 0x6a6a6a, { metal: true }), x, 0.4, z, { rot: [0, rotY, 0] })
  const c = Math.cos(l.rot)
  const s = Math.sin(l.rot)
  return V3(l.x + x * c + z * s, l.y + 0.6, l.z - x * s + z * c)
}

// A broken ship heeled over on the sand, ribs showing, cargo spilled.
export function buildWreck(l, colliders) {
  const b = new Builder()
  const P = new Placer(b, l.x, l.y - 0.4, l.z, l.rot)
  const hull = new THREE.SphereGeometry(1, seg(14), 8, 0, Math.PI * 1.3, Math.PI / 2, Math.PI / 2)
  const hullMat = TM("planks", 0x8a7a60, { side: THREE.DoubleSide })
  P.add(hull, hullMat, { pos: [0, 2.3, 0], rot: [0, 0, 0.55], scale: [2.6, 1.9, 8], uv: 1 })
  P.box(3.6, 0.15, 11, TM("planks", 0x9a8a70), 0.6, 2.6, -0.5, { rot: [0.04, 0, 0.55] })
  for (let i = -3; i <= 3; i++) P.add(new THREE.TorusGeometry(2.3, 0.1, 4, seg(10), Math.PI * 0.8), TM("wood", 0xa89880), { pos: [0.3, 2.4, i * 1.6], rot: [0, Math.PI / 2, 0.55 + Math.PI * 0.6] })
  P.cyl(0.16, 0.2, 7, TM("wood", 0x6a5a48), 1.6, 3, -1, { rot: [0.2, 0, 1.1], segs: 6 })
  for (let i = 0; i < 4; i++) P.box(0.8, 0.8, 0.8, TM("planks", 0x8a7a60), -3 - i * 0.9, 0.5, -2 + i * 1.3, { rot: [0.2 * i, i, 0.1] })
  const chest = chestAt(P, null, l, -2.2, 1.8, 0.6)
  colliders.addBox(l.x, l.z, 4, 14, l.rot)
  return { group: b.build(), chest }
}

// A walled Imperial fort gone to ruin: towers at the corners, a gatehouse, a keep.
export function buildStronghold(l, colliders) {
  const b = new Builder()
  const P = new Placer(b, l.x, l.y, l.z, l.rot)
  const stone = TM("stoneBlocks", 0xd0c8b8)
  const dark = TM("stoneBlocks", 0x8a8078)
  const S = 13
  const wallH = 5
  for (const [x, z, w, d] of [[0, -S, 2 * S, 1.2], [0, S, 2 * S, 1.2], [-S, 0, 1.2, 2 * S], [S, 0, 1.2, 2 * S]]) {
    if (z === -S) {
      // gate gap in the south wall
      for (const sx of [-1, 1]) P.box(S - 2.2, wallH, 1.2, stone, sx * (S / 2 + 1.1), wallH / 2, z)
      P.box(4.4, 1.4, 1.6, stone, 0, wallH + 0.2, z)
    } else P.box(w, wallH, d, stone, x, wallH / 2, z)
  }
  // crenellations and broken sections
  for (let i = -S; i <= S; i += 2) for (const [x, z] of [[i, S], [-S, i], [S, i]]) if ((i * 7 + x) % 5 !== 0) P.box(0.8, 0.7, 1.3, stone, x, wallH + 0.35, z)
  for (const [x, z] of [[-S, -S], [S, -S], [-S, S], [S, S]]) {
    P.cyl(2.2, 2.4, wallH + 3, dark, x, (wallH + 3) / 2, z, { segs: seg(10) })
    P.add(new THREE.ConeGeometry(2.8, 2.6, seg(10)), TM("shingles"), { pos: [x, wallH + 4.3, z] })
  }
  // the keep, its roof fallen in
  P.box(9, 7, 7, stone, 0, 3.5, 5)
  P.box(9.4, 0.5, 7.4, dark, 0, 7.2, 5)
  P.box(2, 3, 0.3, TM("mud", 0x111111), 0, 1.5, 1.4)
  P.cyl(0.08, 0.1, 6, TM("wood", 0x8a6a4a), -5.5, 3, -9, { segs: 5 })
  P.add(new THREE.PlaneGeometry(1.6, 1, 1, 1), TM("fabricTrim", 0xa83a2a, { side: THREE.DoubleSide }), { pos: [-4.7, 5.3, -9], uv: "keep" })
  const chest = chestAt(P, null, l, 2.5, 6.8)
  // colliders: walls as boxes (with the gate gap), towers and keep
  const c = Math.cos(l.rot)
  const s = Math.sin(l.rot)
  const at = (x, z) => [l.x + x * c + z * s, l.z - x * s + z * c]
  const box = (x, z, w, d) => {
    const [wx, wz] = at(x, z)
    colliders.addBox(wx, wz, w, d, l.rot)
  }
  box(0, S, 2 * S, 1.4)
  box(-S, 0, 1.4, 2 * S)
  box(S, 0, 1.4, 2 * S)
  for (const sx of [-1, 1]) box(sx * (S / 2 + 1.1), -S, S - 2.2, 1.4)
  for (const [x, z] of [[-S, -S], [S, -S], [-S, S], [S, S]]) {
    const [wx, wz] = at(x, z)
    colliders.addCircle(wx, wz, 2.5)
  }
  box(0, 7, 9.2, 3.6) // back of the keep
  for (const sx of [-1, 1]) box(sx * 3.3, 3, 2.6, 4)
  return { group: b.build(), chest, inside: at(0, 0) }
}

// A Propylon chamber: a ring of carved pillars around a glowing index stone.
export function buildPropylon(l, colliders) {
  const b = new Builder()
  const P = new Placer(b, l.x, l.y, l.z, l.rot)
  const stone = TM("sandstone", 0xd8c8a8)
  P.cyl(7, 7.4, 0.8, stone, 0, 0.1, 0, { segs: seg(20) })
  P.cyl(5, 5.2, 0.3, TM("floorTiles", 0xc0b098), 0, 0.6, 0, { segs: seg(20) })
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const x = Math.cos(a) * 6
    const z = Math.sin(a) * 6
    P.box(0.9, 5, 0.9, stone, x, 3, z, { rot: [0, -a, 0] })
    P.box(1.3, 0.5, 1.3, stone, x, 5.6, z, { rot: [0, -a, 0] })
    P.box(1.3, 0.5, 1.3, stone, x, 0.8, z, { rot: [0, -a, 0] })
  }
  P.cyl(0.7, 0.9, 1.4, stone, 0, 1.3, 0, { segs: 8 })
  P.add(new THREE.OctahedronGeometry(0.45, 0), CRYSTAL, { pos: [0, 2.6, 0], scale: [1, 1.6, 1] })
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    colliders.addCircle(l.x + Math.cos(a - l.rot) * 6, l.z + Math.sin(a - l.rot) * 6, 0.7)
  }
  colliders.addCircle(l.x, l.z, 0.9)
  const g = b.build()
  const light = new THREE.PointLight(0x9ab8ff, 14, 14, 1.6)
  light.position.set(l.x, l.y + 2.8, l.z)
  g.add(light)
  return { group: g, stone: V3(l.x, l.y + 2.2, l.z) }
}

// The Ghostfence: pylons circling Red Mountain joined by a shimmering ward,
// broken only by the Ghostgate fortress.
export function buildGhostfence(l, heightAt, colliders) {
  const g = new THREE.Group()
  const b = new Builder()
  const stone = TM("daedricStone", 0x9a8a80)
  const circ = 2 * Math.PI * l.r
  const count = Math.round(circ / 14)
  const gap = 0.07
  const angleDiff = a => Math.abs(Math.atan2(Math.sin(a - l.gateAngle), Math.cos(a - l.gateAngle)))
  const wallPts = []
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    if (angleDiff(a) < gap) continue
    const x = l.cx + Math.cos(a) * l.r
    const z = l.cz + Math.sin(a) * l.r
    const y = heightAt(x, z)
    const P = new Placer(b, x, y, z, -a)
    P.box(1.2, 9, 1.2, stone, 0, 4, 0)
    P.add(new THREE.ConeGeometry(0.9, 1.6, 4), stone, { pos: [0, 9.3, 0] })
    P.add(new THREE.SphereGeometry(0.35, 8, 6), CRYSTAL, { pos: [0, 7.6, 0.62] })
  }
  // the ward: a vertical ribbon following the ground, one quad per 3 m
  const segs = Math.round(circ / 3)
  const pos = []
  const idx = []
  let run = -1
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2
    if (angleDiff(a) < gap) {
      run = -1
      continue
    }
    const x = l.cx + Math.cos(a) * l.r
    const z = l.cz + Math.sin(a) * l.r
    const y = heightAt(x, z)
    const v = pos.length / 3
    pos.push(x, y + 0.4, z, x, y + 8, z)
    if (run >= 0) idx.push(run, v, run + 1, run + 1, v, v + 1)
    run = v
    wallPts.push([x, z])
  }
  const wg = new THREE.BufferGeometry()
  wg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  wg.setIndex(idx)
  const ward = new THREE.Mesh(wg, GHOST_GLOW)
  ward.renderOrder = 3
  g.add(ward)
  for (let i = 0; i < wallPts.length; i += 1) colliders.addCircle(wallPts[i][0], wallPts[i][1], 1.8)
  // Ghostgate: twin towers and a gatehouse straddling the gap
  const gx = l.x
  const gz = l.z
  const gy = l.y
  const rot = -l.gateAngle + Math.PI / 2
  const G = new Placer(b, gx, gy, gz, rot)
  const wall = TM("stoneBlocks", 0xb8a890)
  for (const sx of [-1, 1]) {
    G.cyl(3.2, 3.6, 16, wall, sx * 12, 8, 0, { segs: seg(12) })
    G.add(new THREE.ConeGeometry(3.8, 5, seg(12)), TM("shingles"), { pos: [sx * 12, 18.5, 0] })
    G.box(8, 8, 4, wall, sx * 6.5, 4, 0)
  }
  G.box(5, 3, 4, wall, 0, 8.5, 0)
  G.box(26, 1, 5, TM("stoneBlocks", 0x8a8078), 0, 10.2, 0)
  for (const sx of [-1, 1]) G.add(new THREE.PlaneGeometry(1.8, 3, 1, 1), TM("fabricTrim", 0xc8a040, { side: THREE.DoubleSide }), { pos: [sx * 3, 7, -2.05], uv: "keep" })
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  for (const sx of [-1, 1]) {
    colliders.addCircle(gx + sx * 12 * c, gz - sx * 12 * s, 3.6)
    colliders.addBox(gx + sx * 6.5 * c, gz - sx * 6.5 * s, 8, 4, rot)
  }
  g.add(b.build())
  g.userData.ward = ward
  return g
}

// Velothi tower: a stepped sandstone watchtower over a tomb entrance.
export function buildVelothiTower(P) {
  const stone = TM("sandstone", 0xd8c8a8)
  const dark = TM("sandstone", 0xa89878)
  for (let i = 0; i < 4; i++) {
    const w = 7 - i * 1.3
    P.box(w, 3.2, w, i % 2 ? dark : stone, 0, 1.6 + i * 3.2, 0)
    P.box(w + 0.5, 0.35, w + 0.5, dark, 0, 3.2 + i * 3.2, 0)
  }
  P.add(new THREE.ConeGeometry(1.8, 2.4, 4), stone, { pos: [0, 14.2, 0], rot: [0, Math.PI / 4, 0] })
  for (const sx of [-1, 1]) P.box(0.6, 4.5, 0.6, dark, sx * 1.4, 2.25, -3.8)
  P.box(3.4, 0.6, 0.8, dark, 0, 4.6, -3.8)
  P.box(1.8, 2.8, 0.2, TM("planks"), 0, 1.4, -3.55)
  for (let i = 0; i < 3; i++) P.box(3 - i * 0.3, 0.2, 0.6, stone, 0, 0.1 + i * 0.2 - 0.4, -4.6 + i * 0.4)
}

// Ruined Dwemer towers, domes and pipes around a ruin's entrance.
export function buildDwemerRuins(P, seed) {
  const metal = TM("dwemerMetal", 0xffffff, { metal: true })
  const solid = []
  const r = n => ((Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1
  for (let i = 0; i < 5; i++) {
    const a = r(i) * Math.PI * 2
    const d = 11 + r(i + 10) * 9
    const x = Math.cos(a) * d
    const z = Math.sin(a) * d + 4
    const h = 5 + r(i + 20) * 9
    P.cyl(1.2, 1.5, h, metal, x, h / 2 - 0.5, z, { segs: seg(10) })
    solid.push([x, z, 1.6])
    if (r(i + 30) > 0.5) P.add(new THREE.SphereGeometry(1.7, seg(10), 6, 0, Math.PI * 2, 0, Math.PI / 2), metal, { pos: [x, h - 0.5, z] })
    else P.cyl(1.6, 1.3, 0.8, metal, x, h - 0.4, z, { segs: seg(10), rot: [0.3, 0, 0.2] })
    for (let k = 0; k < 2; k++) P.add(new THREE.TorusGeometry(1.35, 0.12, 4, seg(12)), metal, { pos: [x, 1 + k * 2.5, z], rot: [Math.PI / 2, 0, 0] })
  }
  // a broken bridge of pipes
  for (let k = 0; k < 3; k++) P.cyl(0.35, 0.35, 12, metal, -6 + k * 0.9, 3 + k * 0.4, 9, { rot: [0, 0, Math.PI / 2 + 0.15 * k], segs: 8 })
  P.add(new THREE.SphereGeometry(4, seg(14), 8, 0, Math.PI * 2, 0, Math.PI / 2), metal, { pos: [9, -1.5, 12], scale: [1, 0.6, 1] })
  solid.push([9, 12, 3.6])
  return solid
}

// Clam beds and kelp on the sea floor. Returns the group and a function to
// show a clam as opened (its upper shell swings away).
export function buildSeabed(clams) {
  const g = new THREE.Group()
  const shellMat = TM("chitinShell", 0x9a8a7a)
  const half = new THREE.SphereGeometry(0.35, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)
  half.scale(1, 0.35, 0.8)
  const bottom = new THREE.InstancedMesh(half, shellMat, clams.length)
  const top = new THREE.InstancedMesh(half, shellMat, clams.length)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const flip = new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), Math.PI)
  const up = V3(0, 1, 0)
  clams.forEach((c, i) => {
    q.setFromAxisAngle(up, c.rot)
    m.compose(V3(c.x, c.y + 0.02, c.z), q.clone().multiply(flip), V3(1, 1, 1))
    bottom.setMatrixAt(i, m)
    m.compose(V3(c.x, c.y + 0.03, c.z), q, V3(1, 1, 1))
    top.setMatrixAt(i, m)
  })
  g.add(bottom, top)
  // kelp: tall swaying ribbons around the clam beds
  const kelpGeo = new THREE.PlaneGeometry(0.35, 3, 1, 6)
  kelpGeo.translate(0, 1.5, 0)
  const kelpMat = new THREE.MeshLambertMaterial({ color: 0x2a5a30, side: THREE.DoubleSide })
  kelpMat.onBeforeCompile = s => {
    s.uniforms.uT = { value: 0 }
    kelpMat.userData.shader = s
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nuniform float uT;").replace("#include <begin_vertex>", "#include <begin_vertex>\nfloat k = position.y / 3.0;\ntransformed.x += sin(uT * 1.3 + instanceMatrix[3].x) * k * k * 0.5;\ntransformed.z += cos(uT * 0.9 + instanceMatrix[3].z) * k * k * 0.3;")
  }
  const per = 4
  const kelp = new THREE.InstancedMesh(kelpGeo, kelpMat, clams.length * per)
  clams.forEach((c, i) => {
    for (let k = 0; k < per; k++) {
      const a = c.rot + k * 1.7
      const r = 0.8 + ((c.seed >> k) % 10) * 0.25
      q.setFromAxisAngle(up, a * 2)
      const s = 0.7 + ((c.seed >> (k + 3)) % 10) * 0.08
      m.compose(V3(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r), q, V3(1, s, 1))
      kelp.setMatrixAt(i * per + k, m)
    }
  })
  g.add(kelp)
  g.userData.update = t => {
    if (kelpMat.userData.shader) kelpMat.userData.shader.uniforms.uT.value = t
  }
  g.userData.open = i => {
    const c = clams[i]
    q.setFromAxisAngle(up, c.rot)
    const tilt = new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), -1.1)
    m.compose(V3(c.x, c.y + 0.1, c.z - 0.2), q.clone().multiply(tilt), V3(1, 1, 1))
    top.setMatrixAt(i, m)
    top.instanceMatrix.needsUpdate = true
  }
  return g
}
