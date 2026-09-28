import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import { createNoise2D } from "../core/noise.js"

// Strip a geometry down to non-indexed position/normal/uv so anything can be merged.
export function normalize(geo) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone()
  for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv", "color"].includes(name)) g.deleteAttribute(name)
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
  if (!g.attributes.normal) g.computeVertexNormals()
  return g
}

// Box-projected UVs from world positions: consistent texel density on every surface.
export function worldUV(g, scale = 4) {
  const pos = g.attributes.position
  const nor = g.attributes.normal
  const uv = g.attributes.uv
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i)
    b.fromBufferAttribute(pos, i + 1)
    c.fromBufferAttribute(pos, i + 2)
    n.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b))
    if (n.lengthSq() < 1e-12) n.fromBufferAttribute(nor, i)
    const ax = Math.abs(n.x)
    const ay = Math.abs(n.y)
    const az = Math.abs(n.z)
    for (let k = 0; k < 3; k++) {
      const p = [a, b, c][k]
      let u
      let v
      if (ay >= ax && ay >= az) {
        u = p.x
        v = p.z
      } else if (ax >= az) {
        u = p.z
        v = p.y
      } else {
        u = p.x
        v = p.y
      }
      uv.setXY(i + k, u / scale, v / scale)
    }
  }
  uv.needsUpdate = true
  return g
}

// Collects transformed parts per material then merges them into a few meshes.
export class Builder {
  constructor() {
    this.parts = new Map()
    this.tmp = new THREE.Object3D()
  }

  // add(geometry, material, {pos, rot, scale, uv: number (world uv scale) | "keep"})
  add(geo, material, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], uv = 3, matrix = null, color = null } = {}) {
    const g = normalize(geo)
    if (matrix) g.applyMatrix4(matrix)
    else {
      const o = this.tmp
      o.position.set(pos[0], pos[1], pos[2])
      o.rotation.set(rot[0], rot[1], rot[2])
      o.scale.set(scale[0], scale[1], scale[2])
      o.updateMatrix()
      g.applyMatrix4(o.matrix)
    }
    if (uv !== "keep") worldUV(g, uv)
    if (color !== null) {
      const col = new THREE.Color(color)
      const arr = new Float32Array(g.attributes.position.count * 3)
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] = col.r
        arr[i + 1] = col.g
        arr[i + 2] = col.b
      }
      g.setAttribute("color", new THREE.BufferAttribute(arr, 3))
    }
    if (!this.parts.has(material)) this.parts.set(material, [])
    this.parts.get(material).push(g)
    return g
  }

  // Bake an existing Object3D subtree (meshes only) into the builder.
  addObject(obj, parentMatrix = new THREE.Matrix4(), uv = 3) {
    obj.updateMatrix()
    const m = parentMatrix.clone().multiply(obj.matrix)
    if (obj.isMesh) this.add(obj.geometry, obj.material, { matrix: m, uv: obj.userData.keepUV ? "keep" : uv })
    for (const child of obj.children) this.addObject(child, m, uv)
  }

  build({ castShadow = true, receiveShadow = true } = {}) {
    const group = new THREE.Group()
    for (const [material, geos] of this.parts) {
      const hasColor = geos.some(g => g.attributes.color)
      if (hasColor)
        for (const g of geos)
          if (!g.attributes.color) g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3))
      const merged = mergeGeometries(geos, false)
      if (!merged) continue
      merged.computeBoundingSphere()
      const mesh = new THREE.Mesh(merged, material)
      mesh.castShadow = castShadow
      mesh.receiveShadow = receiveShadow
      group.add(mesh)
    }
    return group
  }
}

export function lathe(profile, segments = 16) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments)
}

// Irregular rock: an icosphere pushed around by noise.
const rockNoise = createNoise2D("rocks")
export function rockGeometry(seed, detail = 2, radius = 1, roughness = 0.35) {
  const g = new THREE.IcosahedronGeometry(radius, detail)
  const pos = g.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const n = v.clone().normalize()
    const d = rockNoise.fbm(n.x * 1.7 + seed * 3.1, n.z * 1.7 + n.y * 1.3 - seed, 4) * roughness + rockNoise.noise(n.x * 5 + seed, n.y * 5) * roughness * 0.3
    v.addScaledVector(n, d * radius)
    if (v.y < -radius * 0.2) v.y = -radius * 0.2 + (v.y + radius * 0.2) * 0.2 // flatten the base
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

// Cylinder oriented between two points (for limbs, branches, poles).
export function between(geo, a, b) {
  const dir = new THREE.Vector3().subVectors(b, a)
  const len = dir.length()
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  m.compose(a.clone().addScaledVector(dir, 0.5), q, new THREE.Vector3(1, len, 1))
  return m
}

// Tube along a list of points with tapering radius.
export function taperTube(points, r0, r1, radial = 6, tubular = 12) {
  const curve = new THREE.CatmullRomCurve3(points)
  const g = new THREE.TubeGeometry(curve, tubular, 1, radial, false)
  const pos = g.attributes.position
  // TubeGeometry lays vertices ring by ring; scale each ring's offset from the curve
  const ringSize = radial + 1
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular
    const center = curve.getPointAt(t)
    const r = r0 + (r1 - r0) * t
    for (let j = 0; j < ringSize; j++) {
      const k = i * ringSize + j
      const x = pos.getX(k) - center.x
      const y = pos.getY(k) - center.y
      const z = pos.getZ(k) - center.z
      pos.setXYZ(k, center.x + x * r, center.y + y * r, center.z + z * r)
    }
  }
  g.computeVertexNormals()
  return g
}

export { mergeGeometries }
