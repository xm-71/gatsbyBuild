import * as THREE from "three"
import { Enemy, Npc } from "./actors.js"
import { npcName } from "../logic/names.js"
import { buildCreatureMesh } from "../render/creatures.js"
import { CREATURES } from "../data/creatures.js"
import { RNG } from "../core/rng.js"

// Things that happen on the road and in towns while you travel: caravans
// ambushed by bandits, Sixth House raids at night, and merchants and pilgrims
// walking between towns.
let evId = 0

export class WorldEvents {
  constructor(game, area) {
    this.game = game
    this.area = area
    this.checkT = 8
    this.caravanCd = 90
    this.wanderCd = 20
    this.active = [] // live events
    this.raidedDay = new Map() // town id -> day raided
  }

  update(dt) {
    const g = this.game
    this.checkT -= dt
    this.caravanCd -= dt
    this.wanderCd -= dt
    for (const ev of this.active) this.tick(ev, dt)
    this.active = this.active.filter(ev => !ev.done)
    if (this.checkT > 0) return
    this.checkT = 10
    const p = g.pc.pos
    const w = g.world
    const town = this.area.townAt(p.x, p.z, 0)
    const onRoad = w.roadAt(p.x, p.z) > 0.3 || w.roadAt(p.x + 6, p.z) > 0.3 || w.roadAt(p.x, p.z + 6) > 0.3
    if (!town && onRoad && this.caravanCd <= 0 && !this.active.some(e => e.type === "caravan") && Math.random() < 0.3) this.startCaravan()
    else if (!town && onRoad && this.wanderCd <= 0 && this.active.filter(e => e.type === "wanderer").length < 1 && Math.random() < 0.5) this.startWanderer()
    if (town && g.isNight() && !town.isle && this.raidedDay.get(town.id) !== g.day && !this.active.some(e => e.type === "raid")) {
      this.raidedDay.set(town.id, g.day)
      if (Math.random() < 0.35) this.startRaid(town)
    }
  }

  // A point on the nearest road some distance ahead of you, and the road itself.
  roadAhead(minD, maxD) {
    const p = this.game.pc.pos
    const yaw = this.game.pc.yaw
    const fx = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    let best = null
    for (const r of this.game.world.roads) {
      r.pts.forEach(([x, z], i) => {
        const d = Math.hypot(x - p.x, z - p.z)
        if (d < minD || d > maxD) return
        const ahead = ((x - p.x) * fx + (z - p.z) * fz) / d
        const score = ahead - Math.abs(d - (minD + maxD) / 2) / 100
        if (!best || score > best.score) best = { x, z, i, road: r, score }
      })
    }
    return best
  }

  spawnNpc(spec, x, z) {
    const g = this.game
    const w = g.world
    const town = [...w.towns].sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0]
    const rng = new RNG(`ev:${evId}:${g.time}`)
    const race = spec.race || rng.pick(["dunmer", "imperial", "dunmer", "redguard", "breton", "khajiit"])
    const full = { id: `ev:${evId++}`, townId: town.id, name: npcName(rng, race), race, faction: null, disposition: 55, seed: rng.int(1, 1e9), x, z, ...spec, race }
    const npc = new Npc(g, this.area, full, w.heightAt(x, z))
    this.area.npcs.push(npc)
    return npc
  }

  removeNpc(npc) {
    this.area.scene.remove(npc.mesh)
    this.area.npcs = this.area.npcs.filter(n => n !== npc)
  }

  // ---------- caravan ambush ----------

  startCaravan() {
    const spot = this.roadAhead(45, 80)
    if (!spot) return
    const g = this.game
    this.caravanCd = 420
    const { x, z } = spot
    const merchant = this.spawnNpc({ role: "trader", title: "Caravan Merchant", building: "Caravan" }, x, z)
    // a pack guar standing by the merchant
    const guar = buildCreatureMesh(CREATURES.guar)
    guar.group.position.set(x + 2, g.world.heightAt(x + 2, z), z + 1)
    guar.anim(0, 0, 0)
    this.area.scene.add(guar.group)
    const bandits = []
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      const bx = x + Math.cos(a) * 5
      const bz = z + Math.sin(a) * 5
      const e = new Enemy(g, this.area, i === 0 ? "smuggler" : "bandit", new THREE.Vector3(bx, g.world.heightAt(bx, bz), bz), { tier: 2 })
      e.aware = true
      this.area.enemies.push(e)
      bandits.push(e)
    }
    this.active.push({ type: "caravan", merchant, guar: guar.group, bandits, x, z })
    g.msg("Shouts on the road ahead: bandits are attacking a caravan!", "#ffb080")
    g.audio.play("whiff", { pos: new THREE.Vector3(x, g.pc.pos.y + 1, z) })
  }

  // ---------- Sixth House raid ----------

  startRaid(town) {
    const g = this.game
    const raiders = []
    const pool = g.char.level >= 6 ? ["ashZombie", "ashSlave", "corprusStalker"] : ["ashZombie", "ashSlave"]
    const a0 = Math.random() * Math.PI * 2
    const n = 3 + Math.floor(Math.random() * 2) + Math.floor(g.char.level / 6)
    for (let i = 0; i < n; i++) {
      const a = a0 + (i - n / 2) * 0.25
      const rx = town.x + Math.cos(a) * (town.radius + 8)
      const rz = town.z + Math.sin(a) * (town.radius + 8)
      const e = new Enemy(g, this.area, pool[i % pool.length], new THREE.Vector3(rx, g.world.heightAt(rx, rz), rz), { tier: 3 })
      e.aware = true
      e.raider = true // raiders ignore the guards' line at the town edge
      this.area.enemies.push(e)
      raiders.push(e)
    }
    this.active.push({ type: "raid", town, raiders })
    g.msg(`The Sixth House is raiding ${town.name}! Ash creatures pour out of the dark.`, "#ff7a5a")
    g.audio.sting("discover")
  }

  // ---------- merchants and pilgrims on the road ----------

  startWanderer() {
    const spot = this.roadAhead(60, 110)
    if (!spot) return
    this.wanderCd = 150
    const pilgrim = Math.random() < 0.5
    const r = spot.road
    const dir = Math.random() < 0.5 ? 1 : -1
    const path = dir > 0 ? r.pts.slice(spot.i) : r.pts.slice(0, spot.i + 1).reverse()
    const npc = this.spawnNpc(pilgrim ? { role: "pilgrim", title: "Pilgrim", building: "Pilgrimage" } : { role: "trader", title: "Wandering Merchant", building: "Road" }, spot.x, spot.z)
    npc.path = path
    npc.pathI = 1
    this.active.push({ type: "wanderer", npc })
  }

  tick(ev, dt) {
    const g = this.game
    const p = g.pc.pos
    if (ev.type === "caravan") {
      if (!ev.rewarded && ev.bandits.every(b => b.dead)) {
        ev.rewarded = true
        const gold = 40 + Math.floor(Math.random() * 80) + g.char.level * 5
        g.char.gold += gold
        g.audio.play("gold")
        g.msg(`${ev.merchant.name}: "Thank you, friend! Take this — and see my wares, if you like." (+${gold} gold)`, "#f0d890")
      }
      if (Math.hypot(ev.x - p.x, ev.z - p.z) > 170) {
        this.removeNpc(ev.merchant)
        this.area.scene.remove(ev.guar)
        ev.done = true
      }
    } else if (ev.type === "raid") {
      if (ev.raiders.every(e => e.dead || e.remove)) {
        for (const n of ev.town.npcs) g.dispositionMod.set(n.id, (g.dispositionMod.get(n.id) || 0) + 8)
        g.msg(`The raid is over. The people of ${ev.town.name} are grateful to you.`, "#f0d890")
        ev.done = true
      }
    } else if (ev.type === "wanderer") {
      const n = ev.npc
      if (Math.hypot(n.pos.x - p.x, n.pos.z - p.z) > 180 || !n.path || n.pathI >= n.path.length) {
        this.removeNpc(n)
        ev.done = true
      }
    }
  }
}

// Blight storms bring blighted creatures: tougher, and their bite carries disease.
export function blighten(e) {
  e.blighted = true
  e.name = `Blighted ${e.name}`
  e.maxHp = e.hp = Math.round(e.maxHp * 1.35)
  e.dmg = e.dmg.map(v => Math.round(v * 1.15))
  e.blightElement = "poison"
}
