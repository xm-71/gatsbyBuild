import * as THREE from "three"
import { RNG, randomSeed } from "../core/rng.js"
import { generateWorld, relicDescription, SEA_LEVEL, REGIONS } from "../logic/worldgen.js"
import { generateDungeonLevel, DUNGEON_THEMES } from "../logic/dungeongen.js"
import { createCharacter, getAttr, getSkill, maxHealth, maxMagicka, maxFatigue, armorRating, resistance, exerciseSkill, addItem, hasEffect, effectAmount, tickEffects, equip, removeItem, fatigueRatio } from "../logic/character.js"
import { applyArmor, blockChance, evasionOf } from "../logic/combat.js"
import { randomLoot, makeMisc, makeWeapon, makeArmor, makeQuestItem, randomPotion } from "../logic/items.js"
import { bossName } from "../logic/names.js"
import { CREATURES } from "../data/creatures.js"
import { RACES, BIRTHSIGNS, SKILLS } from "../data/stats.js"
import { getSpell } from "../data/spells.js"
import { OverworldArea, DungeonArea } from "./areas.js"
import { Projectile, ELEMENT_COLOR } from "./actors.js"
import { Input } from "./input.js"
import { Audio } from "./audio.js"
import { ViewModel } from "../render/viewmodel.js"
import { updatePlayer, spellEffectsOnEnemy } from "./player.js"
import { UI } from "../ui/ui.js"

const HOURS_PER_SECOND = 2 / 60 // one real second = two game minutes

export class Game {
  constructor(container) {
    this.container = container
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    container.appendChild(this.renderer.domElement)
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 1500)
    this.camera.rotation.order = "YXZ"
    this.viewmodel = new ViewModel(this.camera)
    this.playerLight = new THREE.PointLight(0xffd8a0, 0, 16, 1.6)
    this.camera.add(this.playerLight)
    this.input = new Input(this.renderer.domElement)
    this.audio = new Audio()
    this.ui = new UI(this)
    this.mode = "title"
    this.timer = new THREE.Timer()
    this.projectiles = []
    this.flashes = []
    this.daylight = 1
    this.titleT = 0
    window.addEventListener("resize", () => this.resize())
    this.renderer.domElement.addEventListener("click", () => {
      this.audio.ensure()
      if (this.mode === "play" && !this.ui.modal) this.input.lock()
    })
    this.renderer.setAnimationLoop(() => this.frame())
    this.prepareWorld(randomSeed())
    this.ui.showTitle()
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  // Generate (or reuse) a world for the given seed. The title screen flies over it.
  prepareWorld(seed) {
    if (this.world && this.world.seed === seed) return
    if (this.overworld) this.overworld.scene.clear()
    this.seed = seed
    this.world = generateWorld(seed)
    this.overworld = new OverworldArea(this, this.world)
    this.area = this.overworld
    this.area.scene.add(this.camera)
    this.projectiles = []
  }

  startRun({ name, race, cls, sign, seed }) {
    this.audio.ensure()
    if (seed !== this.seed || this.runStarted) {
      this.world = null
      this.prepareWorld(seed)
    }
    this.runStarted = true
    this.rng = new RNG(`run:${seed}`)
    this.char = createCharacter({ name, race, cls, sign })
    this.char.dead = false
    this.viewmodel.setSkin(RACES[race].skin)
    this.time = 9 // day 0, 9am
    this.day = 0
    this.weather = "clear"
    this.weatherT = 3
    this.quests = []
    this.journal = []
    this.dungeonState = {}
    this.main = { stage: 0 }
    this.knownTowns = new Set([this.world.startTown.id])
    this.trainedThisLevel = 0
    this.merchantStock = new Map()
    this.dispositionMod = new Map()
    this.lastTarget = null
    this.lastTargetT = 0
    const t = this.world.startTown
    const a = t.port.angle
    this.pc = {
      pos: new THREE.Vector3(t.x + Math.cos(a) * (t.radius * 0.45), t.y, t.z + Math.sin(a) * (t.radius * 0.45)),
      vel: new THREE.Vector3(),
      yaw: Math.atan2(Math.cos(a), Math.sin(a)),
      pitch: 0,
      onGround: true,
      sneaking: false,
      swimming: false,
      charging: false,
      chargeT: 0,
      attackCd: 0,
      pendingHit: null,
      castCd: 0,
      stepT: 0,
      hurtFlash: 0,
    }
    this.setArea(this.overworld)
    this.mode = "play"
    this.ui.hideScreens()
    this.ui.showHud()
    const blade = t.npcs.find(n => n.role === "blade")
    this.addJournal(`I have arrived in ${t.name} in the ${REGIONS[t.region].name} of Vvardenfell, a free ${RACES[race].name}. ${blade ? `An Imperial named ${blade.name} of the Blades wishes to speak with me in the town square.` : ""}`)
    this.msg(`Welcome to ${t.name}, outlander. Seed: ${seed}`, "#f0d890")
    this.msg("Click to look around. WASD move · LMB attack · F cast · E activate · Tab menu", "#c9b88f")
    if (blade) this.msg(`${blade.name} of the Blades is waiting to speak with you.`, "#c9b88f")
  }

  setArea(area) {
    for (const p of this.projectiles) p.destroy()
    this.projectiles = []
    this.area = area
    area.scene.add(this.camera)
  }

  // ---------- time & weather ----------

  isNight() {
    const h = this.time % 24
    return h < 5.5 || h > 20
  }

  hourOfDay() {
    return this.time % 24
  }

  advanceTime(hours) {
    const before = Math.floor(this.time / 24)
    this.time += hours
    const after = Math.floor(this.time / 24)
    if (after !== before) {
      this.char.powersUsed = {}
      this.day = after
    }
  }

  updateWeather(dt) {
    this.weatherT -= dt * HOURS_PER_SECOND
    if (this.weatherT > 0) return
    this.weatherT = 3 + Math.random() * 4
    const region = this.world.regionAt(this.pc.pos.x, this.pc.pos.z)
    const R = { ashlands: 0.35, redMountain: 0.6, molagAmur: 0.4 }[region] || 0
    const r = Math.random()
    let w = "clear"
    if (r < R) w = region === "redMountain" && Math.random() < 0.3 ? "blight" : "ash"
    else if (r < R + (["bitterCoast", "ascadian", "westGash"].includes(region) ? 0.25 : 0.08)) w = "rain"
    else if (r < R + 0.35) w = "cloudy"
    else if (r < R + 0.42) w = "fog"
    if (w !== this.weather) {
      this.weather = w
      const txt = { ash: "An ash storm is blowing in.", blight: "A blight storm rolls off Red Mountain!", rain: "It begins to rain.", fog: "Fog settles over the land.", cloudy: "Clouds gather.", clear: "The sky clears." }[w]
      if (this.area.kind === "overworld") this.msg(txt, "#b0a890")
    }
  }

  // ---------- main loop ----------

  frame() {
    this.timer.update()
    const dt = Math.min(0.05, this.timer.getDelta())
    if (this.mode === "title" || this.mode === "chargen") this.updateTitle(dt)
    else if (this.mode === "play") {
      if (!this.ui.modal && this.input.locked) this.update(dt)
      else if (!this.ui.modal && !this.input.locked) this.ui.showPauseHint(true)
      this.ui.updateHud()
    } else if (this.mode === "dead" || this.mode === "victory") {
      this.pc.pitch = Math.min(this.pc.pitch + dt * 0.3, 0.2)
      this.camera.position.y = Math.max(this.camera.position.y - dt * 1.2, this.pc.pos.y + 0.3)
      this.camera.rotation.z = Math.min(this.camera.rotation.z + dt * 0.5, this.mode === "dead" ? 0.9 : 0)
      if (this.area.kind === "overworld") this.area.sky.update(dt, this.hourOfDay(), this.camera, this.area.fogColor(this.pc.pos.x, this.pc.pos.z), this.area.scene.fog)
      for (const e of this.area.enemies) e.update(dt)
    }
    this.viewmodel.root.visible = this.mode === "play"
    if (this.input.locked) this.ui.showPauseHint(false)
    this.input.endFrame()
    this.renderer.render(this.area.scene, this.camera)
  }

  updateTitle(dt) {
    this.titleT += dt * 0.03
    const rm = this.world.redMountain
    const r = 330
    this.camera.position.set(rm.x + Math.cos(this.titleT) * r, 120, rm.z + Math.sin(this.titleT) * r)
    this.camera.lookAt(rm.x, 40, rm.z)
    this.camera.rotation.order = "YXZ"
    const hour = 17.2
    this.overworld.sky.weather = "clear"
    this.overworld.sky.update(dt, hour, this.camera, 0xb09a88, this.overworld.scene.fog)
    this.overworld.scene.fog.far = 900
    this.overworld.scene.fog.near = 200
    this.overworld.scene.background = this.overworld.sky.skyColor
    this.viewmodel.root.visible = false
  }

  update(dt) {
    const c = this.char
    this.advanceTime(dt * HOURS_PER_SECOND)
    this.viewmodel.root.visible = true
    if (this.area.kind === "overworld") {
      this.updateWeather(dt)
      this.area.sky.weather = this.weather
      const { day } = this.area.sky.update(dt, this.hourOfDay(), this.camera, this.area.fogColor(this.pc.pos.x, this.pc.pos.z), this.area.scene.fog)
      this.daylight = day
      this.area.scene.background = this.area.sky.skyColor
      this.knownTownCheck()
    } else this.daylight = 0

    updatePlayer(this, dt)
    this.area.update(dt)
    for (const p of this.projectiles) p.update(dt)
    this.projectiles = this.projectiles.filter(p => !p.dead)
    this.updateFlashes(dt)

    // timed effects
    const expired = tickEffects(c, dt)
    for (const e of expired) {
      if (e.type === "bound") this.endBound(e)
      else if (e.label) this.msg(`${e.label} has worn off.`, "#a8a090")
    }
    // regeneration
    if (!this.pc.sprinting) c.fatigue = Math.min(maxFatigue(c), c.fatigue + (2.5 + getAttr(c, "endurance") / 25) * dt)
    if (!BIRTHSIGNS[c.sign].noMagickaRegen) c.magicka = Math.min(maxMagicka(c), c.magicka + (getAttr(c, "willpower") / 100) * 0.35 * dt)
    // hazards
    if (c.poison > 0) {
      c.poison -= dt
      this.damagePlayer(1.5 * dt * (1 - resistance(c, "poison")), { quiet: true })
    }
    if (this.area.kind === "overworld" && this.pc.onGround && this.world.lavaAt(this.pc.pos.x, this.pc.pos.z) && this.pc.pos.y < this.world.heightAt(this.pc.pos.x, this.pc.pos.z) + 0.3) {
      this.damagePlayer(14 * dt, { element: "fire", quiet: true })
      if (Math.random() < dt * 2) this.msg("The lava burns!", "#ff8a4a")
    }
    this.playerLight.intensity = hasEffect(c, "light") ? 60 : this.area.kind === "dungeon" ? 22 : RACES[c.race].nightEye && this.isNight() ? 12 : 0
    this.playerLight.distance = hasEffect(c, "light") ? 34 : 16
    this.lastTargetT -= dt
    this.pc.hurtFlash = Math.max(0, this.pc.hurtFlash - dt * 2)
  }

  knownTownCheck() {
    for (const t of this.world.towns) {
      if (!this.knownTowns.has(t.id) && Math.hypot(t.x - this.pc.pos.x, t.z - this.pc.pos.z) < t.radius + 30) {
        this.knownTowns.add(t.id)
        this.msg(`You have discovered ${t.name}.`, "#f0d890")
      }
    }
    for (const d of this.world.dungeons) {
      if (!d.discovered && Math.hypot(d.x - this.pc.pos.x, d.z - this.pc.pos.z) < 30) {
        d.discovered = true
        this.msg(`Discovered: ${d.name}`, "#f0d890")
      }
    }
  }

  // ---------- messages & journal ----------

  msg(text, color) {
    this.ui.message(text, color)
  }

  addJournal(text) {
    this.journal.push({ day: Math.floor(this.time / 24) + 1, text })
  }

  skillEvents(events) {
    for (const e of events) {
      if (e.type === "skillUp") {
        this.msg(`Your ${SKILLS[e.skill].name} skill increased to ${e.value}.`, "#f0e0a0")
        this.audio.play("skillup")
      } else if (e.type === "levelReady") {
        this.msg("You should rest and meditate on what you've learned. (Press T)", "#ffe080")
      }
    }
  }

  exercise(skill, amount) {
    this.skillEvents(exerciseSkill(this.char, skill, amount))
  }

  // ---------- combat plumbing ----------

  chameleon() {
    return Math.min(0.95, effectAmount(this.char, "chameleon"))
  }

  playerEvasion() {
    const c = this.char
    return evasionOf(getAttr(c, "agility"), getAttr(c, "luck"), BIRTHSIGNS[c.sign].evasion || 0) + this.chameleon() * 30
  }

  damagePlayer(amount, { physical = false, element = null, source = null, quiet = false } = {}) {
    const c = this.char
    if (c.dead || this.mode !== "play") return
    let dmg = amount
    if (physical) {
      const shield = c.equipment.shield
      if (shield && !this.pc.charging && source) {
        const toSrc = Math.atan2(source.pos.x - this.pc.pos.x, source.pos.z - this.pc.pos.z)
        const facing = Math.atan2(-Math.sin(this.pc.yaw), -Math.cos(this.pc.yaw))
        let diff = Math.abs(toSrc - facing)
        if (diff > Math.PI) diff = Math.PI * 2 - diff
        if (diff < 1.2 && Math.random() < blockChance(getSkill(c, "block"), getAttr(c, "agility"), getAttr(c, "luck"))) {
          this.audio.play("block")
          this.msg("Blocked!", "#c0c0c0")
          this.exercise("block", 1)
          c.fatigue = Math.max(0, c.fatigue - 4)
          return
        }
      }
      dmg = applyArmor(dmg, armorRating(c))
      const slots = ["cuirass", "helm", "greaves", "boots", "gauntlets", "shield"]
      const slot = slots[Math.floor(Math.random() * slots.length)]
      const piece = c.equipment[slot]
      if (piece?.armorClass) this.exercise(piece.armorClass, 1)
      else if (slot !== "shield") this.exercise("unarmored", 1)
    }
    if (element) {
      dmg *= 1 - resistance(c, element)
      if (element === "poison" && dmg > 0 && resistance(c, "poison") < 1) c.poison = Math.max(c.poison, 5)
    }
    if (dmg <= 0) return
    c.health -= dmg
    if (!quiet) {
      this.audio.play("hurt")
      this.pc.hurtFlash = Math.min(1, 0.3 + dmg / 20)
    }
    if (c.health <= 0) this.playerDied(source)
  }

  playerDied(source) {
    const c = this.char
    c.health = 0
    c.dead = true
    this.mode = "dead"
    this.input.unlock()
    this.audio.play("death")
    this.deathCause = source ? `slain by ${source.name}` : "succumbed to their wounds"
    this.recordRun(false)
    setTimeout(() => this.ui.showDeath(), 1600)
  }

  score() {
    const c = this.char
    const s = c.stats
    const relics = this.relicsHeld().length
    return Math.round(c.level * 100 + s.kills * 10 + s.dungeonsCleared * 150 + s.questsDone * 75 + relics * 300 + c.gold / 10 + Math.floor(this.time / 24) * 20 + (this.mode === "victory" ? 5000 : 0))
  }

  recordRun(victory) {
    const c = this.char
    const entry = { name: c.name, race: RACES[c.race].name, cls: c.cls, level: c.level, days: Math.floor(this.time / 24) + 1, score: this.score(), victory, cause: victory ? "Destroyed the Heart of Lorkhan" : this.deathCause, seed: this.seed, date: new Date().toISOString().slice(0, 10) }
    try {
      const runs = JSON.parse(localStorage.getItem("ashfall-runs") || "[]")
      runs.unshift(entry)
      localStorage.setItem("ashfall-runs", JSON.stringify(runs.slice(0, 20)))
    } catch {
      /* storage unavailable */
    }
    return entry
  }

  pastRuns() {
    try {
      return JSON.parse(localStorage.getItem("ashfall-runs") || "[]")
    } catch {
      return []
    }
  }

  enemyCast(enemy, spellId) {
    const spell = getSpell(spellId)
    const from = enemy.center.add(new THREE.Vector3(0, 0.3, 0))
    const target = new THREE.Vector3(this.pc.pos.x, this.pc.pos.y + 1.2, this.pc.pos.z)
    const vel = target.sub(from).normalize().multiplyScalar(17)
    const el = spell.effects.find(e => e.element)?.element || "magic"
    this.projectiles.push(new Projectile(this, this.area, { pos: from, vel, owner: "enemy", spell, color: ELEMENT_COLOR[el], source: enemy }))
    this.audio.play("spell")
  }

  projectileImpact(p, target) {
    if (p.arrow) {
      if (target && target !== "player") {
        const dealt = target.takeDamage(p.arrow.damage, { physical: true, silver: p.arrow.silver })
        if (p.arrow.enchant?.element) target.takeDamage(p.arrow.enchant.amount, { element: p.arrow.enchant.element })
        this.audio.play("hit")
        this.exercise("marksman", 1)
        this.setTarget(target)
        if (dealt > 0 && p.arrow.sneak) this.msg("Sneak attack! Critical hit.", "#ffe080")
      }
      return
    }
    const spell = p.spell
    const el = spell.effects.find(e => e.element)?.element || "magic"
    this.flash(p.pos, ELEMENT_COLOR[el], spell.splash ? 3 : 1)
    this.audio.play("explode")
    if (p.owner === "player") {
      const hits = spell.splash ? this.area.enemies.filter(e => !e.dead && e.center.distanceTo(p.pos) < spell.splash + e.radius) : target ? [target] : []
      for (const e of hits) {
        spellEffectsOnEnemy(this, spell, e)
        this.setTarget(e)
      }
    } else {
      const hitPlayer = target === "player" || (spell.splash && new THREE.Vector3(this.pc.pos.x, this.pc.pos.y + 1, this.pc.pos.z).distanceTo(p.pos) < spell.splash)
      if (!hitPlayer) return
      const c = this.char
      const absorb = BIRTHSIGNS[c.sign].absorb || 0
      if (absorb && Math.random() < absorb) {
        c.magicka = Math.min(maxMagicka(c), c.magicka + spell.cost)
        this.msg("You absorb the spell!", "#a0c0ff")
        return
      }
      if (Math.random() < resistance(c, "magic") * 0.5) {
        this.msg("You resisted the spell.", "#a0c0ff")
        return
      }
      for (const e of spell.effects) {
        if (e.type === "damage") this.damagePlayer(e.amount[0] + Math.random() * (e.amount[1] - e.amount[0]), { element: e.element, source: p.source })
        if (e.type === "paralyze") this.msg("You resist the paralysis.", "#a0c0ff")
      }
    }
  }

  flash(pos, color, size = 1) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.5 * size, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }))
    m.position.copy(pos)
    const l = new THREE.PointLight(color, 8, 12 * size, 2)
    m.add(l)
    this.area.scene.add(m)
    this.flashes.push({ m, t: 0.35, area: this.area })
  }

  updateFlashes(dt) {
    for (const f of this.flashes) {
      f.t -= dt
      f.m.scale.multiplyScalar(1 + dt * 6)
      f.m.material.opacity = Math.max(0, f.t * 2)
      if (f.t <= 0) f.area.scene.remove(f.m)
    }
    this.flashes = this.flashes.filter(f => f.t > 0)
  }

  setTarget(e) {
    this.lastTarget = e
    this.lastTargetT = 4
  }

  // ---------- kills, loot, quests ----------

  bossName(creatureId, dungeon) {
    const rng = new RNG(`boss:${dungeon.seed}`)
    return bossName(rng, CREATURES[creatureId].name)
  }

  onEnemyKilled(e) {
    const c = this.char
    c.stats.kills++
    this.audio.play("hit")
    const loot = []
    let gold = 0
    const tier = e.tier || 1
    if (e.def.gold) gold += Math.round(e.def.gold[0] + Math.random() * (e.def.gold[1] - e.def.gold[0]))
    if (e.def.humanoid && Math.random() < 0.5) loot.push(...randomLoot(new RNG(Math.random() * 1e9), tier, "any", 1))
    if (e.def.humanoid && Math.random() < 0.3) loot.push(randomPotion(new RNG(Math.random() * 1e9), tier))
    if (e.def.loot && Math.random() < 0.65) loot.push(makeMisc(e.def.loot[Math.floor(Math.random() * e.def.loot.length)], 1))
    if (e.boss) {
      loot.push(...randomLoot(new RNG(Math.random() * 1e9), Math.min(7, tier + 1), this.area.kind === "dungeon" ? DUNGEON_THEMES[this.area.dungeon.type].lootTag : "any", 3))
      gold += 50 * tier + Math.round(Math.random() * 100 * tier)
      if (e.relic) loot.push(makeRelic(e.relic))
      if (e.questItem) loot.push(makeQuestItem(e.questItem.name, e.questItem.questId))
    }
    e.loot = loot
    e.gold = gold
    e.looted = loot.length === 0 && gold === 0
    this.area.corpses.push(e)

    for (const q of this.quests) {
      if (q.status !== "active") continue
      if (q.type === "cull" && q.creature === e.defId) {
        q.killed++
        this.msg(`${q.title}: ${q.killed}/${q.count}`, "#d8c890")
        if (q.killed >= q.count) {
          q.status = "ready"
          this.msg(`Return to ${q.giverName} in ${q.giverTown}.`, "#f0d890")
        }
      }
    }
    if (this.area.kind === "dungeon") {
      this.area.state.dead.add(e.spawnKey)
      const d = this.area.dungeon
      if (e.boss && !d.cleared) {
        d.cleared = true
        c.stats.dungeonsCleared++
        this.msg(`${e.name} is dead. ${d.name} has been cleared.`, "#f0d890")
        for (const q of this.quests) {
          if (q.status === "active" && q.dungeonId === d.id && (q.type === "clear" || q.type === "bounty")) {
            q.status = "ready"
            this.msg(`Return to ${q.giverName} in ${q.giverTown} for your reward.`, "#f0d890")
          }
        }
        if (e.relic) this.msg(`${e.name} carried ${e.relic}! Search the body.`, "#ffe080")
      }
      if (e.defId === "dagoth") setTimeout(() => this.victory(), 2500)
    }
  }

  victory() {
    if (this.mode !== "play") return
    this.mode = "victory"
    this.input.unlock()
    this.audio.play("levelup")
    this.addJournal(`${this.world.mainQuest.dagoth} is dead and the Heart of Lorkhan is severed. The Blight will lift from Vvardenfell.`)
    this.recordRun(true)
    this.ui.showVictory()
  }

  relicsHeld() {
    return this.char.inventory.filter(i => i.relic).map(i => i.relic)
  }

  onItemTaken(item) {
    if (item.relic) {
      const held = this.relicsHeld()
      this.msg(`You have recovered ${item.relic}. (${held.length}/3)`, "#ffe080")
      this.addJournal(`I recovered ${relicDescription(item.relic)}.`)
      if (held.length >= 3 && this.main.stage < 2) {
        this.main.stage = 2
        const cit = this.world.dungeons[this.world.mainQuest.citadelId]
        cit.sealed = false
        this.addJournal(`With Sunder, Keening and Wraithguard in hand, the seal on ${cit.name} in the crater of Red Mountain will open for me. ${this.world.mainQuest.dagoth} waits at the Heart.`)
        this.msg("All three tools of Kagrenac are yours. Go to Red Mountain.", "#ffe080")
      }
    }
    if (item.kind === "quest") {
      const q = this.quests.find(q => q.id === item.questId)
      if (q && q.status === "active") {
        q.status = "ready"
        this.msg(`Return the ${item.name} to ${q.giverName} in ${q.giverTown}.`, "#f0d890")
      }
    }
  }

  // ---------- dungeons ----------

  enterDungeon(d) {
    if (d.sealed) {
      const held = this.relicsHeld()
      this.msg(`A ward of the Sixth House seals the door. You need Sunder, Keening and Wraithguard (${held.length}/3).`, "#ff9a7a")
      return
    }
    this.returnPos = { x: this.pc.pos.x, y: this.pc.pos.y, z: this.pc.pos.z, yaw: this.pc.yaw + Math.PI }
    this.msg(`Entering ${d.name}...`, "#c9b88f")
    d.discovered = true
    this.loadDungeonLevel(d, 0, false)
  }

  loadDungeonLevel(d, level, fromBelow) {
    const st = (this.dungeonState[d.id] ||= { levels: {} })
    const lst = (st.levels[level] ||= { dead: new Set(), chests: {} })
    const lvl = generateDungeonLevel({ seed: d.seed, type: d.type, tier: d.tier, level, levels: d.levels, relic: d.relic, citadel: !!d.citadel })
    if (this.area.kind === "dungeon") this.area.dispose()
    const area = new DungeonArea(this, d, level, lvl, lst)
    this.setArea(area)
    const spawnCell = fromBelow ? lvl.stairsDown : lvl.entry
    const p = area.cellCenter(spawnCell.x, spawnCell.y)
    this.pc.pos.copy(p)
    this.pc.vel.set(0, 0, 0)
    this.char.stats.deepest = Math.max(this.char.stats.deepest, level + 1)
    this.audio.play("door")
    this.msg(`${d.name} — level ${level + 1} of ${d.levels}`, "#c9b88f")
  }

  exitDungeon() {
    if (this.area.kind === "dungeon") this.area.dispose()
    this.setArea(this.overworld)
    const r = this.returnPos
    this.pc.pos.set(r.x, r.y, r.z)
    this.pc.yaw = r.yaw
    this.pc.vel.set(0, 0, 0)
    this.audio.play("door")
  }

  teleportToTown(town) {
    if (this.area.kind === "dungeon") {
      this.area.dispose()
      this.setArea(this.overworld)
    }
    this.pc.pos.set(town.x + 3, town.y, town.z + 3)
    this.pc.vel.set(0, 0, 0)
    this.knownTowns.add(town.id)
  }

  // ---------- bound weapons ----------

  endBound(effect) {
    const c = this.char
    const item = c.inventory.find(i => i.uid === effect.key)
    if (item) removeItem(c, item)
    if (effect.prev && c.inventory.includes(effect.prev)) equip(c, effect.prev)
    this.msg("Your bound weapon returns to Oblivion.", "#a8a090")
  }

  // Spawn a bag of dropped items at the player's feet.
  dropItem(item, qty) {
    const c = this.char
    const n = Math.min(qty, item.qty || 1)
    const copy = { ...item, qty: item.stackKey ? n : undefined }
    removeItem(c, item, n)
    const pos = new THREE.Vector3(this.pc.pos.x, this.pc.pos.y + 0.3, this.pc.pos.z)
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshLambertMaterial({ color: 0x8a7a50 }))
    mesh.position.copy(pos)
    this.area.scene.add(mesh)
    this.area.sacks.push({ pos, items: [copy], gold: 0, mesh })
  }
}

export function makeRelic(name) {
  let item
  if (name === "Sunder") {
    item = makeWeapon("dwemer", "warhammer")
    item.damage = [22, 42]
    item.enchant = { key: "shock", element: "shock", amount: 12, tag: "" }
    item.color = 0xc0a040
  } else if (name === "Keening") {
    item = makeWeapon("glass", "shortsword")
    item.damage = [16, 30]
    item.enchant = { key: "absorb", absorb: true, amount: 8, tag: "" }
    item.color = 0xb0e0ff
  } else {
    item = makeArmor("dwemer", "gauntlets")
    item.ar = 30
    item.enchant = { key: "resistMagic", resist: "magic", amount: 0.5, tag: "" }
  }
  item.name = name
  item.relic = name
  item.value = 0
  item.weight = Math.round(item.weight * 0.5)
  return item
}

export { SEA_LEVEL, getAttr, getSkill, maxHealth, maxMagicka, maxFatigue, fatigueRatio, addItem }
