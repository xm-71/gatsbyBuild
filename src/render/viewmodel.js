import * as THREE from "three"

// First-person hands/weapon attached to the camera.
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
    this.swing = 0 // 0..1 progress of swing animation
    this.draw = 0 // 0..1 wind-up
    this.castT = 0
    this.bob = 0
    this.itemUid = null
    this.shieldUid = null
    this.spellGlow = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff8030, transparent: true, opacity: 0.9 }))
    this.spellGlow.visible = false
    this.left.add(this.spellGlow)
    this.skin = 0xb08a6a
  }

  setSkin(color) {
    this.skin = color
    this.itemUid = "rebuild"
  }

  build(weapon, shield) {
    const wKey = weapon ? weapon.uid : "fists"
    const sKey = shield ? shield.uid : "none"
    if (wKey === this.itemUid && sKey === this.shieldUid) return
    this.itemUid = wKey
    this.shieldUid = sKey
    this.right.clear()
    this.left.children.filter(c => c !== this.spellGlow).forEach(c => this.left.remove(c))
    const lam = c => new THREE.MeshLambertMaterial({ color: c })
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.14), lam(this.skin))
    this.right.add(hand)
    const lhand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.14), lam(this.skin))
    this.left.add(lhand)
    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.4), lam(0x5a4632))
    forearm.position.set(0.02, -0.03, 0.26)
    this.right.add(forearm)
    const lforearm = forearm.clone()
    lforearm.position.x = -0.02
    this.left.add(lforearm)

    if (weapon) {
      const color = weapon.color ?? 0x999999
      const metal = new THREE.MeshPhongMaterial({ color, shininess: 60, emissive: weapon.bound ? 0x401010 : weapon.enchant ? 0x101830 : 0 })
      const wood = lam(0x4a3220)
      const g = new THREE.Group()
      const b = weapon.base
      if (weapon.ranged) {
        const bow = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.018, 5, 16, Math.PI * 0.9), weapon.material === "chitin" ? lam(0x5a4a2a) : metal)
        bow.rotation.z = Math.PI / 2 + 0.15
        bow.position.set(-0.05, 0, 0)
        g.add(bow)
        const string = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.82, 3), lam(0xdddddd))
        string.position.set(0.0, 0, 0)
        g.add(string)
        this.string = string
        g.rotation.y = 0.2
        g.position.set(-0.4, 0.12, -0.12)
        this.left.add(g)
        this.bow = g
      } else {
        let len = 0.9
        let width = 0.06
        if (b === "dagger" || b === "tanto") len = 0.4
        else if (b === "shortsword") len = 0.6
        else if (b === "claymore") (len = 1.3), (width = 0.08)
        if (b === "club" || b === "mace" || b === "warhammer") {
          const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, b === "warhammer" ? 1.1 : 0.7, 6), wood)
          shaft.position.y = 0.3
          g.add(shaft)
          const head = b === "warhammer" ? new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.16), metal) : new THREE.Mesh(new THREE.SphereGeometry(b === "club" ? 0.07 : 0.1, 8, 6), b === "club" ? wood : metal)
          head.position.y = b === "warhammer" ? 0.85 : 0.65
          g.add(head)
        } else if (b === "war axe" || b === "battle axe") {
          const L = b === "battle axe" ? 1.1 : 0.75
          const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, L, 6), wood)
          shaft.position.y = L / 2 - 0.1
          g.add(shaft)
          const head = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, b === "battle axe" ? 0.3 : 0.22), metal)
          head.position.set(0, L - 0.2, 0.1)
          g.add(head)
        } else if (b === "spear" || b === "halberd") {
          const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.8, 6), wood)
          shaft.position.y = 0.5
          g.add(shaft)
          const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 4), metal)
          tip.position.y = 1.5
          g.add(tip)
          if (b === "halberd") {
            const axe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.25, 0.22), metal)
            axe.position.set(0, 1.3, 0.1)
            g.add(axe)
          }
        } else {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(width, len, 0.015), metal)
          blade.position.y = len / 2 + 0.08
          g.add(blade)
          const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.05), lam(0x6a5020))
          guard.position.y = 0.07
          g.add(guard)
          const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6), wood)
          grip.position.y = -0.02
          g.add(grip)
        }
        g.rotation.x = -0.35
        g.rotation.z = 0.15
        this.right.add(g)
        this.bow = null
      }
    }
    if (shield && !weapon?.ranged) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 12), new THREE.MeshLambertMaterial({ color: shield.color ?? 0x777777 }))
      s.rotation.x = Math.PI / 2
      s.rotation.z = 0.3
      s.position.set(-0.05, 0.05, -0.05)
      this.left.add(s)
    }
  }

  update(dt, moving, sprinting) {
    this.bob += dt * (moving ? (sprinting ? 12 : 8) : 1.5)
    const amp = moving ? 0.018 : 0.004
    this.root.position.set(Math.cos(this.bob * 0.5) * amp, Math.sin(this.bob) * amp, 0)
    // swing: draw back then slash across
    const r = this.right
    if (this.bow) {
      this.bow.position.z = -0.12 + this.draw * 0.05
      if (this.string) this.string.position.x = -this.draw * 0.18
      r.position.set(0.1 - this.draw * 0.0, -0.25, -0.5 + this.draw * 0.25)
      r.rotation.set(0, 0, 0)
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
    } else {
      this.left.position.set(-0.36, -0.36, -0.55)
      this.spellGlow.visible = false
    }
  }

  cast(color) {
    this.castT = 1
    this.spellGlow.material.color.set(color)
  }
}
