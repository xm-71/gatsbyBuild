import * as THREE from "three"
import { SEA_LEVEL } from "../logic/worldgen.js"
import { computeTerrainChunks } from "../logic/terrainData.js"
import { texture } from "./texgen.js"
import { Q } from "../core/quality.js"

export function buildTerrain(world, chunks = computeTerrainChunks(world, Q.terrainRes)) {
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
      .replace("#include <common>", "#include <common>\nattribute vec4 splatA;\nattribute vec4 splatB;\nvarying vec4 vSplatA;\nvarying vec4 vSplatB;\nvarying vec2 vSplatUv;\nvarying vec3 vWPos;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvSplatA = splatA;\nvSplatB = splatB;\nvSplatUv = uv;\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;")
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D tGrass, tAsh, tRock, tSand, tMud, tVolc, tDirt, nGrass, nAsh, nDirt;
uniform float uTime;
varying vec4 vSplatA;
varying vec4 vSplatB;
varying vec2 vSplatUv;
varying vec3 vWPos;
// dancing caustic light on the sea floor
float caustic(vec2 p, float t) {
  float c = 0.0;
  for (int i = 0; i < 2; i++) {
    vec2 q = p * (1.0 + float(i) * 0.7) + float(i) * 3.1;
    c += pow(0.5 + 0.5 * (sin(q.x + sin(q.y * 1.3 + t)) * sin(q.y + sin(q.x * 1.1 - t * 0.8))), 5.0);
  }
  return c;
}
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
diffuseColor.rgb *= sc * (0.75 + macro * 0.6) * (1.0 - vSplatB.w * 0.7);
float wd = ${SEA_LEVEL.toFixed(2)} - vWPos.y;
if (wd > 0.0) {
  float cf = smoothstep(0.05, 0.8, wd) * (1.0 - smoothstep(5.0, 14.0, wd));
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.62, 0.86, 0.9), smoothstep(0.0, 4.0, wd));
  diffuseColor.rgb *= 1.0 + caustic(vWPos.xz * 0.55, uTime * 1.3) * 0.9 * cf;
}`
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
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.3, 0.05) * vSplatB.w * (1.15 + 0.4 * sin(uTime * 1.7 + vSplatUv.x * 2.3 + vSplatUv.y));"
      )
  }

  for (const c of chunks) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(c.pos, 3))
    geo.setAttribute("normal", new THREE.BufferAttribute(c.nor, 3))
    geo.setAttribute("uv", new THREE.BufferAttribute(c.uv, 2))
    geo.setAttribute("color", new THREE.BufferAttribute(c.col, 3))
    geo.setAttribute("splatA", new THREE.BufferAttribute(c.sA, 4))
    geo.setAttribute("splatB", new THREE.BufferAttribute(c.sB, 4))
    geo.setIndex(new THREE.BufferAttribute(c.idx, 1))
    geo.computeBoundingSphere()
    const mesh = new THREE.Mesh(geo, material)
    mesh.receiveShadow = true
    group.add(mesh)
  }

  const water = buildWater(world, heightTexture(world, chunks, Math.round(Math.sqrt(chunks[0].pos.length / 3) - 1) * Math.round(Math.sqrt(chunks.length))))
  return { mesh: group, water, lava: new THREE.Group(), uniforms, update: t => ((uniforms.uTime.value = t), water.userData.update(t)) }
}

// Heights under the water, from the terrain chunks, so the sea shader knows
// how deep it is: turquoise shallows, clear edges and foam at the shoreline.
function heightTexture(world, chunks, R) {
  const CH = Math.round(Math.sqrt(chunks.length))
  const per = R / CH
  const V = per + 1
  const N = R + 1
  const data = new Float32Array(N * N)
  chunks.forEach((c, ci) => {
    const cx = ci % CH
    const cz = Math.floor(ci / CH)
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) data[(cz * per + j) * N + cx * per + i] = c.pos[(j * V + i) * 3 + 1]
  })
  const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.FloatType)
  tex.minFilter = tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

function buildWater(world, heightTex) {
  const geo = new THREE.PlaneGeometry(world.size * 4, world.size * 4, 1, 1)
  geo.rotateX(-Math.PI / 2)
  const n = texture("waterNormal").normalMap
  const n2 = n.clone()
  n2.needsUpdate = true
  const mat = new THREE.MeshPhongMaterial({
    color: 0x1c4450,
    transparent: true,
    opacity: 0.85,
    shininess: 140,
    specular: 0x9ab8b8,
    normalMap: n,
    side: THREE.DoubleSide, // seen from below when diving
  })
  mat.normalScale.set(0.6, 0.6)
  // second, larger ripple layer; depth-based colour, clarity and shore foam
  mat.onBeforeCompile = shader => {
    shader.uniforms.n2 = { value: n2 }
    shader.uniforms.wTime = { value: 0 }
    shader.uniforms.tHeight = { value: heightTex }
    shader.uniforms.uWorld = { value: world.size }
    mat.userData.shader = shader
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;")
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D n2, tHeight;\nuniform float wTime, uWorld;\nvarying vec3 vWPos;")
      .replace(
        "vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;",
        "vec3 mapN = normalize((texture2D( normalMap, vNormalMapUv + vec2(wTime*0.011, wTime*0.007) ).xyz * 2.0 - 1.0) + (texture2D( n2, vNormalMapUv * 0.31 - vec2(wTime*0.004, -wTime*0.006) ).xyz * 2.0 - 1.0));"
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec2 huv = (vWPos.xz + uWorld * 0.5) / uWorld;
        float ground = (huv.x > 0.0 && huv.x < 1.0 && huv.y > 0.0 && huv.y < 1.0) ? texture2D(tHeight, huv).r : -30.0;
        float depth = ${SEA_LEVEL.toFixed(2)} - ground;
        float deep = smoothstep(0.2, 7.0, depth);
        diffuseColor.rgb = mix(vec3(0.17, 0.46, 0.44), diffuseColor.rgb, deep);
        diffuseColor.a = mix(0.35, opacity, smoothstep(0.0, 3.5, depth));
        // foam: a broken line at the water's edge, and bands rolling in over the shallows
        float wob = texture2D(normalMap, vNormalMapUv * 0.35 + vec2(wTime * 0.01, 0.0)).r;
        float edge = 1.0 - smoothstep(0.0, 0.35 + wob * 0.25, depth);
        float band = (1.0 - smoothstep(0.2, 1.6, depth)) * smoothstep(0.55, 0.95, sin(depth * 7.0 - wTime * 1.8 + wob * 5.0));
        float foam = clamp(edge + band * 0.6, 0.0, 1.0) * step(0.0, depth) * smoothstep(0.35, 0.6, wob + edge * 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 0.93), foam);
        diffuseColor.a = max(diffuseColor.a, foam * 0.95);`
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
