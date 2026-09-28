import * as THREE from "three"
import { REGIONS } from "../logic/worldgen.js"

// Each flora type is built from a couple of instanced parts.
const lambert = color => new THREE.MeshLambertMaterial({ color })

function parts() {
  const cyl = (rt, rb, h, seg = 6) => {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg)
    g.translate(0, h / 2, 0)
    return g
  }
  const parasolCap = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)
  parasolCap.scale(4.2, 1.2, 4.2)
  parasolCap.translate(0, 9, 0)
  const gashFoliage = new THREE.ConeGeometry(2.2, 6, 7)
  gashFoliage.translate(0, 7, 0)
  const swampCanopy = new THREE.IcosahedronGeometry(2.6, 0)
  swampCanopy.scale(1.3, 0.8, 1.3)
  swampCanopy.translate(0.8, 6.2, 0)
  const swampTrunk = cyl(0.25, 0.5, 6.5, 5)
  swampTrunk.rotateZ(-0.15)
  const deadBranch = cyl(0.08, 0.16, 2.4, 4)
  deadBranch.rotateZ(0.9)
  deadBranch.translate(0, 3.2, 0)
  const deadBranch2 = cyl(0.07, 0.14, 2, 4)
  deadBranch2.rotateZ(-0.8)
  deadBranch2.rotateY(1.8)
  deadBranch2.translate(0, 4.1, 0)
  const shrub = new THREE.IcosahedronGeometry(0.8, 0)
  shrub.scale(1.2, 0.8, 1.2)
  shrub.translate(0, 0.5, 0)
  const grass = new THREE.ConeGeometry(0.25, 0.9, 4)
  grass.translate(0, 0.45, 0)
  const grass2 = grass.clone()
  grass2.translate(0.35, 0, 0.2)
  const grass3 = grass.clone()
  grass3.translate(-0.3, 0, -0.25)
  const trama = new THREE.ConeGeometry(0.5, 1.6, 5)
  trama.translate(0, 0.8, 0)
  const rock = new THREE.DodecahedronGeometry(0.9, 0)
  rock.scale(1.2, 0.7, 1)
  rock.translate(0, 0.25, 0)
  const boulder = new THREE.IcosahedronGeometry(2.4, 0)
  boulder.scale(1.2, 0.8, 1)
  boulder.translate(0, 0.9, 0)

  return {
    parasol: [
      { geo: cyl(0.35, 0.6, 9, 7), mat: lambert(0xb8a888) },
      { geo: parasolCap, mat: lambert(0xa8704a), tint: true },
    ],
    gashTree: [
      { geo: cyl(0.2, 0.35, 5, 5), mat: lambert(0x5a4630) },
      { geo: gashFoliage, mat: lambert(0x3e5a2c), tint: true },
    ],
    swampTree: [
      { geo: swampTrunk, mat: lambert(0x4a3a28) },
      { geo: swampCanopy, mat: lambert(0x4a5a2a), tint: true },
    ],
    deadTree: [
      { geo: cyl(0.15, 0.35, 5, 5), mat: lambert(0x5a524a) },
      { geo: deadBranch, mat: lambert(0x5a524a) },
      { geo: deadBranch2, mat: lambert(0x5a524a) },
    ],
    shrub: [{ geo: shrub, mat: lambert(0x55702e), tint: true }],
    grass: [{ geo: THREEmerge([grass, grass2, grass3]), mat: lambert(0xb0a860), tint: true }],
    trama: [{ geo: trama, mat: lambert(0x5a2a2a) }],
    rock: [{ geo: rock, mat: lambert(0x7a7266), tint: true }],
    boulder: [{ geo: boulder, mat: lambert(0x6a6258), tint: true }],
  }
}

// tiny local merge to avoid pulling in BufferGeometryUtils
function THREEmerge(geos) {
  const nonIndexed = geos.map(g => (g.index ? g.toNonIndexed() : g))
  let count = 0
  for (const g of nonIndexed) count += g.attributes.position.count
  const pos = new Float32Array(count * 3)
  const nor = new Float32Array(count * 3)
  let o = 0
  for (const g of nonIndexed) {
    pos.set(g.attributes.position.array, o * 3)
    nor.set(g.attributes.normal.array, o * 3)
    o += g.attributes.position.count
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3))
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3))
  return out
}
export { THREEmerge as mergeGeometries }

const TRUNK_RADIUS = { parasol: 0.7, gashTree: 0.45, swampTree: 0.6, deadTree: 0.4, boulder: 2.4 }

export function buildFlora(world, colliders) {
  const group = new THREE.Group()
  const defs = parts()
  const byType = {}
  for (const f of world.flora) (byType[f.type] ||= []).push(f)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const p = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const col = new THREE.Color()
  for (const [type, list] of Object.entries(byType)) {
    for (const part of defs[type]) {
      const inst = new THREE.InstancedMesh(part.geo, part.mat, list.length)
      inst.castShadow = type !== "grass" && type !== "shrub"
      list.forEach((f, i) => {
        q.setFromAxisAngle(up, f.rot)
        s.setScalar(f.scale)
        p.set(f.x, f.y - 0.1, f.z)
        m.compose(p, q, s)
        inst.setMatrixAt(i, m)
        if (part.tint) {
          const R = REGIONS[world.regionAt(f.x, f.z)]
          col.set(part.mat.color)
          const v = 0.85 + ((f.rot * 1000) % 1) * 0.3
          const regionTint = new THREE.Color().setRGB(R.high[0] / 255, R.high[1] / 255, R.high[2] / 255, THREE.SRGBColorSpace)
          col.lerp(regionTint, 0.25).multiplyScalar(v)
          inst.setColorAt(i, col)
        }
      })
      if (inst.instanceColor) {
        // setColorAt multiplies by the material colour; keep the material white
        inst.material = part.mat.clone()
        inst.material.color.set(0xffffff)
      }
      group.add(inst)
    }
    if (TRUNK_RADIUS[type]) for (const f of list) colliders.addCircle(f.x, f.z, TRUNK_RADIUS[type] * f.scale)
  }
  return group
}
