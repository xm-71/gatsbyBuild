// Dungeon variety, layered onto a generated level: rooms at several heights
// joined by ramps, lava-filled or flooded low ground, pressure-plate traps,
// secret closets behind loose walls, and a vault behind a lever-worked gate.
import { FLOOR, bfsDistances } from "./dungeongen.js"

const inRoom = (r, x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h

export function addFeatures(lvl, rng, { tier, level, chestsOut, spawns = [], props = [] }) {
  const { w, h, grid, rooms, entry } = lvl
  const floor = (x, y) => x >= 0 && y >= 0 && x < w && y < h && grid[y * w + x] === FLOOR
  const cave = lvl.type === "cave" || (lvl.type === "citadel" && level % 2 === 0)

  // ---- closets and vaults, carved before heights so they get floors too ----
  const solidBlock = (x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1 || floor(x, y)) return false
    return true
  }
  // try to carve a size×size room one wall away from a room edge; returns the
  // room and the wall cell between them
  const carveBeside = size => {
    for (let t = 0; t < 60; t++) {
      const r = rng.pick(rooms.slice(1))
      const side = rng.int(0, 3)
      let dx = 0
      let dy = 0
      let px
      let py
      if (side === 0) (px = r.x + rng.int(0, r.w - 1)), (py = r.y - 1), (dy = -1)
      else if (side === 1) (px = r.x + rng.int(0, r.w - 1)), (py = r.y + r.h), (dy = 1)
      else if (side === 2) (px = r.x - 1), (py = r.y + rng.int(0, r.h - 1)), (dx = -1)
      else (px = r.x + r.w), (py = r.y + rng.int(0, r.h - 1)), (dx = 1)
      if (!floor(px - dx, py - dy) || floor(px, py)) continue
      // the new room starts one cell beyond the wall cell, centred on it
      const half = Math.floor(size / 2)
      const x0 = dx < 0 ? px - size : dx > 0 ? px + 1 : px - half
      const y0 = dy < 0 ? py - size : dy > 0 ? py + 1 : py - half
      if (!solidBlock(x0 - 1, y0 - 1, x0 + size, y0 + size)) continue
      // the wall cell's other neighbours must stay solid too
      if (floor(px + dy, py + dx) || floor(px - dy, py - dx)) continue
      const room = { x: x0, y: y0, w: size, h: size, special: true }
      for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) grid[y * w + x] = FLOOR
      grid[py * w + px] = FLOOR
      return { room, door: { x: px, y: py }, from: r }
    }
    return null
  }
  const center = r => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) })
  const secrets = []
  const nSecret = rng.chance(0.55 + tier * 0.05) ? 1 : 0
  for (let i = 0; i < nSecret; i++) {
    const c = carveBeside(3)
    if (!c) break
    secrets.push({ ...c.door, room: c.room })
    const p = center(c.room)
    chestsOut.push({ ...p, locked: false, lockLevel: 0, seed: rng.int(1, 1e9), tier: tier + 1, secret: true })
  }
  let puzzle = null
  if (!cave && rng.chance(0.4 + tier * 0.05)) {
    const c = carveBeside(4)
    if (c) {
      // three levers in other rooms; the plaque by the gate tells the setting
      const others = rooms.filter(r => r !== c.from)
      const levers = []
      for (let k = 0; k < 3; k++) {
        const r = others[(k * 3 + rng.int(0, others.length - 1)) % others.length]
        // stand the lever against a wall of the room
        const lx = r.x + rng.int(0, r.w - 1)
        const ly = r.y
        levers.push({ x: lx, y: ly, wall: floor(lx, ly - 1) ? null : "north" })
      }
      const combo = [rng.chance(0.5) ? 1 : 0, rng.chance(0.5) ? 1 : 0, 1]
      puzzle = { gate: c.door, room: c.room, levers, combo }
      const p = center(c.room)
      chestsOut.push({ x: p.x - 1, y: p.y, locked: false, lockLevel: 0, seed: rng.int(1, 1e9), tier: tier + 1, vault: true })
      chestsOut.push({ x: p.x + 1, y: p.y, locked: false, lockLevel: 0, seed: rng.int(1, 1e9), tier: tier + 1, vault: true })
    }
  }

  // ---- heights: rooms step up and down, corridors ramp between them ----
  const H = new Float32Array(w * h)
  const fixed = new Uint8Array(w * h)
  const allRooms = [...rooms, ...secrets.map(s => s.room), ...(puzzle ? [puzzle.room] : [])]
  if (!cave) {
    for (const r of rooms) {
      const lift = r === rooms[0] ? 0 : rng.weighted([{ k: 0, weight: 4 }, { k: 1.2, weight: 2 }, { k: -1.2, weight: 2 }]).k
      r.hy = lift
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (floor(x, y)) (H[y * w + x] = lift), (fixed[y * w + x] = 1)
    }
    // closets and vaults sit level with the room they open from
    for (const s of secrets) for (let y = s.room.y; y < s.room.y + s.room.h; y++) for (let x = s.room.x; x < s.room.x + s.room.w; x++) fixed[y * w + x] = 2
    // relax the corridors so they ramp smoothly
    for (let it = 0; it < 60; it++)
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const k = y * w + x
          if (!floor(x, y) || fixed[k] === 1) continue
          let s = 0
          let n = 0
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (floor(x + dx, y + dy)) (s += H[(y + dy) * w + x + dx]), n++
          if (n) H[k] = s / n
        }
  } else {
    // caves: a gentle rolling floor
    const ph = [rng.range(0, 6), rng.range(0, 6), rng.range(0, 6)]
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) H[y * w + x] = Math.sin(x * 0.31 + ph[0]) * Math.sin(y * 0.27 + ph[1]) * 0.5 + Math.sin((x + y) * 0.17 + ph[2]) * 0.3
    H[entry.y * w + entry.x] = 0
  }

  // ---- lava or flood water over the low ground ----
  let liquid = null
  const lavaTypes = ["cave", "daedric", "citadel", "dwemer"]
  const waterTypes = ["tomb", "barrow", "cave"]
  if (level >= 1 && rng.chance(0.4)) {
    const lava = lavaTypes.includes(lvl.type) && (!waterTypes.includes(lvl.type) || rng.chance(0.5))
    liquid = { kind: lava ? "lava" : "water", y: cave ? -0.25 : -0.55 }
    if (lava) {
      // keep a walkable bridge along the way from the entrance to the goal
      const goal = lvl.stairsDown || lvl.goalCell
      const dist = bfsDistances(grid, w, h, goal)
      let c = { ...entry }
      let guard = 0
      while (guard++ < w * h && !(c.x === goal.x && c.y === goal.y)) {
        const k = c.y * w + c.x
        H[k] = Math.max(H[k], liquid.y + 0.3)
        let best = null
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = c.x + dx
          const ny = c.y + dy
          if (!floor(nx, ny)) continue
          const d = dist[ny * w + nx]
          if (d >= 0 && (!best || d < best.d)) best = { x: nx, y: ny, d }
        }
        if (!best) break
        c = best
      }
      H[goal.y * w + goal.x] = Math.max(H[goal.y * w + goal.x], liquid.y + 0.3)
      // chests, creatures and props stand on little islands above the lava
      for (const c of [...chestsOut, ...spawns, ...props]) {
        const k = c.y * w + c.x
        H[k] = Math.max(H[k], liquid.y + 0.3)
      }
    }
  }

  // ---- pressure plates ----
  const traps = []
  const nTraps = Math.min(6, 1 + Math.floor(tier / 2) + level + rng.int(0, 1))
  const busy = new Set([`${entry.x},${entry.y}`, ...chestsOut.map(c => `${c.x},${c.y}`)])
  if (lvl.stairsDown) busy.add(`${lvl.stairsDown.x},${lvl.stairsDown.y}`)
  for (let t = 0; t < 200 && traps.length < nTraps; t++) {
    const x = rng.int(1, w - 2)
    const y = rng.int(1, h - 2)
    if (!floor(x, y) || busy.has(`${x},${y}`) || Math.abs(x - entry.x) + Math.abs(y - entry.y) < 4) continue
    if (liquid && H[y * w + x] < liquid.y + 0.05) continue
    if (allRooms.some(r => r.special && inRoom(r, x, y))) continue
    busy.add(`${x},${y}`)
    traps.push({ x, y, kind: rng.chance(0.55) ? "dart" : "gas", dmg: 6 + tier * 3 })
  }

  lvl.heights = H
  lvl.liquid = liquid
  lvl.traps = traps
  lvl.secrets = secrets
  lvl.puzzle = puzzle
  return lvl
}

// Corner heights: each floor corner is the average of the floor cells that
// share it, so neighbouring cells meet without seams (and ramps form).
export function cornerHeights(lvl) {
  const { w, h, grid, heights } = lvl
  const W = w + 1
  const out = new Float32Array(W * (h + 1))
  for (let y = 0; y <= h; y++)
    for (let x = 0; x <= w; x++) {
      let s = 0
      let n = 0
      for (const [cx, cy] of [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]]) {
        if (cx < 0 || cy < 0 || cx >= w || cy >= h || grid[cy * w + cx] !== FLOOR) continue
        s += heights ? heights[cy * w + cx] : 0
        n++
      }
      out[y * W + x] = n ? s / n : 0
    }
  return out
}
