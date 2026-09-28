import * as THREE from "three"
import { buildWeapon, buildShield } from "./items.js"
import { texturedMaterial } from "./texgen.js"
import { seg } from "../core/quality.js"

// First-person arms and weapon attached to the camera.
export class ViewModel {
  constructor(camera) {
    this.root = new THREE.Group()
    camera.add(this.root)
    this.right = new THREE.Group()
    this.left = new THREE.Group()
    this.root.add(this.right, this.left)
    this.right.position.set(0.32, -0.32, -0.55)
    this.left.position.set(-0.36, -0.36, -0.55)
    this.right.scale.setScalar(0.42)
    this.left.scale.setScalar(0.42)
    this.swing = 0
    this.draw = 0
    this.castT = 0
    this.bob = 0
    this.key = null
    this.spellGlow = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff8030, transparent: true, opacity: 0.85 }))
    this.spellLight = new THREE.PointLight(0xff8030, 0, 3, 2)
    this.spellGlow.add(this.spellLight)
    this.spellGlow.visible = false
    this.skin = 0xb08a6a
  }

  setSkin(color) {
    this.skin = color
    this.key = null
  }

  arm(side, sleeve, glove) {
    const g = new THREE.Group()
    const skinMat = texturedMaterial("leather", { color: this.skin })
    const sleeveMat = sleeve ? texturedMaterial(sleeve.tex, { color: sleeve.color, metal: sleeve.metal }) : texturedMaterial("fabric", { color: 0x6a5a44 })
    const handMat = glove ? texturedMaterial(glove.tex, { color: glove.color, metal: glove.metal }) : skinMat
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.42, seg(10)), sleeveMat)
    fore.rotation.x = Math.PI / 2
    fore.position.set(0, -0.02, 0.26)
    g.add(fore)
    if (sleeve?.metal || glove) {
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.014, 5, seg(12)), handMat)
      cuff.position.set(0, -0.02, 0.07)
      g.add(cuff)
    }
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.1), handMat)
    palm.position.set(0, -0.01, 0)
    g.add(palm)
    // curled fingers around the grip
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.012, 0.06, 6), handMat)
      f.rotation.z = Math.PI / 2
      f.position.set(0, 0.025, -0.035 + i * 0.024)
      g.add(f)
    }
    const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.06, 6), handMat)
    thumb.position.set(-side * 0.04, 0.02, -0.05)
    thumb.rotation.x = 0.8
    g.add(thumb)
    return g
  }

  build(weapon, shield, cuirass, gauntlets) {
    const key = `${weapon?.uid ?? "fists"}:${shield?.uid ?? "-"}:${cuirass?.uid ?? "-"}:${gauntlets?.uid ?? "-"}:${this.skin}`
    if (key === this.key) return
    this.key = key
    this.right.clear()
    this.left.clear()
    this.left.add(this.spellGlow)
    this.spellGlow.position.set(0, 0.06, -0.06)
    const matOf = item => {
      if (!item) return null
      const m = item.material
      if (m === "netch leather" || m === "chitin") return { tex: m === "chitin" ? "chitinShell" : "hide", color: 0xffffff }
      if (m === "bonemold" || m === "indoril") return { tex: "bonemold", color: item.color }
      if (m === "glass") return { tex: "plate", color: 0x7fe0a0, metal: true }
      if (m === "dwemer") return { tex: "dwemerMetal", color: 0xffffff, metal: true }
      return { tex: "plate", color: item.color ?? 0x8a8a8a, metal: true }
    }
    const sleeve = matOf(cuirass)
    const glove = matOf(gauntlets)
    this.right.add(this.arm(1, sleeve, glove))
    this.left.add(this.arm(-1, sleeve, glove))
    this.bow = null
    this.string = null
    if (weapon) {
      const w = buildWeapon(weapon)
      if (weapon.bound) w.traverse(o => o.isMesh && (o.material = o.material.clone(), o.material.emissive?.set(0x6a1010), o.material.transparent = true, o.material.opacity = 0.85))
      if (weapon.ranged) {
        w.rotation.set(0, 0.25, 0.12)
        w.scale.setScalar(2.2)
        w.position.set(0.3, 0.25, -0.15)
        this.left.add(w)
        this.bow = w
        this.string = w.getObjectByName("string")
      } else {
        w.rotation.x = -0.35
        w.rotation.z = 0.12
        w.position.set(0, 0.02, -0.01)
        w.scale.setScalar(2.2)
        this.right.add(w)
      }
    }
    if (shield && !weapon?.ranged) {
      const s = buildShield(shield)
      s.scale.setScalar(1.15)
      s.rotation.set(0.15, 1.0, 0.25)
      s.position.set(-0.32, -0.05, 0.12)
      this.left.add(s)
    }
  }

  update(dt, moving, sprinting) {
    this.bob += dt * (moving ? (sprinting ? 12 : 8) : 1.5)
    const amp = moving ? 0.018 : 0.004
    this.root.position.set(Math.cos(this.bob * 0.5) * amp, Math.sin(this.bob) * amp, 0)
    const r = this.right
    if (this.bow) {
      this.bow.position.z = -0.02 + this.draw * 0.05
      if (this.string) this.string.position.x = 0.02 + this.draw * 0.2
      r.position.set(0.12, -0.28, -0.5 + this.draw * 0.25)
      r.rotation.set(0, 0, 0)
      this.left.rotation.set(0, 0, 0)
    } else if (this.swing > 0) {
      const t = 1 - this.swing
      const k = Math.sin(t * Math.PI)
      r.rotation.set(-0.3 - k * 1.2, k * 0.9, -k * 0.6)
      r.position.set(0.32 - k * 0.25, -0.32 + k * 0.1, -0.55 - k * 0.15)
      this.swing = Math.max(0, this.swing - dt * 3.2)
    } else {
      r.rotation.set(this.draw * 0.9, -this.draw * 0.3, this.draw * 0.3)
      r.position.set(0.32 + this.draw * 0.08, -0.32 + this.draw * 0.08, -0.55 + this.draw * 0.12)
    }
    if (this.castT > 0) {
      this.castT = Math.max(0, this.castT - dt * 2)
      const k = Math.sin((1 - this.castT) * Math.PI)
      this.left.position.set(-0.36 + k * 0.2, -0.36 + k * 0.15, -0.55 - k * 0.2)
      this.spellGlow.visible = true
      this.spellGlow.scale.setScalar(1 + k * 1.5)
      this.spellLight.intensity = k * 4
    } else {
      this.left.position.set(-0.36, -0.36, -0.55)
      this.spellGlow.visible = false
      this.spellLight.intensity = 0
    }
  }

  cast(color) {
    this.castT = 1
    this.spellGlow.material.color.set(color)
    this.spellLight.color.set(color)
  }
}
