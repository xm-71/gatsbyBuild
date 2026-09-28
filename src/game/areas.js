import * as THREE from "three"
import { buildTerrain } from "../render/terrain.js"
import { buildFlora, GrassField, floraTime } from "../render/flora.js"
import { buildTown, buildEntrance, GLOW, GLOW_COOL } from "../render/buildings.js"
import { Q } from "../core/quality.js"
import { buildDungeonMesh, buildChestMesh, buildStairs } from "../render/dungeonMesh.js"
import { Sky } from "../render/sky.js"
import { Colliders } from "./collision.js"
import { Enemy, Npc } from "./actors.js"
import { REGIONS, SEA_LEVEL } from "../logic/worldgen.js"
import { CELL, FLOOR, bfsDistances } from "../logic/dungeongen.js"
import { creaturesFor } from "../data/creatures.js"

export class OverworldArea {
  // Build synchronously (tests, fallback). Prefer OverworldArea.create for the game.
  constructor(game, world, chunks = null, deferred = false) {
    this.kind = "overworld"
    this.game = game
    this.world = world
    this.chunks = chunks
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(0x9aa0a0, 40, 300)
    this.scene.background = new THREE.Color(0x9aa0a0)
    this.colliders = new Colliders(16)
    this.enemies = []
    this.npcs = []
    this.corpses = []
    this.sacks = []
    this.spawnTimer = 0
    this.clockT = 0
    this.towns = []
    this.entrances = []
    if (!deferred) for (const _ of this.buildSteps()) void _
  }

  // Build the overworld step by step, letting the page repaint between steps.
  static async create(game, world, chunks, onProgress = () => {}) {
    const area = new OverworldArea(game, world, chunks, true)
    const steps = [...area.stepList()]
    for (let i = 0; i < steps.length; i++) {
      onProgress(i / steps.length, steps[i].label)
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)))
      const t0 = performance.now()
      steps[i].run()
      area.buildTimes = area.buildTimes || []
      area.buildTimes.push([steps[i].label, Math.round(performance.now() - t0)])
    }
    onProgress(1, "")
    return area
  }

  *buildSteps() {
    for (const step of this.stepList()) yield step.run()
  }

  stepList() {
    const game = this.game
    const world = this.world
    const steps = []
    steps.push({
      label: "Shaping the land",
      run: () => {
        const terrain = this.chunks ? buildTerrain(world, this.chunks) : buildTerrain(world)
        this.chunks = null
        this.terrain = terrain
        this.scene.add(terrain.mesh, terrain.water)
        this.water = terrain.water
      },
    })
    steps.push({
      label: "Growing emperor parasols",
      run: () => {
        this.flora = buildFlora(world, this.colliders)
        this.scene.add(this.flora)
        this.grass = new GrassField(world, world.towns)
        this.scene.add(this.grass.mesh)
        this.sky = new Sky(this.scene)
      },
    })
    for (const t of world.towns) {
      steps.push({
        label: `Building ${t.name}`,
        run: () => {
          const built = buildTown(t, this.colliders)
          this.scene.add(built.group)
          for (const spec of t.npcs) this.npcs.push(new Npc(game, this, spec, world.heightAt(spec.x, spec.z)))
          this.towns.push({ town: t, ...built })
        },
      })
    }
    steps.push({
      label: "Sealing ancient tombs",
      run: () => {
        this.entrances = world.dungeons.map(d => {
          const e = buildEntrance(d, this.colliders)
          this.scene.add(e.group)
          return { dungeon: d, ...e }
        })
      },
    })
    return steps
  }

  groundHeight(x, z) {
    return this.world.heightAt(x, z)
  }

  resolve(pos, r, feetY) {
    const hit = this.colliders.resolve(pos, r, feetY)
    const lim = this.world.size / 2 - 5
    pos.x = Math.max(-lim, Math.min(lim, pos.x))
    pos.z = Math.max(-lim, Math.min(lim, pos.z))
    return hit
  }

  projectileBlocked(p) {
    return p.y < this.world.heightAt(p.x, p.z) || Math.abs(p.x) > this.world.size / 2
  }

  townAt(x, z, pad = 0) {
    for (const t of this.world.towns) if (Math.hypot(t.x - x, t.z - z) < t.radius + pad) return t
    return null
  }

  regionAt(x, z) {
    return this.world.regionAt(x, z)
  }

  interactables() {
    const list = []
    for (const n of this.npcs) list.push({ type: "npc", pos: new THREE.Vector3(n.pos.x, n.pos.y + 1.4, n.pos.z), name: n.name, ref: n, range: 4 })
    for (const e of this.entrances) list.push({ type: "door", pos: e.doorPos, name: e.dungeon.name, ref: e.dungeon, range: 5 })
    for (const c of this.corpses) if (!c.looted) list.push({ type: "corpse", pos: c.center, name: c.name, ref: c, range: 3.5 })
    for (const s of this.sacks) list.push({ type: "sack", pos: s.pos, name: "Dropped Items", ref: s, range: 3 })
    return list
  }

  spawnNear(px, pz, playerLevel) {
    const alive = this.enemies.filter(e => !e.dead).length
    const night = this.game.isNight()
    if (alive >= 9 + (night ? 3 : 0)) return
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2
      const d = 55 + Math.random() * 45
      const x = px + Math.cos(a) * d
      const z = pz + Math.sin(a) * d
      const h = this.world.heightAt(x, z)
      if (h < 0.3 || this.townAt(x, z, 25) || this.world.lavaAt(x, z)) continue
      const region = this.world.regionAt(x, z)
      const distStart = Math.hypot(x - this.world.startTown.x, z - this.world.startTown.z)
      const maxLevel = Math.max(2, Math.round(playerLevel * 1.2 + 1 + distStart / 250 + (region === "redMountain" ? 4 : 0)))
      const pool = creaturesFor(region, maxLevel)
      if (!pool.length) continue
      const def = pool[Math.floor(Math.random() * pool.length)]
      const group = def.level <= 2 && Math.random() < 0.4 ? 2 : 1
      for (let i = 0; i < group; i++) {
        const e = new Enemy(this.game, this, def.id, new THREE.Vector3(x + i * 1.5, h, z + i), { tier: Math.max(1, Math.round(distStart / 250)) })
        this.enemies.push(e)
      }
      return
    }
  }

  // ambient animation shared by gameplay and the title fly-over
  animate(dt) {
    this.clockT += dt
    floraTime.value = this.clockT
    this.terrain.update(this.clockT)
    const night = 1 - (this.game.daylight ?? 1)
    GLOW.emissiveIntensity = 0.35 + night * 1.6
    GLOW_COOL.emissiveIntensity = 0.35 + night * 1.6
  }

  update(dt) {
    const g = this.game
    this.animate(dt)
    this.grass.update(g.pc.pos.x, g.pc.pos.z)
    this.flora.userData.update(g.pc.pos.x, g.pc.pos.z)
    this.spawnTimer -= dt
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 2.5
      this.spawnNear(g.pc.pos.x, g.pc.pos.z, g.char.level)
    }
    // despawn distant creatures and old corpses
    for (const e of this.enemies) {
      const d = Math.hypot(e.pos.x - g.pc.pos.x, e.pos.z - g.pc.pos.z)
      if (d > 170 && !e.boss) e.remove = true
      if (e.dead && e.deathT > 90) e.remove = true
    }
    const removed = this.enemies.filter(e => e.remove)
    if (removed.length) {
      removed.forEach(e => e.dispose())
      this.enemies = this.enemies.filter(e => !e.remove)
      this.corpses = this.corpses.filter(c => !c.remove)
    }
    for (const e of this.enemies) {
      const d = Math.hypot(e.pos.x - g.pc.pos.x, e.pos.z - g.pc.pos.z)
      if (d < 140) e.update(dt)
    }
    for (const n of this.npcs) {
      const near = Math.abs(n.pos.x - g.pc.pos.x) < 80 && Math.abs(n.pos.z - g.pc.pos.z) < 80
      n.mesh.visible = near
      if (near) n.update(dt, g.ui.dialogueNpc)
    }
    // cull whole towns / entrances that are lost in the fog anyway
    const far = (this.scene.fog.far + 60) * Q.drawDist
    for (const t of this.towns) t.group.visible = Math.hypot(t.town.x - g.pc.pos.x, t.town.z - g.pc.pos.z) < far + t.town.radius
    for (const e of this.entrances) e.group.visible = Math.hypot(e.dungeon.x - g.pc.pos.x, e.dungeon.z - g.pc.pos.z) < far
    const night = 1 - g.daylight
    for (const t of this.towns) {
      t.light.intensity = night * 60
      const body = t.strider.userData.body
      body.position.y = 13 + Math.sin(performance.now() / 900 + t.town.id) * 0.25
    }
  }

  // current daytime haze colour of the region you're in
  fogColor(x, z) {
    return REGIONS[this.world.regionAt(x, z)].fog
  }

  inWater(x, z) {
    return this.world.heightAt(x, z) < SEA_LEVEL - 1.2
  }
}

export class DungeonArea {
  constructor(game, dungeon, levelIndex, lvl, state) {
    this.kind = "dungeon"
    this.game = game
    this.dungeon = dungeon
    this.levelIndex = levelIndex
    this.lvl = lvl
    this.state = state
    this.scene = new THREE.Scene()
    const built = buildDungeonMesh(lvl)
    this.look = built.look
    this.height = built.height
    this.lights = built.lights
    this.scene.add(built.group)
    this.scene.background = new THREE.Color(this.look.fog)
    this.scene.fog = new THREE.Fog(this.look.fog, 8, 55)
    this.scene.add(new THREE.AmbientLight(this.look.ambient, 3.2))
    this.scene.add(new THREE.HemisphereLight(0x9a8a7a, 0x2a2018, 0.6))
    this.enemies = []
    this.corpses = []
    this.sacks = []
    this.chests = []
    this.flowT = 0
    this.flow = null

    lvl.spawns.forEach((s, i) => {
      if (state.dead.has(i)) return
      const e = new Enemy(game, this, s.creature, this.cellCenter(s.x, s.y), {
        boss: s.boss,
        tier: dungeon.tier,
        spawnKey: i,
        relic: s.boss ? dungeon.relic : null,
        questItem: s.boss ? dungeon.questItem : null,
        name: s.boss ? (s.creature === "dagoth" ? game.world.mainQuest.dagoth : game.bossName(s.creature, dungeon)) : undefined,
      })
      this.enemies.push(e)
    })
    lvl.chests.forEach((c, i) => {
      const st = state.chests[i] || (state.chests[i] = { opened: false, locked: c.locked, lockLevel: c.lockLevel, items: null, gold: 0 })
      const mesh = buildChestMesh(st.opened)
      const p = this.cellCenter(c.x, c.y)
      mesh.position.copy(p)
      mesh.rotation.y = (c.seed % 4) * (Math.PI / 2)
      this.scene.add(mesh)
      this.chests.push({ index: i, def: c, state: st, mesh, pos: p })
    })
    const entry = this.cellCenter(lvl.entry.x, lvl.entry.y)
    this.upStairs = buildStairs(false, this.look)
    const up = this.edgeFacing(lvl.entry)
    this.upStairs.position.copy(up)
    this.upStairs.rotation.y = up.rotY || 0
    this.scene.add(this.upStairs)
    this.entryPos = entry
    if (lvl.stairsDown) {
      this.downStairs = buildStairs(true, this.look)
      const dn = this.edgeFacing(lvl.stairsDown)
      this.downStairs.position.copy(dn)
      this.downStairs.rotation.y = dn.rotY || 0
      this.scene.add(this.downStairs)
      this.downPos = this.cellCenter(lvl.stairsDown.x, lvl.stairsDown.y)
    }
    const SOLID = { pipe: 0.4, fleshpillar: 0.9, statue: 0.6, stalagmite: 0.5, coffin: 0.8, altar: 1.0, crate: 0.6, barrel: 0.5, brazier: 0.5, urn: 0.45 }
    this.propColliders = lvl.props.filter(p => SOLID[p.type]).map(p => ({ x: p.x * CELL + CELL / 2 + p.ox, z: p.y * CELL + CELL / 2 + p.oz, r: SOLID[p.type] }))
    this.explored = state.explored || (state.explored = new Uint8Array(lvl.w * lvl.h))
  }

  // world positions of torches and braziers, for their crackle
  lightPositions() {
    return this.lights.map(l => l.getWorldPosition(new THREE.Vector3()))
  }

  // place a doorway on a wall adjacent to the cell, facing into it
  edgeFacing(cell) {
    const c = this.cellCenter(cell.x, cell.y)
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      if (!this.isFloorCell(cell.x + dx, cell.y + dy)) {
        const v = new THREE.Vector3(c.x + dx * (CELL / 2 - 0.3), 0, c.z + dy * (CELL / 2 - 0.3))
        v.rotY = Math.atan2(-dx, -dy)
        return v
      }
    }
    return c
  }

  cellCenter(x, y) {
    return new THREE.Vector3(x * CELL + CELL / 2, 0, y * CELL + CELL / 2)
  }

  cellOf(pos) {
    return { x: Math.floor(pos.x / CELL), y: Math.floor(pos.z / CELL) }
  }

  isFloorCell(x, y) {
    return x >= 0 && y >= 0 && x < this.lvl.w && y < this.lvl.h && this.lvl.grid[y * this.lvl.w + x] === FLOOR
  }

  groundHeight() {
    return 0
  }

  resolve(pos, r) {
    let hit = false
    const cx = Math.floor(pos.x / CELL)
    const cy = Math.floor(pos.z / CELL)
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        if (this.isFloorCell(x, y)) continue
        const minX = x * CELL
        const maxX = minX + CELL
        const minZ = y * CELL
        const maxZ = minZ + CELL
        const px = Math.max(minX, Math.min(maxX, pos.x))
        const pz = Math.max(minZ, Math.min(maxZ, pos.z))
        const dx = pos.x - px
        const dz = pos.z - pz
        const d = Math.hypot(dx, dz)
        if (d < r) {
          hit = true
          if (d > 1e-6) {
            pos.x = px + (dx / d) * r
            pos.z = pz + (dz / d) * r
          } else {
            // inside a wall: shove back to the current cell centre
            const c = this.cellCenter(cx, cy)
            pos.x = c.x
            pos.z = c.z
          }
        }
      }
    }
    for (const pr of this.propColliders) {
      const dx = pos.x - pr.x
      const dz = pos.z - pr.z
      const d = Math.hypot(dx, dz)
      if (d < r + pr.r && d > 1e-6) {
        pos.x = pr.x + (dx / d) * (r + pr.r)
        pos.z = pr.z + (dz / d) * (r + pr.r)
      }
    }
    for (const ch of this.chests) {
      const dx = pos.x - ch.pos.x
      const dz = pos.z - ch.pos.z
      const d = Math.hypot(dx, dz)
      if (d < r + 0.6 && d > 1e-6) {
        pos.x = ch.pos.x + (dx / d) * (r + 0.6)
        pos.z = ch.pos.z + (dz / d) * (r + 0.6)
      }
    }
    return hit
  }

  projectileBlocked(p) {
    if (p.y < 0 || p.y > this.height) return true
    return !this.isFloorCell(Math.floor(p.x / CELL), Math.floor(p.z / CELL))
  }

  los(a, b) {
    const dx = b.x - a.x
    const dz = b.z - a.z
    const d = Math.hypot(dx, dz)
    const steps = Math.ceil(d / (CELL * 0.25))
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      if (!this.isFloorCell(Math.floor((a.x + dx * t) / CELL), Math.floor((a.z + dz * t) / CELL))) return false
    }
    return true
  }

  // Direction to step toward the player using a BFS flow field (refreshed a few times per second).
  pathDir(from, to) {
    if (this.los(from, to)) {
      const dx = to.x - from.x
      const dz = to.z - from.z
      const d = Math.hypot(dx, dz) || 1
      return { x: dx / d, z: dz / d }
    }
    if (!this.flow) return { x: 0, z: 0 }
    const c = this.cellOf(from)
    let best = null
    let bestD = this.flow[c.y * this.lvl.w + c.x]
    if (bestD < 0) bestD = 1e9
    for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = c.x + ddx
      const ny = c.y + ddy
      if (!this.isFloorCell(nx, ny)) continue
      if (ddx && ddy && (!this.isFloorCell(c.x + ddx, c.y) || !this.isFloorCell(c.x, c.y + ddy))) continue
      const v = this.flow[ny * this.lvl.w + nx]
      if (v >= 0 && v < bestD) {
        bestD = v
        best = { nx, ny }
      }
    }
    if (!best) return { x: 0, z: 0 }
    const target = this.cellCenter(best.nx, best.ny)
    const dx = target.x - from.x
    const dz = target.z - from.z
    const d = Math.hypot(dx, dz) || 1
    return { x: dx / d, z: dz / d }
  }

  interactables() {
    const list = []
    list.push({ type: "stairsUp", pos: this.upStairs.position.clone().setY(1.5), name: this.levelIndex === 0 ? `Exit to Vvardenfell` : `Stairs up (level ${this.levelIndex})`, range: 3.2 })
    if (this.downStairs) list.push({ type: "stairsDown", pos: this.downStairs.position.clone().setY(1.5), name: `Stairs down (level ${this.levelIndex + 2})`, range: 3.2 })
    for (const c of this.chests) list.push({ type: "chest", pos: c.pos.clone().setY(0.6), name: c.state.opened ? "Chest (opened)" : c.state.locked ? `Locked Chest (lock ${c.state.lockLevel})` : "Chest", ref: c, range: 3 })
    for (const c of this.corpses) if (!c.looted) list.push({ type: "corpse", pos: c.center, name: c.name, ref: c, range: 3.5 })
    for (const s of this.sacks) list.push({ type: "sack", pos: s.pos, name: "Dropped Items", ref: s, range: 3 })
    return list
  }

  update(dt) {
    const g = this.game
    this.flowT -= dt
    if (this.flowT <= 0) {
      this.flowT = 0.4
      const c = this.cellOf(g.pc.pos)
      if (this.isFloorCell(c.x, c.y)) this.flow = bfsDistances(this.lvl.grid, this.lvl.w, this.lvl.h, c)
    }
    // mark explored cells for the minimap
    const c = this.cellOf(g.pc.pos)
    for (let y = c.y - 3; y <= c.y + 3; y++)
      for (let x = c.x - 3; x <= c.x + 3; x++) if (x >= 0 && y >= 0 && x < this.lvl.w && y < this.lvl.h) this.explored[y * this.lvl.w + x] = 1
    for (const e of this.enemies) e.update(dt)
  }

  dispose() {
    this.scene.traverse(o => {
      if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose?.()
    })
  }
}
