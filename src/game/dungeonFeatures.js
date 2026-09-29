import * as THREE from "three"
import { CELL } from "../logic/dungeongen.js"
import { texturedMaterial } from "../render/texgen.js"
import { getSkill, getAttr } from "../logic/character.js"
import { Projectile } from "./actors.js"

// The working parts of a dungeon level: pressure plates, secret walls, the
// lever-worked vault gate, and lava or flood water over the low ground.
const ROMAN = ["I", "II", "III"]

export class DungeonFeatures {
  constructor(area) {
    this.area = area
    this.game = area.game
    const lvl = area.lvl
    const feat = area.feat
    const scene = area.scene
    const look = area.look
    this.plates = []
    this.blocks = []
    this.levers = []
    this.gateMesh = null
    this.msgT = 0
    const wallMat = texturedMaterial(look.wall, { color: new THREE.Color(look.wallTint).multiplyScalar(0.92).getHex() })
    const metal = texturedMaterial("dwemerMetal", { color: 0x6a6a6a, metal: true })
    // pressure plates: a slightly raised stone square, easy to miss
    ;(lvl.traps || []).forEach((t, i) => {
      const c = area.cellCenter(t.x, t.y)
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 1.3), texturedMaterial(look.floor, { color: new THREE.Color(look.floorTint).multiplyScalar(0.85).getHex() }))
      m.position.set(c.x, c.y + (feat.traps[i] ? 0.0 : 0.04), c.z)
      m.receiveShadow = true
      scene.add(m)
      this.plates.push({ t, i, m, c })
    })
    // secret walls: a block of wall that slides away when found
    ;(lvl.secrets || []).forEach((s, i) => {
      if (feat.secrets[i]) return
      const c = area.cellCenter(s.x, s.y)
      const m = new THREE.Mesh(new THREE.BoxGeometry(CELL, area.height + 2, CELL), wallMat)
      m.position.set(c.x, area.height / 2 - 1, c.z)
      scene.add(m)
      this.blocks.push({ s, i, m, c })
    })
    const pz = lvl.puzzle
    if (pz) {
      // portcullis across the vault's entrance
      const c = area.cellCenter(pz.gate.x, pz.gate.y)
      const alongX = area.lvl.grid[pz.gate.y * lvl.w + pz.gate.x - 1] === 1 && area.lvl.grid[pz.gate.y * lvl.w + pz.gate.x + 1] === 1
      const g = new THREE.Group()
      for (let k = -4; k <= 4; k++) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, area.height, 6), metal)
        bar.position.set(alongX ? k * 0.44 : 0, area.height / 2, alongX ? 0 : k * 0.44)
        g.add(bar)
      }
      for (const y of [0.8, 2.2]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(alongX ? CELL : 0.1, 0.1, alongX ? 0.1 : CELL), metal)
        bar.position.y = y
        g.add(bar)
      }
      g.position.set(c.x, c.y + (feat.gate ? area.height - 0.4 : 0), c.z)
      scene.add(g)
      this.gateMesh = g
      this.gateC = c
      // levers against the walls of other rooms
      pz.levers.forEach((l, k) => {
        const lc = area.cellCenter(l.x, l.y)
        const pos = new THREE.Vector3(lc.x, lc.y, l.wall === "north" ? l.y * CELL + 0.25 : lc.z)
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.15), metal)
        base.position.set(pos.x, pos.y + 1.2, pos.z)
        const handle = new THREE.Group()
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), texturedMaterial("wood", { color: 0x8a6a4a }))
        stick.position.y = 0.35
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), metal)
        knob.position.y = 0.72
        handle.add(stick, knob)
        handle.position.set(pos.x, pos.y + 1.2, pos.z + 0.1)
        handle.rotation.x = feat.levers[k] ? -0.7 : 0.7
        scene.add(base, handle)
        this.levers.push({ k, pos, handle })
      })
    }
    // lava or water filling the low ground
    const lq = lvl.liquid
    if (lq) {
      const geo = new THREE.PlaneGeometry(lvl.w * CELL, lvl.h * CELL, 1, 1)
      geo.rotateX(-Math.PI / 2)
      const mat =
        lq.kind === "lava"
          ? new THREE.MeshLambertMaterial({ color: 0x3a1004, emissive: new THREE.Color(0xff5a10), emissiveIntensity: 1.6, map: texturedMaterial("volcanic").map })
          : new THREE.MeshPhongMaterial({ color: 0x1a3a40, transparent: true, opacity: 0.72, shininess: 90, specular: 0x6a8a90, depthWrite: false })
      if (mat.map) mat.map.repeat?.set(lvl.w / 2, lvl.h / 2)
      const m = new THREE.Mesh(geo, mat)
      m.position.set((lvl.w * CELL) / 2, lq.y, (lvl.h * CELL) / 2)
      m.renderOrder = 2
      scene.add(m)
      this.liquid = m
      if (lq.kind === "lava") {
        const l = new THREE.PointLight(0xff5a10, 30, 40, 1.4)
        l.position.set(area.entryPos.x, lq.y + 2, area.entryPos.z)
        scene.add(l)
      }
    }
  }

  interactables() {
    const out = []
    const area = this.area
    const g = this.game
    const p = g.pc.pos
    for (const b of this.blocks) {
      if (Math.hypot(b.c.x - p.x, b.c.z - p.z) > 4.2) continue
      out.push({ type: "use", verb: "Search", pos: new THREE.Vector3(b.c.x, b.c.y + 1.4, b.c.z), name: "the cracked wall", range: 3.4, act: () => this.search(b) })
    }
    for (const l of this.levers) out.push({ type: "use", verb: "Pull", pos: l.pos.clone().setY(l.pos.y + 1.3), name: `Lever ${ROMAN[l.k]} (${area.feat.levers[l.k] ? "raised" : "lowered"})`, range: 2.8, act: () => this.pull(l) })
    if (this.gateC && !area.feat.gate) {
      out.push({ type: "use", verb: "Read", pos: this.gateC.clone().setY(this.gateC.y + 1.6), name: "the inscription above the gate", range: 3.6, act: () => this.readPlaque() })
    }
    return out
  }

  search(b) {
    const g = this.game
    const c = g.char
    const chance = 0.35 + (getSkill(c, "security") + getAttr(c, "luck") / 5) / 160
    g.exercise("security", 0.5)
    if (Math.random() > chance) return g.msg("You run your hands along the stones. Something is odd here...", "#a8a090")
    this.area.feat.secrets[b.i] = true
    this.area.walk[b.s.y * this.area.lvl.w + b.s.x] = 1
    this.area.scene.remove(b.m)
    this.blocks = this.blocks.filter(x => x !== b)
    g.particles.burst(b.c.clone().setY(b.c.y + 1.2), "stone", 24)
    g.audio.play("door")
    g.msg("A loose stone gives way: a hidden passage!", "#f0d890")
  }

  pull(l) {
    const g = this.game
    const f = this.area.feat
    f.levers[l.k] = f.levers[l.k] ? 0 : 1
    l.handle.rotation.x = f.levers[l.k] ? -0.7 : 0.7
    g.audio.play("unlock")
    const pz = this.area.lvl.puzzle
    if (!f.gate && pz.combo.every((v, i) => v === f.levers[i])) {
      f.gate = true
      this.area.walk[pz.gate.y * this.area.lvl.w + pz.gate.x] = 1
      this.raiseT = 1.5
      g.audio.play("door")
      g.msg("Somewhere, chains rattle and a heavy gate grinds open.", "#f0d890")
    } else g.msg(`Lever ${ROMAN[l.k]} ${f.levers[l.k] ? "raised" : "lowered"}.`, "#c9b88f")
  }

  readPlaque() {
    const combo = this.area.lvl.puzzle.combo.map((v, i) => `${ROMAN[i]} ${v ? "raised" : "lowered"}`).join(", ")
    this.game.msg(`Carved above the gate: "Let the three keys stand thus: ${combo}."`, "#e0d0a0")
  }

  update(dt) {
    const g = this.game
    const area = this.area
    const pc = g.pc
    const c = area.cellOf(pc.pos)
    this.msgT -= dt
    if (this.raiseT > 0 && this.gateMesh) {
      this.raiseT -= dt
      this.gateMesh.position.y = Math.min(this.gateC.y + area.height - 0.4, this.gateMesh.position.y + dt * 2.2)
    }
    // pressure plates
    for (const pl of this.plates) {
      if (area.feat.traps[pl.i] || pl.t.x !== c.x || pl.t.y !== c.y) continue
      if (Math.hypot(pl.c.x - pc.pos.x, pl.c.z - pc.pos.z) > 0.9) continue
      area.feat.traps[pl.i] = true
      pl.m.position.y = pl.c.y
      const ch = g.char
      if (pc.sneaking && Math.random() < 0.15 + getSkill(ch, "sneak") / 120) {
        g.exercise("sneak", 1)
        g.msg("You feel a stone shift underfoot and ease your weight off it. A trap, disarmed.", "#c9e0a0")
        continue
      }
      this.trigger(pl)
    }
    // lava burns; water slows you and drowns your footsteps
    const lq = area.lvl.liquid
    pc.wading = false
    if (lq) {
      const ground = area.groundHeight(pc.pos.x, pc.pos.z)
      if (ground < lq.y - 0.05 && pc.pos.y < lq.y + 0.2) {
        if (lq.kind === "lava") {
          g.damagePlayer(15 * dt, { element: "fire", quiet: true })
          if (Math.random() < dt * 6) g.particles.burst(pc.pos.clone().setY(lq.y + 0.1), "metal", 3)
          if (this.msgT <= 0) {
            this.msgT = 2.5
            g.msg("The lava burns!", "#ff8a4a")
          }
        } else pc.wading = true
      }
      if (this.liquid && lq.kind === "lava") this.liquid.material.emissiveIntensity = 1.4 + Math.sin(performance.now() / 600) * 0.25
    }
  }

  trigger(pl) {
    const g = this.game
    const pc = g.pc
    const c = pl.c
    g.audio.play("unlock", { pos: c.clone() })
    if (pl.t.kind === "gas") {
      g.particles.burst(c.clone().setY(c.y + 0.6), "chitin", 40)
      g.particles.burst(c.clone().setY(c.y + 1.2), "chitin", 30)
      g.audio.play("poison", { pos: c.clone() })
      g.damagePlayer(pl.t.dmg * 0.5, { element: "poison", source: null })
      g.msg("A cloud of choking gas bursts from the floor!", "#9ae070")
      return
    }
    // a dart from the nearest wall, aimed at where you stand
    const lvl = this.area.lvl
    let from = null
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let n = 1
      while (n < 6 && this.area.isFloorCell(pl.t.x + dx * n, pl.t.y + dy * n)) n++
      if (n < 6) {
        const d = (n - 0.55) * CELL
        from = new THREE.Vector3(c.x + dx * d, c.y + 1.3, c.z + dy * d)
        break
      }
    }
    void lvl
    if (!from) from = new THREE.Vector3(c.x + 3, c.y + 1.3, c.z)
    const target = new THREE.Vector3(pc.pos.x, pc.pos.y + 1.2, pc.pos.z)
    const vel = target.sub(from).normalize().multiplyScalar(26)
    g.projectiles.push(new Projectile(g, this.area, { pos: from, vel, owner: "enemy", arrow: { damage: pl.t.dmg, trap: true, kind: "bolt" } }))
    g.audio.play("crossbow", { pos: from.clone() })
    g.msg("Click. A dart flies from the wall!", "#ff9a7a")
  }
}
