import * as THREE from "three"
import { buildTerrain } from "../render/terrain.js"
import { buildFlora, GrassField, floraTime } from "../render/flora.js"
import { buildTown, buildEntrance, GLOW, GLOW_COOL } from "../render/buildings.js"
import { generateInterior, FOOTPRINT } from "../logic/interiors.js"
import { buildInterior } from "../render/interiors.js"
import { buildSignpost, buildDock, buildWreck, buildStronghold, buildPropylon, buildGhostfence, buildSeabed, GHOST_GLOW } from "../render/landmarks.js"
import { Q } from "../core/quality.js"
import { buildDungeonMesh, buildChestMesh, buildStairs } from "../render/dungeonMesh.js"
import { Sky } from "../render/sky.js"
import { Colliders } from "./collision.js"
import { Enemy, Npc } from "./actors.js"
import { REGIONS, SEA_LEVEL } from "../logic/worldgen.js"
import { CELL, FLOOR, bfsDistances } from "../logic/dungeongen.js"
import { creaturesFor } from "../data/creatures.js"
import { WorldEvents, blighten } from "./events.js"
import { DungeonFeatures } from "./dungeonFeatures.js"

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
    this.platforms = [] // walkable decks above the terrain (piers)
    this.events = new WorldEvents(game, this)
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
          for (const spec of t.npcs) if (spec.indoor == null) this.npcs.push(new Npc(game, this, spec, world.heightAt(spec.x, spec.z)))
          this.towns.push({ town: t, ...built })
        },
      })
    }
    steps.push({
      label: "Laying the roads",
      run: () => {
        const g = new THREE.Group()
        for (const post of world.signposts || []) g.add(buildSignpost(post, world.towns, world.heightAt, this.colliders))
        for (const t of world.towns) {
          if (!t.dock) continue
          g.add(buildDock(t, world.heightAt, this.colliders))
          const d = t.dock
          this.platforms.push({ x: d.x + Math.cos(d.angle) * (d.length / 2 - 1), z: d.z + Math.sin(d.angle) * (d.length / 2 - 1), ca: Math.cos(d.angle), sa: Math.sin(d.angle), halfL: d.length / 2 + 0.2, halfW: 1.35, y: d.deckY + 0.1 })
        }
        this.roadside = g
        this.scene.add(g)
      },
    })
    steps.push({
      label: "Raising the Ghostfence",
      run: () => {
        this.landmarks = []
        for (const l of world.landmarks || []) {
          let built
          if (l.type === "wreck" || l.type === "sunken") built = buildWreck(l, this.colliders)
          else if (l.type === "stronghold") built = buildStronghold(l, this.colliders)
          else if (l.type === "propylon") built = buildPropylon(l, this.colliders)
          else if (l.type === "ghostfence") built = { group: buildGhostfence(l, world.heightAt, this.colliders) }
          if (!built) continue
          this.scene.add(built.group)
          this.landmarks.push({ l, ...built })
        }
        this.seabed = buildSeabed(world.clams || [])
        this.scene.add(this.seabed)
      },
    })
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
    let h = this.world.heightAt(x, z)
    for (const p of this.platforms) {
      const dx = x - p.x
      const dz = z - p.z
      const along = dx * p.ca + dz * p.sa
      const across = -dx * p.sa + dz * p.ca
      if (Math.abs(along) < p.halfL && Math.abs(across) < p.halfW && p.y > h) h = p.y
    }
    return h
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
    // building doors in the town you're in
    const px = this.game.pc.pos.x
    const pz = this.game.pc.pos.z
    for (const t of this.world.towns) {
      if (Math.hypot(t.x - px, t.z - pz) > t.radius + 20) continue
      for (const b of t.buildings) if (b.door) list.push({ type: "use", verb: "Enter", pos: new THREE.Vector3(b.door.x, t.y + 1.4, b.door.z), name: b.label || "House", range: 3.2, act: g => g.enterInterior(t.id, b.idx) })
    }
    // clams near you on the sea floor
    for (const c of this.world.clams || []) {
      if (Math.abs(c.x - px) > 6 || Math.abs(c.z - pz) > 6) continue
      if (this.game.landmarkState(`c${c.id}`).opened) continue
      list.push({ type: "use", verb: "Open", pos: new THREE.Vector3(c.x, c.y + 0.2, c.z), name: "Clam", range: 2.6, act: g => g.openClam(c) })
    }
    for (const m of this.landmarks || []) {
      if (m.chest) list.push({ type: "use", verb: "Open", pos: m.chest, name: "Chest", range: 3, act: g => g.openLandmarkChest(m.l) })
      if (m.stone) list.push({ type: "use", verb: "Touch", pos: m.stone, name: "Propylon Index", range: 3.5, act: g => g.usePropylon(m.l) })
    }
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
        if (this.game.weather === "blight" && Math.random() < 0.5) blighten(e)
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
    this.seabed?.userData.update(this.clockT)
    GHOST_GLOW.opacity = 0.22 + 0.1 * Math.sin(this.clockT * 1.7) + 0.05 * Math.sin(this.clockT * 5.3)
  }

  update(dt) {
    const g = this.game
    this.animate(dt)
    this.grass.update(g.pc.pos.x, g.pc.pos.z)
    this.flora.userData.update(g.pc.pos.x, g.pc.pos.z)
    if (g.mode === "play") this.events.update(dt)
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
    for (const m of this.landmarks || []) {
      if (m.l.type === "ghostfence") continue
      const d = Math.hypot(m.l.x - g.pc.pos.x, m.l.z - g.pc.pos.z)
      m.group.visible = d < far + 30
      // bandits hold the old forts; they return every few days
      if (m.l.type === "stronghold" && d < 90) {
        const st = g.landmarkState(m.l.id)
        if (st.banditsDay == null || g.day - st.banditsDay >= 3) {
          st.banditsDay = g.day
          const [cx, cz] = m.inside
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2
            const x = cx + Math.cos(a) * 5
            const z = cz + Math.sin(a) * 5
            this.enemies.push(new Enemy(g, this, i === 0 ? "smuggler" : "bandit", new THREE.Vector3(x, this.world.heightAt(x, z), z), { tier: 3 }))
          }
        }
      }
    }
    const night = 1 - g.daylight
    for (const t of this.towns) {
      t.light.intensity = night * 60
      const body = t.strider?.userData.body
      if (body) body.position.y = 13 + Math.sin(performance.now() / 900 + t.town.id) * 0.25
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
    // walkable cells: the floor grid minus closed secret walls and the gate
    this.walk = Uint8Array.from(lvl.grid)
    this.feat = state.feat || (state.feat = { traps: {}, secrets: {}, levers: [0, 0, 0], gate: false })
    for (const [i, s] of (lvl.secrets || []).entries()) if (!this.feat.secrets[i]) this.walk[s.y * lvl.w + s.x] = 0
    if (lvl.puzzle && !this.feat.gate) this.walk[lvl.puzzle.gate.y * lvl.w + lvl.puzzle.gate.x] = 0
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
      const story = s.boss && dungeon.isleStory
      const e = new Enemy(game, this, story ? "draugrLord" : s.creature, this.cellCenter(s.x, s.y), {
        boss: s.boss,
        tier: dungeon.tier,
        spawnKey: i,
        relic: s.boss ? dungeon.relic : null,
        artifact: s.boss ? dungeon.artifact : null,
        questItem: story ? { name: "Horn of the Ancestors", questId: "isle" } : s.boss ? dungeon.questItem : null,
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
    this.upStairs.position.y = this.cellCenter(lvl.entry.x, lvl.entry.y).y
    this.upStairs.rotation.y = up.rotY || 0
    this.scene.add(this.upStairs)
    this.entryPos = entry
    if (lvl.stairsDown) {
      this.downStairs = buildStairs(true, this.look)
      const dn = this.edgeFacing(lvl.stairsDown)
      this.downStairs.position.copy(dn)
      this.downStairs.position.y = this.cellCenter(lvl.stairsDown.x, lvl.stairsDown.y).y
      this.downStairs.rotation.y = dn.rotY || 0
      this.scene.add(this.downStairs)
      this.downPos = this.cellCenter(lvl.stairsDown.x, lvl.stairsDown.y)
    }
    const SOLID = { pipe: 0.4, fleshpillar: 0.9, statue: 0.6, stalagmite: 0.5, coffin: 0.8, altar: 1.0, crate: 0.6, barrel: 0.5, brazier: 0.5, urn: 0.45 }
    this.propColliders = lvl.props.filter(p => SOLID[p.type]).map(p => ({ x: p.x * CELL + CELL / 2 + p.ox, z: p.y * CELL + CELL / 2 + p.oz, r: SOLID[p.type] }))
    this.explored = state.explored || (state.explored = new Uint8Array(lvl.w * lvl.h))
    this.features = new DungeonFeatures(this)
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
    const cx = x * CELL + CELL / 2
    const cz = y * CELL + CELL / 2
    return new THREE.Vector3(cx, this.groundHeight(cx, cz), cz)
  }

  cellOf(pos) {
    return { x: Math.floor(pos.x / CELL), y: Math.floor(pos.z / CELL) }
  }

  isFloorCell(x, y) {
    return x >= 0 && y >= 0 && x < this.lvl.w && y < this.lvl.h && (this.walk ? this.walk[y * this.lvl.w + x] : this.lvl.grid[y * this.lvl.w + x]) === FLOOR
  }

  // floor height, interpolated from the level's corner heights (ramps)
  groundHeight(x, z) {
    const C = this.lvl.corners
    if (!C || x === undefined) return 0
    const cw = this.lvl.w + 1
    const fx = Math.max(0, Math.min(this.lvl.w - 1e-4, x / CELL))
    const fz = Math.max(0, Math.min(this.lvl.h - 1e-4, z / CELL))
    const i = Math.floor(fx)
    const j = Math.floor(fz)
    const tx = fx - i
    const tz = fz - j
    const a = C[j * cw + i]
    const b = C[j * cw + i + 1]
    const c = C[(j + 1) * cw + i]
    const d = C[(j + 1) * cw + i + 1]
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz
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
    list.push({ type: "stairsUp", pos: this.upStairs.position.clone().setY(this.upStairs.position.y + 1.5), name: this.levelIndex === 0 ? `Exit to Vvardenfell` : `Stairs up (level ${this.levelIndex})`, range: 3.2 })
    if (this.downStairs) list.push({ type: "stairsDown", pos: this.downStairs.position.clone().setY(this.downStairs.position.y + 1.5), name: `Stairs down (level ${this.levelIndex + 2})`, range: 3.2 })
    for (const c of this.chests) list.push({ type: "chest", pos: c.pos.clone().setY(c.pos.y + 0.6), name: c.state.opened ? "Chest (opened)" : c.state.locked ? `Locked Chest (lock ${c.state.lockLevel})` : "Chest", ref: c, range: 3 })
    for (const c of this.corpses) if (!c.looted) list.push({ type: "corpse", pos: c.center, name: c.name, ref: c, range: 3.5 })
    for (const s of this.sacks) list.push({ type: "sack", pos: s.pos, name: "Dropped Items", ref: s, range: 3 })
    list.push(...this.features.interactables())
    return list
  }

  update(dt) {
    const g = this.game
    this.features.update(dt)
    this.flowT -= dt
    if (this.flowT <= 0) {
      this.flowT = 0.4
      const c = this.cellOf(g.pc.pos)
      if (this.isFloorCell(c.x, c.y)) this.flow = bfsDistances(this.walk, this.lvl.w, this.lvl.h, c)
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

// Inside a town building: a furnished room with the people who work or live there.
export class InteriorArea {
  constructor(game, town, building) {
    this.kind = "interior"
    this.game = game
    this.town = town
    this.building = building
    const L = (this.layout = generateInterior(town, building))
    this.height = L.H
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x0a0806)
    this.scene.fog = new THREE.Fog(0x0a0806, 20, 60)
    const built = buildInterior(L)
    this.scene.add(built.group)
    this.lights = built.lights
    this.scene.add(new THREE.AmbientLight(0x6a5a48, 2.2))
    this.scene.add(new THREE.HemisphereLight(0xa89878, 0x3a2e24, 0.8))
    this.colliders = new Colliders(4)
    for (const f of L.furniture) {
      const fp = FOOTPRINT[f.type]
      if (!fp) continue
      if (typeof fp === "number") this.colliders.addCircle(f.x, f.z, fp)
      else this.colliders.addBox(f.x, f.z, fp[0] * 2, fp[1] * 2, f.rot || 0)
    }
    this.enemies = []
    this.corpses = []
    this.sacks = []
    this.npcs = []
    const residents = town.npcs.filter(n => n.indoor === building.idx)
    residents.forEach((spec, i) => {
      const s = L.spots[i] || { x: (i % 2 ? 1 : -1) * 1.5, z: 0.5 + i, yaw: Math.PI }
      const npc = new Npc(game, this, { ...spec, x: s.x, z: s.z, wander: !!s.wander, work: spec.work || s.work }, 0)
      npc.yaw = s.yaw
      this.npcs.push(npc)
    })
    this.exitPos = new THREE.Vector3(0, 1.4, -L.D / 2 + 0.4)
    this.entryPos = new THREE.Vector3(0, 0, -L.D / 2 + 1.4)
  }

  lightPositions() {
    return this.lights.map(l => l.position.clone())
  }

  groundHeight() {
    return 0
  }

  resolve(pos, r, feetY) {
    const hit = this.colliders.resolve(pos, r, feetY)
    const L = this.layout
    const lx = L.W / 2 - r - 0.15
    const lz = L.D / 2 - r - 0.15
    const clamped = Math.abs(pos.x) > lx || Math.abs(pos.z) > lz
    pos.x = Math.max(-lx, Math.min(lx, pos.x))
    pos.z = Math.max(-lz, Math.min(lz, pos.z))
    return hit || clamped
  }

  projectileBlocked(p) {
    const L = this.layout
    return p.y < 0 || p.y > L.H || Math.abs(p.x) > L.W / 2 || Math.abs(p.z) > L.D / 2
  }

  townAt() {
    return this.town
  }

  interactables() {
    const list = this.npcs.map(n => ({ type: "npc", pos: new THREE.Vector3(n.pos.x, n.pos.y + 1.4, n.pos.z), name: n.name, ref: n, range: 4 }))
    list.push({ type: "use", verb: "Leave", pos: this.exitPos, name: this.layout.name, range: 3, act: g => g.exitInterior() })
    for (const s of this.sacks) list.push({ type: "sack", pos: s.pos, name: "Dropped Items", ref: s, range: 3 })
    return list
  }

  update(dt) {
    const g = this.game
    for (const n of this.npcs) n.update(dt, g.ui.dialogueNpc)
  }

  dispose() {
    this.scene.clear()
  }
}
