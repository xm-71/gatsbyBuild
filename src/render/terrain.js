import * as THREE from "three"
import { REGIONS, SEA_LEVEL } from "../logic/worldgen.js"
import { createNoise2D } from "../core/noise.js"
import { detailTexture } from "./textures.js"

export function buildTerrain(world) {
  const N = world.res + 1
  const half = world.size / 2
  const cell = world.size / world.res
  const noise = createNoise2D(`tint:${world.seed}`)
  const positions = new Float32Array(N * N * 3)
  const colors = new Float32Array(N * N * 3)
  const uvs = new Float32Array(N * N * 2)
  const tmp = new THREE.Color()

  const raw = new Float32Array(N * N * 3)
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i
      const x = -half + i * cell
      const z = -half + j * cell
      const h = world.heights[k]
      positions[k * 3] = x
      positions[k * 3 + 1] = h
      positions[k * 3 + 2] = z
      uvs[k * 2] = i * 0.35
      uvs[k * 2 + 1] = j * 0.35

      const R = REGIONS[world.regionIds[world.regions[k]]]
      const n = noise.fbm(x * 0.03, z * 0.03, 3)
      const t = Math.max(0, Math.min(1, 0.5 + n * 0.9 + (h - 10) / 80))
      let r = R.low[0] + (R.high[0] - R.low[0]) * t
      let g = R.low[1] + (R.high[1] - R.low[1]) * t
      let b = R.low[2] + (R.high[2] - R.low[2]) * t
      const slope = world.slopeAt(x, z)
      if (slope > 0.75) {
        const s = Math.min(1, (slope - 0.75) * 2)
        r = r * (1 - s) + 0x6a * s
        g = g * (1 - s) + 0x5e * s
        b = b * (1 - s) + 0x52 * s
      }
      if (h < 1.6 && h > -0.5) {
        const s = Math.min(1, (1.6 - h) / 1.2)
        r = r * (1 - s) + 0xa8 * s
        g = g * (1 - s) + 0x98 * s
        b = b * (1 - s) + 0x70 * s
      } else if (h <= -0.5) {
        r = 0x5a; g = 0x56; b = 0x44
      }
      if (world.lavaAt(x, z)) {
        r = 0xe0; g = 0x50 + n * 60; b = 0x10
      }
      raw[k * 3] = r
      raw[k * 3 + 1] = g
      raw[k * 3 + 2] = b
    }
  }
  // soften region borders with a small blur
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      let r = 0, g = 0, b = 0, c = 0
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const ii = i + di
          const jj = j + dj
          if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue
          const kk = (jj * N + ii) * 3
          r += raw[kk]; g += raw[kk + 1]; b += raw[kk + 2]; c++
        }
      tmp.setRGB(r / c / 255, g / c / 255, b / c / 255, THREE.SRGBColorSpace)
      const k = (j * N + i) * 3
      colors[k] = tmp.r
      colors[k + 1] = tmp.g
      colors[k + 2] = tmp.b
    }
  }

  const indices = new Uint32Array(world.res * world.res * 6)
  let p = 0
  for (let j = 0; j < world.res; j++) {
    for (let i = 0; i < world.res; i++) {
      const a = j * N + i
      const b = a + 1
      const c = a + N
      const d = c + 1
      indices[p++] = a; indices[p++] = c; indices[p++] = b
      indices[p++] = c; indices[p++] = d; indices[p++] = b
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(new THREE.BufferAttribute(indices, 1))
  geo.computeVertexNormals()
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTexture("ground") })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.receiveShadow = true

  const waterGeo = new THREE.PlaneGeometry(world.size * 4, world.size * 4, 1, 1)
  waterGeo.rotateX(-Math.PI / 2)
  const water = new THREE.Mesh(
    waterGeo,
    new THREE.MeshPhongMaterial({ color: 0x2a5560, transparent: true, opacity: 0.82, shininess: 90, specular: 0x88aaaa })
  )
  water.position.y = SEA_LEVEL
  water.renderOrder = 1

  // glowing lava sheet just above the lava areas
  const lavaGroup = new THREE.Group()
  const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff5a14 })
  const lavaGeo = new THREE.CircleGeometry(1, 10)
  lavaGeo.rotateX(-Math.PI / 2)
  const spots = []
  for (let j = 0; j < N; j += 2)
    for (let i = 0; i < N; i += 2) {
      const x = -half + i * cell
      const z = -half + j * cell
      if (world.lavaAt(x, z) && world.slopeAt(x, z) < 0.5) spots.push([x, z])
    }
  if (spots.length) {
    const inst = new THREE.InstancedMesh(lavaGeo, lavaMat, spots.length)
    const m = new THREE.Matrix4()
    spots.forEach(([x, z], idx) => {
      m.makeScale(cell * 1.3, 1, cell * 1.3)
      m.setPosition(x, world.heightAt(x, z) + 0.12, z)
      inst.setMatrixAt(idx, m)
    })
    lavaGroup.add(inst)
  }

  return { mesh, water, lava: lavaGroup }
}
