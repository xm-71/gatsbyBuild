import { RNG } from "../core/rng.js"
import { creaturesFor } from "../data/creatures.js"

export const CELL = 4
export const WALL = 0
export const FLOOR = 1

export const DUNGEON_THEMES = {
  cave: { name: "Cave", habitat: "cave", lootTag: "cave" },
  tomb: { name: "Ancestral Tomb", habitat: "tomb", lootTag: "tomb" },
  dwemer: { name: "Dwemer Ruin", habitat: "dwemer", lootTag: "dwemer" },
  daedric: { name: "Daedric Shrine", habitat: "daedric", lootTag: "daedric" },
  citadel: { name: "Citadel", habitat: "citadel", lootTag: "citadel" },
}

function carveRoom(grid, w, r) {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) grid[y * w + x] = FLOOR
}

function carveCorridor(grid, w, a, b, width, rng) {
  let { x, y } = a
  const horizontalFirst = rng.chance(0.5)
  const stepX = () => {
    while (x !== b.x) {
      for (let k = 0; k < width; k++) grid[(y + k) * w + x] = FLOOR
      x += Math.sign(b.x - x)
    }
  }
  const stepY = () => {
    while (y !== b.y) {
      for (let k = 0; k < width; k++) grid[y * w + x + k] = FLOOR
      y += Math.sign(b.y - y)
    }
  }
  if (horizontalFirst) {
    stepX()
    stepY()
  } else {
    stepY()
    stepX()
  }
  for (let k = 0; k < width; k++) for (let j = 0; j < width; j++) grid[(y + j) * w + x + k] = FLOOR
}

function roomsAndCorridors(rng, w, h, opts) {
  const grid = new Uint8Array(w * h)
  const rooms = []
  const target = rng.int(opts.minRooms, opts.maxRooms)
  for (let t = 0; t < 400 && rooms.length < target; t++) {
    const rw = rng.int(opts.minSize, opts.maxSize)
    const rh = rng.int(opts.minSize, opts.maxSize)
    const r = { x: rng.int(1, w - rw - 2), y: rng.int(1, h - rh - 2), w: rw, h: rh }
    if (rooms.some(o => r.x < o.x + o.w + 2 && r.x + r.w + 2 > o.x && r.y < o.y + o.h + 2 && r.y + r.h + 2 > o.y)) continue
    rooms.push(r)
  }
  for (const r of rooms) carveRoom(grid, w, r)
  // connect rooms in a chain sorted by position plus a few loops
  const centers = rooms.map(r => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) }))
  const order = centers.map((c, i) => i).sort((a, b) => centers[a].x + centers[a].y * 0.5 - (centers[b].x + centers[b].y * 0.5))
  for (let i = 1; i < order.length; i++) carveCorridor(grid, w, centers[order[i - 1]], centers[order[i]], opts.corridor, rng)
  for (let i = 0; i < Math.floor(rooms.length / 3); i++) carveCorridor(grid, w, rng.pick(centers), rng.pick(centers), opts.corridor, rng)
  return { grid, rooms }
}

function cellularCave(rng, w, h, fill = 0.46, steps = 5) {
  let grid = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) grid[y * w + x] = rng.chance(fill) ? WALL : FLOOR
  for (let s = 0; s < steps; s++) {
    const next = new Uint8Array(w * h)
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        let walls = 0
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (grid[(y + dy) * w + x + dx] === WALL) walls++
        next[y * w + x] = walls >= 5 ? WALL : FLOOR
      }
    grid = next
  }
  // keep only the largest connected region
  const label = new Int32Array(w * h).fill(-1)
  let best = -1
  let bestSize = 0
  let id = 0
  for (let i = 0; i < w * h; i++) {
    if (grid[i] !== FLOOR || label[i] !== -1) continue
    const stack = [i]
    label[i] = id
    let size = 0
    while (stack.length) {
      const c = stack.pop()
      size++
      const cx = c % w
      const cy = (c / w) | 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx
        const ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const n = ny * w + nx
        if (grid[n] === FLOOR && label[n] === -1) {
          label[n] = id
          stack.push(n)
        }
      }
    }
    if (size > bestSize) {
      bestSize = size
      best = id
    }
    id++
  }
  for (let i = 0; i < w * h; i++) if (grid[i] === FLOOR && label[i] !== best) grid[i] = WALL
  // pseudo-rooms: sample open spots spread across the cave
  const rooms = []
  for (let t = 0; t < 600 && rooms.length < 12; t++) {
    const x = rng.int(2, w - 3)
    const y = rng.int(2, h - 3)
    if (grid[y * w + x] !== FLOOR) continue
    if (rooms.some(r => Math.hypot(r.x - x, r.y - y) < 7)) continue
    rooms.push({ x: x - 1, y: y - 1, w: 3, h: 3 })
  }
  return { grid, rooms }
}

export function bfsDistances(grid, w, h, start) {
  const dist = new Int32Array(w * h).fill(-1)
  const q = [start.y * w + start.x]
  dist[q[0]] = 0
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi]
    const cx = c % w
    const cy = (c / w) | 0
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = (cy + dy) * w + cx + dx
      if (grid[n] === FLOOR && dist[n] === -1) {
        dist[n] = dist[c] + 1
        q.push(n)
      }
    }
  }
  return dist
}

function roomCenter(r) {
  return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) }
}

function randomFloorIn(rng, grid, w, r) {
  for (let t = 0; t < 30; t++) {
    const x = rng.int(r.x, r.x + r.w - 1)
    const y = rng.int(r.y, r.y + r.h - 1)
    if (grid[y * w + x] === FLOOR) return { x, y }
  }
  return roomCenter(r)
}

const PROPS = {
  cave: ["crate", "barrel", "stalagmite", "bones", "sack"],
  tomb: ["urn", "urn", "bones", "candles", "coffin"],
  dwemer: ["pipe", "gear", "pipe", "crate", "lamp"],
  daedric: ["statue", "brazier", "bones", "altar"],
  citadel: ["fleshpillar", "brazier", "bones", "altar"],
}

export function generateDungeonLevel({ seed, type, tier, level, levels, bossLevel = true, relic = null, citadel = false }) {
  const rng = new RNG(`dungeon:${seed}:${level}`)
  let w, h, grid, rooms
  if (type === "cave" || (type === "citadel" && level % 2 === 0)) {
    w = h = 44
    ;({ grid, rooms } = cellularCave(rng, w, h, type === "citadel" ? 0.44 : 0.47))
  } else {
    w = h = 42
    const opts = {
      tomb: { minRooms: 7, maxRooms: 11, minSize: 3, maxSize: 6, corridor: 1 },
      dwemer: { minRooms: 6, maxRooms: 9, minSize: 5, maxSize: 9, corridor: 2 },
      daedric: { minRooms: 5, maxRooms: 8, minSize: 5, maxSize: 10, corridor: 2 },
      citadel: { minRooms: 6, maxRooms: 9, minSize: 5, maxSize: 10, corridor: 2 },
    }[type]
    ;({ grid, rooms } = roomsAndCorridors(rng, w, h, opts))
  }
  if (rooms.length < 2) {
    // extremely unlikely; guarantee a playable layout
    rooms = [{ x: 4, y: 4, w: 6, h: 6 }, { x: 20, y: 20, w: 6, h: 6 }]
    grid = new Uint8Array(w * h)
    rooms.forEach(r => carveRoom(grid, w, r))
    carveCorridor(grid, w, roomCenter(rooms[0]), roomCenter(rooms[1]), 2, rng)
  }

  const entryRoom = rooms[0]
  const entry = randomFloorIn(rng, grid, w, entryRoom)
  const dist = bfsDistances(grid, w, h, entry)
  // farthest room gets the stairs down / boss
  let far = rooms[1]
  let farD = -1
  for (const r of rooms.slice(1)) {
    const c = randomFloorIn(rng, grid, w, r)
    const d = dist[c.y * w + c.x]
    if (d > farD) {
      farD = d
      far = r
    }
  }
  const isBottom = level === levels - 1
  const goal = randomFloorIn(rng, grid, w, far)

  const theme = DUNGEON_THEMES[type]
  const maxLevel = tier * 2 + 1 + level
  const pool = creaturesFor(theme.habitat, maxLevel)
  const spawns = []
  const density = 0.9 + tier * 0.15 + level * 0.2
  for (const r of rooms) {
    if (r === entryRoom) continue
    const count = Math.max(0, Math.round(rng.range(0.3, 1.4) * density))
    for (let i = 0; i < count; i++) {
      const p = randomFloorIn(rng, grid, w, r)
      const creature = rng.weighted(pool, c => 1 + c.level)
      spawns.push({ ...p, creature: creature.id })
    }
  }
  if (isBottom && bossLevel) {
    const strongest = [...pool].sort((a, b) => b.level - a.level)[0]
    spawns.push({ ...goal, creature: citadel ? "dagoth" : strongest.id, boss: true, relic })
  }

  const chests = []
  const chestCount = rng.int(2, 3 + Math.floor(tier / 2))
  for (let i = 0; i < chestCount; i++) {
    const r = rng.pick(rooms)
    const p = randomFloorIn(rng, grid, w, r)
    if (p.x === entry.x && p.y === entry.y) continue
    const locked = rng.chance(0.35 + tier * 0.06)
    chests.push({ ...p, locked, lockLevel: locked ? Math.min(100, tier * 12 + rng.int(0, 20)) : 0, seed: rng.int(1, 1e9), tier: tier + (isBottom ? 1 : 0) })
  }

  const props = []
  const propTypes = PROPS[type]
  for (const r of rooms) {
    const n = rng.int(1, 4)
    for (let i = 0; i < n; i++) {
      const p = randomFloorIn(rng, grid, w, r)
      props.push({ ...p, type: rng.pick(propTypes), rot: rng.range(0, Math.PI * 2), ox: rng.range(-1.2, 1.2), oz: rng.range(-1.2, 1.2) })
    }
  }
  const lights = rooms.filter(() => rng.chance(0.7)).map(r => roomCenter(r))

  return {
    w,
    h,
    grid,
    rooms,
    entry,
    stairsDown: isBottom ? null : goal,
    isBottom,
    spawns,
    chests,
    props,
    lights,
    type,
    level,
  }
}

export function isFloor(lvl, gx, gy) {
  if (gx < 0 || gy < 0 || gx >= lvl.w || gy >= lvl.h) return false
  return lvl.grid[gy * lvl.w + gx] === FLOOR
}
