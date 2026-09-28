import * as THREE from "three"
import { CREATURES } from "../data/creatures.js"
import { RACES } from "../data/stats.js"
import { FACTIONS } from "../data/factions.js"
import { buildCreatureMesh, buildNpcMesh, LodSwitch } from "../render/creatures.js"
import { buildWeapon } from "../render/items.js"
import { makeLabel } from "../render/textures.js"
import { hitChance, evasionOf, applyArmor } from "../logic/combat.js"
import { getAttr, getSkill } from "../logic/character.js"
import { bodyMaterial } from "../audio/sfx.js"

const ELEMENT_COLOR = { fire: 0xff6a20, frost: 0x80c8ff, shock: 0xb080ff, poison: 0x60d040, magic: 0xe0c0ff }
export { ELEMENT_COLOR }

let enemyCounter = 0

export class Enemy {
  constructor(game, area, defId, pos, opts = {}) {
    const base = CREATURES[defId]
    this.game = game
    this.area = area
    this.defId = defId
    this.def = base
    this.id = enemyCounter++
    this.boss = !!opts.boss
    const tierScale = 1 + 0.08 * Math.max(0, (opts.tier || 1) - 1)
    this.level = base.level + (this.boss ? 3 : 0)
    this.maxHp = Math.round(base.hp * tierScale * (this.boss ? (base.boss ? 1.3 : 2.6) : 1))
    this.hp = this.maxHp
    this.dmg = base.dmg.map(v => Math.round(v * 1.25 * (this.boss ? 1.35 : 1) * (0.9 + tierScale * 0.1)))
    this.ar = base.ar + (this.boss ? 10 : 0)
    this.name = opts.name || base.name
    this.pos = pos.clone()
    this.yaw = Math.random() * Math.PI * 2
    this.radius = 0.5 * (base.scale || 1) * (this.boss ? 1.25 : 1)
    this.height = (base.body === "quad" || base.body === "crab" || base.body === "spider" || base.body === "worm" ? 0.7 : 1.8) * (base.scale || 1)
    this.aware = false
    this.cooldown = 0
    this.windup = 0
    this.windupTotal = 1
    this.castCooldown = 2 + Math.random() * 2
    this.paralyzed = 0
    this.calmed = 0
    this.dead = false
    this.deathT = 0
    this.hurtT = 0
    this.attackAnim = 0
    this.wanderDir = null
    this.wanderT = 0
    this.t = Math.random() * 10
    this.spawnKey = opts.spawnKey
    this.relic = opts.relic || null
    this.artifact = opts.artifact || null
    this.questItem = opts.questItem || null
    this.tier = opts.tier || 1
    this.loot = null
    this.looted = false
    this.material = bodyMaterial(base)
    this.voiceT = 4 + Math.random() * 10
    this.painT = 0
    this.dots = [] // poison and other damage over time
    this.weakenT = 0
    this.weakenAmt = 0
    this.staggerT = 0
    this.knock = new THREE.Vector3()
    this.stuck = [] // arrows and thrown weapons you can take back from the corpse

    const built = buildCreatureMesh(base)
    this.mesh = built.group
    this.mesh.rotation.order = "YXZ" // lean and tip in the creature's own frame
    this.rig = built.rig || null
    this.seed = Math.random() * 13
    this.variant = 0
    this.fallDir = -1
    if (this.boss) this.mesh.scale.multiplyScalar(1.25)
    this.anim = built.anim
    this.lodSwitch = new LodSwitch(this.mesh.children[0] ? this.mesh : this.mesh, built.anim, 35)
    this.mesh.position.copy(this.pos)
    this.mesh.traverse(o => {
      if (o.isMesh) o.castShadow = true
    })
    area.scene.add(this.mesh)
  }

  get evasion() {
    return evasionOf(this.def.agility, 40)
  }

  get center() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.height * 0.55, this.pos.z)
  }

  resist(element) {
    return this.def.resist?.[element] || 0
  }

  // Returns damage actually dealt.
  takeDamage(amount, { element = null, physical = false, silver = false } = {}) {
    if (this.dead) return 0
    let dmg = amount
    if (physical) {
      dmg = applyArmor(dmg, this.ar)
      if (this.def.body === "ghost" && !silver) dmg *= 0.5
    }
    if (element) dmg *= 1 - this.resist(element)
    dmg = Math.max(0, dmg)
    this.hp -= dmg
    this.hurtT = 0.2
    this.aware = true
    this.calmed = 0
    if (this.hp <= 0) this.die()
    else if (dmg > 0 && this.painT <= 0) {
      this.painT = 0.6
      this.game.audio.creature(this, "pain")
    }
    return dmg
  }

  // Knocked off balance: the attack in progress is lost and it reels back.
  stagger(time, from) {
    if (this.dead) return
    this.staggerT = Math.max(this.staggerT, time)
    this.windup = 0
    const dx = this.pos.x - from.x
    const dz = this.pos.z - from.z
    const d = Math.hypot(dx, dz) || 1
    const push = (this.boss ? 1.2 : 2.6) / Math.max(0.6, this.def.scale || 1)
    this.knock.set((dx / d) * push, 0, (dz / d) * push)
  }

  die() {
    // fall away from the player, now and then toward them
    this.fallDir = Math.random() < 0.7 ? -1 : 1
    this.dead = true
    this.hp = 0
    this.deathT = 0
    this.game.onEnemyKilled(this)
  }

  detectRange() {
    const g = this.game
    const c = g.char
    let r = this.area.kind === "dungeon" ? 15 : this.def.flying ? 32 : 24
    if (g.pc.sneaking) r *= Math.max(0.25, 1 - getSkill(c, "sneak") / 140 - getAttr(c, "agility") / 600)
    const cham = g.chameleon()
    r *= 1 - cham
    return r
  }

  update(dt) {
    const g = this.game
    this.t += dt
    if (this.dead) {
      this.deathT += dt
      this.updateDeath()
      if (this.def.flying || this.def.floating) this.mesh.position.y = Math.max(this.area.groundHeight(this.pos.x, this.pos.z) + 0.3, this.mesh.position.y - dt * 8)
      if (this.def.body === "ghost") this.mesh.visible = this.deathT < 1.2
      return
    }
    this.cooldown -= dt
    this.castCooldown -= dt
    this.hurtT -= dt
    this.painT -= dt
    if (this.windup <= 0) this.attackAnim = Math.max(0, this.attackAnim - dt * 3)
    if (this.calmed > 0) this.calmed -= dt
    if (this.weakenT > 0) this.weakenT -= dt
    if (this.dots.length) {
      for (const d of this.dots) {
        d.t -= dt
        this.takeDamage(d.dps * dt, { element: d.element })
      }
      this.dots = this.dots.filter(d => d.t > 0)
      if (this.dead) return
    }
    if (this.paralyzed > 0) {
      this.paralyzed -= dt
      this.anim(this.t, 0, 0)
      return
    }
    if (this.staggerT > 0) {
      this.staggerT -= dt
      this.pos.addScaledVector(this.knock, dt)
      this.knock.multiplyScalar(Math.max(0, 1 - dt * 5))
      this.area.resolve(this.pos, this.radius, this.pos.y)
      this.mesh.position.copy(this.pos)
      this.mesh.rotation.x = -Math.min(0.35, this.staggerT * 0.8) // rock back
      this.anim(this.t, 0, 0)
      return
    }
    this.mesh.rotation.x = 0
    const pc = g.pc
    const dx = pc.pos.x - this.pos.x
    const dz = pc.pos.z - this.pos.z
    const dist = Math.hypot(dx, dz)
    const dy = pc.pos.y - this.pos.y
    this.voiceT -= dt
    if (this.voiceT <= 0) {
      this.voiceT = (this.aware ? 5 : 9) + Math.random() * 12
      if (dist < 35) g.audio.creature(this, "idle")
    }

    if (!this.aware && this.calmed <= 0 && !g.char.dead) {
      if (dist < this.detectRange() && (this.area.kind !== "dungeon" || this.area.los(this.pos, pc.pos))) {
        this.aware = true
        g.audio.creature(this, "alert")
        if (this.boss) g.msg(`${this.name} has noticed you!`, "#ff9a7a")
      }
    }
    if (this.calmed > 0 || g.char.dead) this.aware = false

    let dirX = 0
    let dirZ = 0
    let speed = 0
    const reach = this.def.reach * (this.boss ? 1.15 : 1)

    // Creatures won't follow you into a town: the guards see to that.
    const town = this.area.kind === "overworld" ? this.area.townAt(this.pos.x, this.pos.z, 6) : null
    if (town) {
      this.aware = false
      const ax = this.pos.x - town.x
      const az = this.pos.z - town.z
      const l = Math.hypot(ax, az) || 1
      dirX = ax / l
      dirZ = az / l
      speed = this.def.speed
    } else if (this.aware) {
      if (this.windup > 0) {
        this.windup -= dt
        // raise the weapon, claws or head through the wind-up, then strike
        this.attackAnim = Math.min(1, 1 - this.windup / this.windupTotal)
        if (this.windup <= 0) this.resolveMelee(dist, dy, reach)
      } else if (dist > reach * 0.8) {
        const d = this.area.kind === "dungeon" ? this.area.pathDir(this.pos, pc.pos) : { x: dx / dist, z: dz / dist }
        dirX = d.x
        dirZ = d.z
        speed = this.def.speed
      }
      if (this.def.caster && this.castCooldown <= 0 && dist > 3.5 && dist < 28 && (this.area.kind !== "dungeon" || this.area.los(this.pos, pc.pos))) {
        this.castCooldown = 3.2 + Math.random() * 2.5
        this.attackAnim = 1
        g.enemyCast(this, this.def.caster)
      }
      if (dist <= reach + 0.45 && this.cooldown <= 0 && this.windup <= 0 && Math.abs(dy) < 2.6 + (this.def.flying ? 2 : 0)) {
        // heavier creatures telegraph longer: step back out of reach to dodge
        this.variant = Math.floor(Math.random() * 3)
        this.windupTotal = this.windup = 0.42 + Math.min(0.35, ((this.def.scale || 1) - 1) * 0.4) + (this.boss ? 0.12 : 0)
        this.attackAnim = 0
        this.cooldown = 1.25 / this.def.rate
        g.audio.play("windup", { pos: this.center })
      }
    } else {
      this.wanderT -= dt
      if (this.wanderT <= 0) {
        this.wanderT = 2 + Math.random() * 4
        if (Math.random() < 0.6) {
          const a = Math.random() * Math.PI * 2
          this.wanderDir = { x: Math.cos(a), z: Math.sin(a) }
        } else this.wanderDir = null
      }
      if (this.wanderDir) {
        dirX = this.wanderDir.x
        dirZ = this.wanderDir.z
        speed = this.def.speed * 0.3
      }
    }

    if (speed > 0) {
      const nx = this.pos.x + dirX * speed * dt
      const nz = this.pos.z + dirZ * speed * dt
      const ground = this.area.groundHeight(nx, nz)
      // don't wander into deep water unless flying/floating
      if (this.def.flying || this.def.floating || ground > -1.2 || this.area.kind === "dungeon") {
        this.pos.x = nx
        this.pos.z = nz
      } else if (this.wanderDir) this.wanderDir = null
      this.yaw = lerpAngle(this.yaw, Math.atan2(dirX, dirZ), Math.min(1, dt * 8))
    } else if (this.aware) {
      this.yaw = lerpAngle(this.yaw, Math.atan2(dx, dz), Math.min(1, dt * 8))
    }
    // separation from other enemies
    for (const o of this.area.enemies) {
      if (o === this || o.dead) continue
      const sx = this.pos.x - o.pos.x
      const sz = this.pos.z - o.pos.z
      const d = Math.hypot(sx, sz)
      const min = this.radius + o.radius
      if (d < min && d > 1e-4) {
        this.pos.x += (sx / d) * (min - d) * 0.5
        this.pos.z += (sz / d) * (min - d) * 0.5
      }
    }
    this.area.resolve(this.pos, this.radius, this.pos.y)
    const ground = this.area.groundHeight(this.pos.x, this.pos.z)
    if (this.def.flying) {
      const targetY = this.aware && dist < 7 ? pc.pos.y + 0.8 : Math.max(ground, 0) + 4 + Math.sin(this.t * 1.5)
      const cap = this.area.kind === "dungeon" ? this.area.height - 1.5 : Infinity
      this.pos.y += (Math.min(cap, Math.max(ground + 0.6, targetY)) - this.pos.y) * Math.min(1, dt * 3)
    } else if (this.def.floating) {
      this.pos.y = Math.max(ground, 0) + (this.area.kind === "dungeon" ? 1.2 : this.def.floating) + Math.sin(this.t) * 0.3
    } else {
      this.pos.y = this.area.kind === "overworld" ? Math.max(ground, -1.0) : ground
    }
    this.mesh.position.copy(this.pos)
    // creatures swing to one side or the other when they attack
    this.mesh.rotation.y = this.yaw + (this.rig ? 0 : (this.variant - 1) * 0.3 * this.attackAnim)
    const flinch = Math.max(0, this.hurtT) / 0.2
    if (this.lodSwitch.update(dist)) {
      if (this.rig) {
        const ik = this.footIK()
        this.anim(this.t, speed > 0 ? Math.min(1, speed / 3) : 0, this.attackAnim, { variant: this.variant, flinch, ik, seed: this.seed })
      } else {
        this.anim(this.t, speed > 0 ? Math.min(1, speed / 3) : 0, this.attackAnim)
        this.alignToSlope(dt, flinch)
      }
    }
  }

  // Two-legged: the root sits on the lower foot and the uphill leg bends.
  footIK() {
    if (this.def.flying || this.def.floating || this.area.kind === "dungeon") return null
    const s = (this.def.scale || 1) * (this.boss ? 1.25 : 1)
    const rx = Math.cos(this.yaw) * 0.09 * s
    const rz = -Math.sin(this.yaw) * 0.09 * s
    const gL = this.area.groundHeight(this.pos.x - rx, this.pos.z - rz)
    const gR = this.area.groundHeight(this.pos.x + rx, this.pos.z + rz)
    const low = Math.min(gL, gR)
    if (low < this.pos.y) {
      this.pos.y = low
      this.mesh.position.y = low
    }
    return [(gL - low) / s, (gR - low) / s]
  }

  // Four legs and more: pitch and roll the body to lie along the ground.
  alignToSlope(dt, flinch) {
    let pitch = 0
    let roll = 0
    if (!this.def.flying && !this.def.floating && this.area.kind === "overworld") {
      const r = this.radius * 1.2
      const fx = Math.sin(this.yaw) * r
      const fz = Math.cos(this.yaw) * r
      const hF = this.area.groundHeight(this.pos.x + fx, this.pos.z + fz)
      const hB = this.area.groundHeight(this.pos.x - fx, this.pos.z - fz)
      const hR = this.area.groundHeight(this.pos.x + fz, this.pos.z - fx)
      const hL = this.area.groundHeight(this.pos.x - fz, this.pos.z + fx)
      pitch = Math.max(-0.6, Math.min(0.6, Math.atan2(hB - hF, 2 * r)))
      roll = Math.max(-0.5, Math.min(0.5, Math.atan2(hR - hL, 2 * r)))
    }
    const k = Math.min(1, dt * 8)
    this.slopeP = (this.slopeP || 0) + (pitch - (this.slopeP || 0)) * k
    this.slopeR = (this.slopeR || 0) + (roll - (this.slopeR || 0)) * k
    this.mesh.rotation.x = this.slopeP - flinch * 0.18
    this.mesh.rotation.z = this.slopeR
  }

  // Collapse: knees buckle, then the body tips over under gravity and settles.
  updateDeath() {
    const t = this.deathT
    const crumple = Math.min(1, t / 0.35)
    const ft = Math.max(0, t - (this.rig ? 0.22 : 0.05))
    const target = (Math.PI / 2) * (this.rig ? 0.92 : 1)
    let ang = Math.min(target, 0.5 * 26 * ft * ft)
    const land = Math.sqrt((2 * target) / 26)
    if (ft > land) ang = target - 0.09 * Math.exp(-(ft - land) * 7) * Math.abs(Math.sin((ft - land) * 16))
    if (this.rig) {
      this.anim(this.t, 0, 0, { dying: crumple })
      this.mesh.rotation.x = this.fallDir * ang
    } else {
      this.anim(this.t, 0, 0)
      this.mesh.rotation.x = 0
      this.mesh.rotation.z = ang * (this.fallDir < 0 ? 1 : -1)
    }
  }

  resolveMelee(dist, dy, reach) {
    const g = this.game
    if (dist > reach + 0.9 || Math.abs(dy) > 3 + (this.def.flying ? 2 : 0)) return
    const c = g.char
    const chance = hitChance({ skill: 22 + this.level * 4, agility: this.def.agility, luck: 40, fatigue: 1 }, g.playerEvasion())
    this.attackAnim = 1
    if (Math.random() > chance) {
      g.audio.play("whiff", { pos: this.center })
      return
    }
    this.attackAnim = 1
    const dmg = (this.dmg[0] + Math.random() * (this.dmg[1] - this.dmg[0])) * (this.weakenT > 0 ? 1 - this.weakenAmt : 1)
    g.damagePlayer(dmg, { physical: true, source: this })
    if (this.def.element && !c.dead) g.damagePlayer(dmg * 0.4, { element: this.def.element, source: this, quiet: true })
  }

  dispose() {
    this.area.scene.remove(this.mesh)
  }
}

function lerpAngle(a, b, t) {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

export class Npc {
  constructor(game, area, spec, y) {
    this.game = game
    this.area = area
    this.spec = spec
    this.race = RACES[spec.race]
    const built = buildNpcMesh(spec, this.race, spec.faction ? FACTIONS[spec.faction].color : null)
    this.mesh = built.group
    this.anim = built.anim
    this.rig = built.rig
    this.seed = Math.random() * 13
    this.lodSwitch = new LodSwitch(this.mesh, built.anim, 28)
    this.pos = new THREE.Vector3(spec.x, y, spec.z)
    this.home = this.pos.clone()
    this.yaw = Math.random() * Math.PI * 2
    this.t = Math.random() * 10
    this.target = null
    this.waitT = Math.random() * 4
    this.mesh.position.copy(this.pos)
    area.scene.add(this.mesh)
    if (spec.role !== "commoner" && spec.role !== "guard") {
      const label = makeLabel(spec.role === "blade" ? "Blades Contact" : spec.title || roleTitle(spec.role), { size: 22, scale: 0.0034, color: "#d8c890" })
      label.position.set(0, 2.1, 0)
      this.mesh.add(label)
    }
  }

  get name() {
    return this.spec.name
  }

  update(dt, talkingTo) {
    this.t += dt
    let moving = 0
    const pc = this.game.pc
    const toP = Math.hypot(pc.pos.x - this.pos.x, pc.pos.z - this.pos.z)
    let look = null
    const toYaw = Math.atan2(pc.pos.x - this.pos.x, pc.pos.z - this.pos.z)
    if (talkingTo === this || toP < 3.5) {
      this.yaw = lerpAngle(this.yaw, toYaw, Math.min(1, dt * 5))
    } else if (toP < 9) {
      // passers-by follow you with their eyes
      let d = toYaw - this.yaw
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      if (Math.abs(d) < 1.6) look = d
    }
    if (talkingTo === this || toP < 3.5) {
      // already facing
    } else if (this.spec.wander) {
      if (!this.target) {
        this.waitT -= dt
        if (this.waitT <= 0) {
          const a = Math.random() * Math.PI * 2
          const r = Math.random() * 9
          this.target = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r }
        }
      } else {
        const dx = this.target.x - this.pos.x
        const dz = this.target.z - this.pos.z
        const d = Math.hypot(dx, dz)
        if (d < 0.3) {
          this.target = null
          this.waitT = 2 + Math.random() * 6
        } else {
          this.pos.x += (dx / d) * 1.3 * dt
          this.pos.z += (dz / d) * 1.3 * dt
          this.yaw = lerpAngle(this.yaw, Math.atan2(dx, dz), Math.min(1, dt * 6))
          moving = 0.5
          if (this.area.resolve(this.pos, 0.35)) this.target = null
        }
      }
      this.pos.y = this.area.groundHeight(this.pos.x, this.pos.z)
    }
    this.mesh.position.copy(this.pos)
    this.mesh.rotation.y = this.yaw
    this.look = this.look == null || look == null ? look : this.look + (look - this.look) * Math.min(1, dt * 4)
    if (this.lodSwitch.update(toP)) this.anim(this.t, moving, 0, { look: this.look, seed: this.seed, talk: talkingTo === this ? !!this.talking : undefined })
  }
}

export function roleTitle(role) {
  return { trader: "Trader", smith: "Smith", priest: "Healer", caravaner: "Caravaner", guard: "Guard", commoner: "Commoner", blade: "Blades Contact", guildmaster: "Guild" }[role] || role
}

export class Projectile {
  constructor(game, area, { pos, vel, owner, spell = null, arrow = null, color = 0xffffff, gravity = 0, source = null }) {
    this.game = game
    this.source = source
    this.area = area
    this.pos = pos.clone()
    this.vel = vel.clone()
    this.owner = owner
    this.spell = spell
    this.arrow = arrow
    this.gravity = gravity
    this.life = 4
    this.dead = false
    if (arrow?.kind === "thrown") {
      // the thrown weapon itself, spinning (darts and knives fly point-first)
      this.mesh = new THREE.Group()
      const m = buildWeapon(arrow.weapon)
      m.rotation.x = Math.PI / 2
      m.scale.setScalar(1.3)
      this.inner = new THREE.Group()
      this.inner.add(m)
      this.mesh.add(this.inner)
      this.spin = arrow.weapon.base === "throwing star" ? 22 : arrow.weapon.base === "throwing knife" ? 14 : 0
    } else if (arrow) {
      const bolt = arrow.kind === "bolt"
      const col = arrow.enchant?.element ? ELEMENT_COLOR[arrow.enchant.element] : 0x6a5030
      this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(bolt ? 0.022 : 0.015, bolt ? 0.022 : 0.015, bolt ? 0.45 : 0.8, 4), new THREE.MeshLambertMaterial({ color: 0x6a5030, emissive: arrow.enchant ? col : 0x000000, emissiveIntensity: 0.6 }))
      this.mesh.geometry.rotateX(Math.PI / 2)
      if (arrow.enchant?.element) this.mesh.add(new THREE.PointLight(col, 2, 5, 2))
    } else {
      this.mesh = new THREE.Group()
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3) }))
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }))
      this.mesh.add(core, halo)
      this.light = new THREE.PointLight(color, 4, 10, 2)
      this.mesh.add(this.light)
    }
    this.mesh.position.copy(this.pos)
    area.scene.add(this.mesh)
  }

  update(dt) {
    this.life -= dt
    if (this.life <= 0) return this.destroy()
    this.vel.y -= this.gravity * dt
    const steps = 3
    for (let s = 0; s < steps && !this.dead; s++) {
      this.pos.addScaledVector(this.vel, dt / steps)
      if (this.area.projectileBlocked(this.pos)) {
        this.game.projectileImpact(this, null)
        return this.destroy()
      }
      if (this.owner === "player") {
        for (const e of this.area.enemies) {
          if (e.dead) continue
          if (e.center.distanceTo(this.pos) < e.radius + 0.5 + e.height * 0.3) {
            this.game.projectileImpact(this, e)
            return this.destroy()
          }
        }
      } else {
        const pc = this.game.pc
        const cpos = new THREE.Vector3(pc.pos.x, pc.pos.y + 1.0, pc.pos.z)
        if (cpos.distanceTo(this.pos) < 0.9) {
          this.game.projectileImpact(this, "player")
          return this.destroy()
        }
      }
    }
    this.mesh.position.copy(this.pos)
    if (this.arrow) this.mesh.lookAt(this.pos.clone().add(this.vel))
    if (this.spin && this.inner) this.inner.rotation.y += this.spin * dt
  }

  destroy() {
    this.dead = true
    this.area.scene.remove(this.mesh)
  }
}

export { ELEMENT_COLOR as elementColor, getAttr }
