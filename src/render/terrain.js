import * as THREE from "three"
import { REGIONS, SEA_LEVEL } from "../logic/worldgen.js"
import { createNoise2D } from "../core/noise.js"
import { texture } from "./texgen.js"
import { Q } from "../core/quality.js"

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
}

const UV_SCALE = 5

export function buildTerrain(world) {
  const R = Q.terrainRes
  const half = world.size / 2
  const cell = world.size / R
  const noise = createNoise2D(`splat:${world.seed}`)
  const CH = 16 // chunks per side
  const per = R / CH
  const group = new THREE.Group()

  const T = name => texture(name)
  const uniforms = {
    tGrass: { value: T("grass").map },
    tAsh: { value: T("ash").map },
    tRock: { value: T("rock").map },
    tSand: { value: T("sand").map },
    tMud: { value: T("mud").map },
    tVolc: { value: T("volcanic").map },
    tDirt: { value: T("dirt").map },
    nGrass: { value: T("grass").normalMap },
    nAsh: { value: T("ash").normalMap },
    nDirt: { value: T("dirt").normalMap },
    uTime: { value: 0 },
  }
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, normalMap: T("rock").normalMap })
  material.normalScale.set(1.1, 1.1)
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 splatA;\nattribute vec4 splatB;\nvarying vec4 vSplatA;\nvarying vec4 vSplatB;\nvarying vec2 vSplatUv;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvSplatA = splatA;\nvSplatB = splatB;\nvSplatUv = uv;")
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D tGrass, tAsh, tRock, tSand, tMud, tVolc, tDirt, nGrass, nAsh, nDirt;
uniform float uTime;
varying vec4 vSplatA;
varying vec4 vSplatB;
varying vec2 vSplatUv;
vec3 spl(sampler2D t, vec2 a, vec2 b) { return texture2D(t, a).rgb * 0.62 + texture2D(t, b).rgb * 0.38; }`
      )
      .replace(
        "#include <map_fragment>",
        `vec2 suv = vSplatUv; vec2 suv2 = vSplatUv * 0.23 + vec2(0.37, 0.11);
vec3 sc = vec3(0.0);
if (vSplatA.x > 0.01) sc += spl(tGrass, suv, suv2) * vSplatA.x;
if (vSplatA.y > 0.01) sc += spl(tAsh, suv, suv2) * vSplatA.y;
if (vSplatA.z > 0.01) sc += spl(tRock, suv, suv2) * vSplatA.z;
if (vSplatA.w > 0.01) sc += spl(tSand, suv, suv2) * vSplatA.w;
if (vSplatB.x > 0.01) sc += spl(tMud, suv, suv2) * vSplatB.x;
if (vSplatB.y > 0.01) sc += spl(tVolc, suv, suv2) * vSplatB.y;
if (vSplatB.z > 0.01) sc += spl(tDirt, suv, suv2) * vSplatB.z;
float macro = texture2D(tDirt, vSplatUv * 0.027).g;
diffuseColor.rgb *= sc * (0.75 + macro * 0.6) * (1.0 - vSplatB.w * 0.7);`
      )
      .replace(
        "#include <normal_fragment_maps>",
        `vec3 nb = texture2D(nGrass, suv).xyz * vSplatA.x + texture2D(nAsh, suv).xyz * vSplatA.y
  + texture2D(normalMap, suv).xyz * (vSplatA.z + vSplatB.y) + texture2D(nDirt, suv).xyz * (vSplatA.w + vSplatB.x + vSplatB.z);
float nsum = vSplatA.x + vSplatA.y + vSplatA.z + vSplatA.w + vSplatB.x + vSplatB.y + vSplatB.z;
vec3 mapN = (nsum > 0.001 ? nb / nsum : vec3(0.5, 0.5, 1.0)) * 2.0 - 1.0;
mapN.xy *= normalScale;
normal = normalize( tbn * mapN );`
      )
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.3, 0.05) * vSplatB.w * (1.6 + 0.5 * sin(uTime * 1.7 + vSplatUv.x * 2.3 + vSplatUv.y));"
      )
  }

  const regionSplat = (x, z) => {
    const out = [0, 0, 0, 0, 0, 0, 0]
    const tint = [0, 0, 0]
    const offs = [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6]]
    for (const [ox, oz] of offs) {
      const reg = world.regionAt(x + ox, z + oz)
      const s = REGION_SPLAT[reg]
      for (let i = 0; i < 7; i++) out[i] += s[i] / offs.length
      const t = REGION_TINT[reg]
      for (let i = 0; i < 3; i++) tint[i] += t[i] / offs.length
    }
    return { w: out, tint }
  }

  const nx = new THREE.Vector3()
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
          nx.set(world.heightAt(x - e, z) - world.heightAt(x + e, z), 2 * e, world.heightAt(x, z - e) - world.heightAt(x, z + e)).normalize()
          nor[k * 3] = nx.x
          nor[k * 3 + 1] = nx.y
          nor[k * 3 + 2] = nx.z
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
          for (let q = 0; q < 7; q++) w[q] *= 1 - rockT
          w[2] += rockT
          // beaches and sea bed
          if (h < 1.8) {
            const s = Math.min(1, (1.8 - h) / 1.2)
            for (let q = 0; q < 7; q++) w[q] *= 1 - s
            w[world.regionAt(x, z) === "bitterCoast" ? 4 : 3] += s
          }
          let lava = 0
          if (world.lavaAt(x, z) && slope < 0.35) {
            lava = 1
            for (let q = 0; q < 7; q++) w[q] *= 0.2
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
      const geo = new THREE.BufferGeometry()
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
      geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3))
      geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2))
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3))
      geo.setAttribute("splatA", new THREE.BufferAttribute(sA, 4))
      geo.setAttribute("splatB", new THREE.BufferAttribute(sB, 4))
      geo.setIndex(new THREE.BufferAttribute(idx, 1))
      geo.computeBoundingSphere()
      const mesh = new THREE.Mesh(geo, material)
      mesh.receiveShadow = true
      group.add(mesh)
    }
  }

  const water = buildWater(world)
  return { mesh: group, water, lava: new THREE.Group(), uniforms, update: t => ((uniforms.uTime.value = t), water.userData.update(t)) }
}

function buildWater(world) {
  const geo = new THREE.PlaneGeometry(world.size * 4, world.size * 4, 1, 1)
  geo.rotateX(-Math.PI / 2)
  const n = texture("waterNormal").normalMap
  const n2 = n.clone()
  n2.needsUpdate = true
  const mat = new THREE.MeshPhongMaterial({
    color: 0x1c4450,
    transparent: true,
    opacity: 0.8,
    shininess: 140,
    specular: 0x9ab8b8,
    normalMap: n,
  })
  mat.normalScale.set(0.6, 0.6)
  // second, larger ripple layer mixed in the shader
  mat.onBeforeCompile = shader => {
    shader.uniforms.n2 = { value: n2 }
    shader.uniforms.wTime = { value: 0 }
    mat.userData.shader = shader
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D n2;\nuniform float wTime;")
      .replace(
        "vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;",
        "vec3 mapN = normalize((texture2D( normalMap, vNormalMapUv + vec2(wTime*0.011, wTime*0.007) ).xyz * 2.0 - 1.0) + (texture2D( n2, vNormalMapUv * 0.31 - vec2(wTime*0.004, -wTime*0.006) ).xyz * 2.0 - 1.0));"
      )
  }
  // repeat the ripples every ~12m
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (world.size * 4) / 12, uv.getY(i) * (world.size * 4) / 12)
  const water = new THREE.Mesh(geo, mat)
  water.position.y = SEA_LEVEL
  water.renderOrder = 1
  water.userData.update = t => {
    if (mat.userData.shader) mat.userData.shader.uniforms.wTime.value = t
  }
  return water
}
