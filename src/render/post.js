import * as THREE from "three"
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js"
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js"
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js"

// Post-processing: the scene renders to an HDR target with depth, then one
// composite pass adds ambient occlusion (from depth), sun shafts and the
// underwater tint, bloom picks out lava, lanterns, spells and glowing blades,
// and the output pass tone-maps to the screen.
//
// opts: { bloom, ao, shafts } — which effects this quality level can afford.
const COMPOSITE = {
  uniforms: {
    tColor: { value: null },
    tDepth: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.05 },
    uFar: { value: 2000 },
    uProj: { value: new THREE.Matrix4() },
    uProjInv: { value: new THREE.Matrix4() },
    uAO: { value: 0 },
    uAORadius: { value: 1.3 },
    uSun: { value: new THREE.Vector2(0.5, 0.5) },
    uSunAmt: { value: 0 },
    uSunColor: { value: new THREE.Color(1, 0.9, 0.7) },
    uUnder: { value: 0 },
    uTime: { value: 0 },
    uDebug: { value: 0 },
  },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
  fragmentShader: `
    #include <packing>
    uniform sampler2D tColor, tDepth;
    uniform vec2 uRes, uSun;
    uniform float uNear, uFar, uAO, uAORadius, uSunAmt, uUnder, uTime, uDebug;
    uniform mat4 uProj, uProjInv;
    uniform vec3 uSunColor;
    varying vec2 vUv;

    vec3 viewPos(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      vec4 clip = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      vec4 v = uProjInv * clip;
      return v.xyz / v.w;
    }

    // screen-space ambient occlusion from depth alone: normals are rebuilt
    // from depth derivatives, and samples in a rotated spiral test the
    // hemisphere above each pixel
    float ambientOcclusion(vec2 uv, float depth) {
      vec3 P = viewPos(uv);
      if (-P.z > 70.0 || depth >= 1.0) return 1.0;
      vec3 N = normalize(cross(dFdx(P), dFdy(P)));
      float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      float rad = uAORadius * uProj[1][1] * 0.5 / -P.z; // radius in uv units
      rad = min(rad, 0.12);
      float occ = 0.0;
      const int N_SAMPLES = 16;
      for (int i = 0; i < N_SAMPLES; i++) {
        float f = (float(i) + 0.5) / float(N_SAMPLES);
        float a = float(i) * 2.39996 + noise * 6.2832; // golden-angle spiral
        f = sqrt(f); // spread samples evenly over the disc
        vec2 o = vec2(cos(a), sin(a)) * rad * f;
        o.x *= uRes.y / uRes.x;
        vec3 S = viewPos(uv + o);
        vec3 v = S - P;
        float d2 = dot(v, v);
        float falloff = 1.0 - smoothstep(0.0, uAORadius * uAORadius * 4.0, d2);
        occ += max(0.0, dot(N, v) / sqrt(d2 + 1e-4) - 0.05) * falloff;
      }
      occ /= float(N_SAMPLES);
      float fade = 1.0 - smoothstep(40.0, 70.0, -P.z);
      return 1.0 - clamp(occ * 4.0, 0.0, 0.8) * fade;
    }

    void main() {
      vec2 uv = vUv;
      if (uUnder > 0.0) uv += vec2(sin(uv.y * 30.0 + uTime * 2.0), cos(uv.x * 26.0 + uTime * 1.7)) * 0.0025 * uUnder;
      vec3 col = texture2D(tColor, uv).rgb;
      float depth = texture2D(tDepth, uv).x;
      if (uAO > 0.0) col *= mix(1.0, ambientOcclusion(uv, depth), uAO);
      if (uDebug > 1.5) { gl_FragColor = vec4(vec3(-viewPos(uv).z / 30.0, texture2D(tDepth, uv).x, 0.0), 1.0); return; }
      if (uDebug > 0.5) { gl_FragColor = vec4(vec3(ambientOcclusion(uv, depth)), 1.0); return; }
      // sun shafts: march toward the sun, gathering open sky
      if (uSunAmt > 0.001) {
        vec2 dir = (uSun - uv);
        float dist = length(dir);
        dir /= 40.0;
        vec2 p = uv + dir * fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        float illum = 0.0;
        float decay = 1.0;
        for (int i = 0; i < 40; i++) {
          p += dir;
          float sky = step(0.99999, texture2D(tDepth, clamp(p, 0.0, 1.0)).x);
          illum += sky * decay;
          decay *= 0.975;
        }
        illum /= 40.0;
        col += uSunColor * illum * uSunAmt * 1.8 * (1.0 - smoothstep(0.0, 1.2, dist));
      }
      if (uUnder > 0.0) {
        float lin = depth >= 1.0 ? 1.0 : clamp(-viewPos(uv).z / 28.0, 0.0, 1.0);
        vec3 deep = vec3(0.03, 0.16, 0.2);
        col = mix(col * vec3(0.55, 0.85, 0.9), deep, lin * 0.85 * uUnder);
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
}

export class PostFX {
  constructor(renderer, opts) {
    this.renderer = renderer
    this.opts = opts
    this.enabled = opts.bloom || opts.ao || opts.shafts
    if (!this.enabled) return
    const size = renderer.getDrawingBufferSize(new THREE.Vector2())
    this.depth = new THREE.DepthTexture(size.x, size.y)
    this.depth.type = THREE.UnsignedIntType
    this.sceneRT = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, depthTexture: this.depth, samples: opts.samples || 0 })
    this.rtA = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, depthBuffer: false })
    this.rtB = this.rtA.clone()
    this.mat = new THREE.ShaderMaterial({ ...COMPOSITE, uniforms: THREE.UniformsUtils.clone(COMPOSITE.uniforms), depthTest: false, depthWrite: false })
    this.quad = new FullScreenQuad(this.mat)
    this.bloom = opts.bloom ? new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.35, 0.35, 1.5) : null
    this.output = new OutputPass()
    this.output.renderToScreen = true
    this.state = { ao: 0, sunAmt: 0, sun: new THREE.Vector2(), sunColor: new THREE.Color(1, 0.9, 0.7), under: 0, time: 0 }
  }

  setSize() {
    if (!this.enabled) return
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2())
    this.sceneRT.setSize(size.x, size.y)
    this.rtA.setSize(size.x, size.y)
    this.rtB.setSize(size.x, size.y)
    this.bloom?.setSize(size.x / 2, size.y / 2)
  }

  render(scene, camera) {
    const r = this.renderer
    if (!this.enabled || this.off) {
      r.setRenderTarget(null)
      return r.render(scene, camera)
    }
    const s = this.state
    r.setRenderTarget(this.sceneRT)
    r.render(scene, camera)
    const u = this.mat.uniforms
    u.tColor.value = this.sceneRT.texture
    u.tDepth.value = this.depth
    u.uRes.value.set(this.sceneRT.width, this.sceneRT.height)
    u.uProj.value.copy(camera.projectionMatrix)
    u.uProjInv.value.copy(camera.projectionMatrixInverse)
    u.uAO.value = this.opts.ao ? s.ao : 0
    u.uSunAmt.value = this.opts.shafts ? s.sunAmt : 0
    u.uSun.value.copy(s.sun)
    u.uSunColor.value.copy(s.sunColor)
    u.uUnder.value = s.under
    u.uTime.value = s.time
    r.setRenderTarget(this.rtA)
    this.quad.render(r)
    if (this.bloom) {
      this.bloom.strength = s.bloom ?? 0.35
      this.bloom.render(r, this.rtB, this.rtA, 0, false)
    }
    this.output.render(r, null, this.rtA)
  }
}
