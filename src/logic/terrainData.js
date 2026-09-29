import { SEA_LEVEL } from "./worldgen.js"
import { createNoise2D } from "../core/noise.js"

// Terrain mesh data (positions, normals, UVs, tint and splat weights) for every
// chunk, computed without three.js so it can run in a worker.
// Splat channels: A = grass, ash, rock, sand   B = mud, volcanic, dirt, lava(emissive)
const REGION_SPLAT = {
  ascadian: [0.75, 0, 0.05, 0, 0.05, 0, 0.15],
  grazelands: [0.7, 0, 0.05, 0.1, 0, 0, 0.15],
  bitterCoast: [0.35, 0, 0.05, 0, 0.5, 0, 0.1],
  westGash: [0.45, 0, 0.3, 0, 0, 0, 0.25],
  ashlands: [0, 0.8, 0.15, 0, 0, 0.05, 0],
  redMountain: [0, 0.5, 0.2, 0, 0, 0.3, 0],
  azurasCoast: [0.3, 0, 0.45, 0.15, 0, 0, 0.1],
  molagAmur: [0, 0.3, 0.1, 0, 0, 0.6, 0],
  frostholm: [0, 0, 0.18, 0, 0, 0, 0.04, 0.78],
}
const REGION_TINT = {
  ascadian: [1.0, 1.06, 0.92],
  grazelands: [1.22, 1.1, 0.62],
  bitterCoast: [0.86, 0.94, 0.82],
  westGash: [0.95, 1.0, 0.88],
  ashlands: [1, 0.97, 0.94],
  redMountain: [1.08, 0.92, 0.86],
  azurasCoast: [1, 1, 1.02],
  molagAmur: [1.05, 0.9, 0.86],
  frostholm: [1, 1, 1.02],
}

const UV_SCALE = 5
export const TERRAIN_CHUNKS = 16

export function computeTerrainChunks(world, R) {
  const half = world.size / 2
  const cell = world.size / R
  const noise = createNoise2D(`splat:${world.seed}`)
  const CH = TERRAIN_CHUNKS
  const per = R / CH
  const chunks = []
  const regionSplat = (x, z) => {
    const out = [0, 0, 0, 0, 0, 0, 0, 0] // grass ash rock sand | mud volcanic dirt | snow
    const tint = [0, 0, 0]
    const offs = [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6]]
    for (const [ox, oz] of offs) {
      const reg = world.regionAt(x + ox, z + oz)
      const s = REGION_SPLAT[reg]
      for (let i = 0; i < 8; i++) out[i] += (s[i] || 0) / offs.length
      const t = REGION_TINT[reg]
      for (let i = 0; i < 3; i++) tint[i] += t[i] / offs.length
    }
    return { w: out, tint }
  }

  for (let cz = 0; cz < CH; cz++) {
    for (let cx = 0; cx < CH; cx++) {
      const V = per + 1
      const count = V * V
      const pos = new Float32Array(count * 3)
      const nor = new Float32Array(count * 3)
      const uv = new Float32Array(count * 2)
      const col = new Float32Array(count * 3)
      const sA = new Float32Array(count * 4)
      const sB = new Float32Array(count * 4)
      const sC = new Float32Array(count * 2) // snow, road
      for (let j = 0; j < V; j++) {
        for (let i = 0; i < V; i++) {
          const k = j * V + i
          const x = -half + (cx * per + i) * cell
          const z = -half + (cz * per + j) * cell
          const h = world.heightAt(x, z)
          pos[k * 3] = x
          pos[k * 3 + 1] = h
          pos[k * 3 + 2] = z
          const e = cell * 0.5
          let gx = world.heightAt(x - e, z) - world.heightAt(x + e, z)
          let gy = 2 * e
          let gz = world.heightAt(x, z - e) - world.heightAt(x, z + e)
          const gl = Math.hypot(gx, gy, gz)
          gx /= gl
          gy /= gl
          gz /= gl
          nor[k * 3] = gx
          nor[k * 3 + 1] = gy
          nor[k * 3 + 2] = gz
          const nx = { y: gy }
          uv[k * 2] = x / UV_SCALE
          uv[k * 2 + 1] = z / UV_SCALE
          const { w, tint } = regionSplat(x, z)
          const slope = 1 - nx.y
          const n = noise.fbm(x * 0.02, z * 0.02, 3)
          const n2 = noise.fbm(x * 0.09 + 50, z * 0.09, 2)
          // patchiness: dirt and rock break through
          w[6] += Math.max(0, n2 - 0.15) * 0.8
          w[2] += Math.max(0, n - 0.3) * 0.6
          // steep ground is bare rock
          const rockT = Math.min(1, Math.max(0, (slope - 0.12) * 5))
          for (let q = 0; q < 8; q++) w[q] *= 1 - rockT
          w[2] += rockT
          // beaches and sea bed
          if (h < 1.8) {
            const s = Math.min(1, (1.8 - h) / 1.2)
            for (let q = 0; q < 8; q++) w[q] *= 1 - s
            w[world.regionAt(x, z) === "bitterCoast" ? 4 : 3] += s
          }
          let lava = 0
          if (world.lavaAt(x, z) && slope < 0.35) {
            lava = 1
            for (let q = 0; q < 8; q++) w[q] *= 0.2
            w[5] += 0.8
          }
          const sum = w.reduce((a, b) => a + b, 0) || 1
          sA[k * 4] = w[0] / sum
          sA[k * 4 + 1] = w[1] / sum
          sA[k * 4 + 2] = w[2] / sum
          sA[k * 4 + 3] = w[3] / sum
          sB[k * 4] = w[4] / sum
          sB[k * 4 + 1] = w[5] / sum
          sB[k * 4 + 2] = w[6] / sum
          sB[k * 4 + 3] = lava
          sC[k * 2] = w[7] / sum
          sC[k * 2 + 1] = world.roadAt ? world.roadAt(x, z) : 0
          const shade = 0.9 + n * 0.25 - (h < SEA_LEVEL ? 0.25 : 0)
          col[k * 3] = tint[0] * shade
          col[k * 3 + 1] = tint[1] * shade
          col[k * 3 + 2] = tint[2] * shade
        }
      }
      const idx = new Uint32Array(per * per * 6)
      let p = 0
      for (let j = 0; j < per; j++)
        for (let i = 0; i < per; i++) {
          const a = j * V + i
          const b = a + 1
          const c = a + V
          const d = c + 1
          idx[p++] = a; idx[p++] = c; idx[p++] = b
          idx[p++] = c; idx[p++] = d; idx[p++] = b
        }
      chunks.push({ pos, nor, uv, col, sA, sB, sC, idx })
    }
  }

  return chunks
}
