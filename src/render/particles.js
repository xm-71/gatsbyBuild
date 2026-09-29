import * as THREE from "three"

// Hit feedback particles: sparks off metal, blood, green ichor from chitin,
// bone dust, ghostly wisps and ash puffs. Two pooled point clouds (additive
// for sparks and wisps, normal for matter), moved to whichever scene is active.
const LOOK = {
  flesh: { color: [0.55, 0.05, 0.04], spread: 2.5, up: 1.5, grav: 9, life: 0.6, size: 0.07, glow: false },
  chitin: { color: [0.55, 0.62, 0.15], spread: 2.5, up: 1.5, grav: 9, life: 0.6, size: 0.07, glow: false },
  metal: { color: [1, 0.78, 0.35], spread: 5, up: 2.5, grav: 12, life: 0.35, size: 0.05, glow: true },
  bone: { color: [0.85, 0.82, 0.72], spread: 1.8, up: 1, grav: 5, life: 0.7, size: 0.06, glow: false },
  ghost: { color: [0.55, 0.8, 1], spread: 1.2, up: 1.6, grav: -1.5, life: 0.9, size: 0.09, glow: true },
  ash: { color: [0.4, 0.38, 0.36], spread: 1.4, up: 0.8, grav: 1.5, life: 1.0, size: 0.12, glow: false },
  stone: { color: [0.55, 0.52, 0.48], spread: 2, up: 1.5, grav: 9, life: 0.5, size: 0.06, glow: false },
}

const MAX = 320

class Cloud {
  constructor(additive) {
    this.pos = new Float32Array(MAX * 3)
    this.col = new Float32Array(MAX * 3)
    this.vel = new Float32Array(MAX * 3)
    this.life = new Float32Array(MAX)
    this.max = new Float32Array(MAX)
    this.grav = new Float32Array(MAX)
    this.next = 0
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage))
    this.base = new Float32Array(MAX * 3)
    this.points = new THREE.Points(
      g,
      new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true })
    )
    this.points.frustumCulled = false
    this.points.renderOrder = 5
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -1e4
  }

  emit(p, look, n, dir) {
    for (let k = 0; k < n; k++) {
      const i = this.next
      this.next = (this.next + 1) % MAX
      const s = look.spread
      this.pos[i * 3] = p.x + (Math.random() - 0.5) * 0.2
      this.pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * 0.2
      this.pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.2
      this.vel[i * 3] = (Math.random() - 0.5) * s + (dir?.x || 0) * s * 0.5
      this.vel[i * 3 + 1] = Math.random() * look.up + 0.3
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * s + (dir?.z || 0) * s * 0.5
      const v = 0.75 + Math.random() * 0.35
      this.base[i * 3] = look.color[0] * v
      this.base[i * 3 + 1] = look.color[1] * v
      this.base[i * 3 + 2] = look.color[2] * v
      this.life[i] = this.max[i] = look.life * (0.6 + Math.random() * 0.6)
      this.grav[i] = look.grav
    }
    this.active = true
  }

  update(dt) {
    if (!this.active) return
    let any = false
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue
      any = true
      this.life[i] -= dt
      const j = i * 3
      if (this.life[i] <= 0) {
        this.pos[j + 1] = -1e4
        continue
      }
      this.vel[j + 1] -= this.grav[i] * dt
      this.pos[j] += this.vel[j] * dt
      this.pos[j + 1] += this.vel[j + 1] * dt
      this.pos[j + 2] += this.vel[j + 2] * dt
      const f = this.life[i] / this.max[i]
      this.col[j] = this.base[j] * f
      this.col[j + 1] = this.base[j + 1] * f
      this.col[j + 2] = this.base[j + 2] * f
    }
    this.points.geometry.attributes.position.needsUpdate = true
    this.points.geometry.attributes.color.needsUpdate = true
    this.active = any
  }
}

export class Particles {
  constructor() {
    this.glow = new Cloud(true)
    this.matter = new Cloud(false)
    this.glow.points.material.size = 0.06
    this.matter.points.material.size = 0.09
  }

  attach(scene) {
    scene.add(this.glow.points, this.matter.points)
  }

  burst(pos, material = "flesh", n = 12, dir = null) {
    const look = LOOK[material] || LOOK.flesh
    ;(look.glow ? this.glow : this.matter).emit(pos, look, n, dir)
    // blood and ichor sprays also throw a few dark droplets; metal also chips
    if (material === "metal") this.matter.emit(pos, LOOK.stone, Math.ceil(n / 4), dir)
  }

  update(dt) {
    this.glow.update(dt)
    this.matter.update(dt)
  }
}
