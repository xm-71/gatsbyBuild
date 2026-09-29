// Roads between towns, their signposts, and harbours for boats. Pure data:
// runs in the world-generation worker.

// A* over a coarse grid; steep ground costs more, water and lava are closed.
function findPath(from, to, { heightAt, lavaAt, rm, half, cell = 11 }) {
  const n = Math.floor((half * 2) / cell)
  const idx = (i, j) => j * n + i
  const toCell = (x, z) => [Math.max(0, Math.min(n - 1, Math.floor((x + half) / cell))), Math.max(0, Math.min(n - 1, Math.floor((z + half) / cell)))]
  const center = (i, j) => [-half + (i + 0.5) * cell, -half + (j + 0.5) * cell]
  const [si, sj] = toCell(from.x, from.z)
  const [ti, tj] = toCell(to.x, to.z)
  const g = new Float32Array(n * n).fill(Infinity)
  const came = new Int32Array(n * n).fill(-1)
  const closed = new Uint8Array(n * n)
  // binary heap of [f, index]
  const heap = []
  const push = (f, k) => {
    heap.push([f, k])
    let c = heap.length - 1
    while (c > 0) {
      const p = (c - 1) >> 1
      if (heap[p][0] <= heap[c][0]) break
      ;[heap[p], heap[c]] = [heap[c], heap[p]]
      c = p
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()
    if (heap.length) {
      heap[0] = last
      let c = 0
      for (;;) {
        const l = c * 2 + 1
        const r = l + 1
        let m = c
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === c) break
        ;[heap[m], heap[c]] = [heap[c], heap[m]]
        c = m
      }
    }
    return top
  }
  const heightCache = new Float32Array(n * n).fill(NaN)
  const hAt = (i, j) => {
    const k = idx(i, j)
    if (Number.isNaN(heightCache[k])) {
      const [x, z] = center(i, j)
      heightCache[k] = lavaAt(x, z) ? -99 : heightAt(x, z)
    }
    return heightCache[k]
  }
  const hx = (ti - si) ** 2 + (tj - sj) ** 2
  g[idx(si, sj)] = 0
  push(Math.sqrt(hx) * cell, idx(si, sj))
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
  let found = false
  let guard = 0
  while (heap.length && guard++ < n * n * 4) {
    const [, k] = pop()
    if (closed[k]) continue
    closed[k] = 1
    const i = k % n
    const j = Math.floor(k / n)
    if (i === ti && j === tj) {
      found = true
      break
    }
    const h0 = hAt(i, j)
    for (const [di, dj] of dirs) {
      const ni = i + di
      const nj = j + dj
      if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue
      const nk = idx(ni, nj)
      if (closed[nk]) continue
      const h1 = hAt(ni, nj)
      if (h1 < 0.8) continue // sea and lava
      const step = Math.hypot(di, dj) * cell
      const slope = Math.abs(h1 - h0) / step
      const [x, z] = center(ni, nj)
      const nearMountain = Math.max(0, 1 - Math.hypot(x - rm.x, z - rm.z) / 170)
      const cost = step * (1 + slope * 14 + slope * slope * 40 + nearMountain * 6)
      const ng = g[k] + cost
      if (ng < g[nk]) {
        g[nk] = ng
        came[nk] = k
        push(ng + Math.hypot(ti - ni, tj - nj) * cell, nk)
      }
    }
  }
  if (!found) return null
  const pts = []
  for (let k = idx(ti, tj); k !== -1; k = came[k]) pts.push(center(k % n, Math.floor(k / n)))
  pts.reverse()
  pts[0] = [from.x, from.z]
  pts[pts.length - 1] = [to.x, to.z]
  return smooth(smooth(pts))
}

// Chaikin corner cutting: two passes turn grid steps into gentle curves.
function smooth(pts) {
  if (pts.length < 3) return pts
  const out = [pts[0]]
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75])
  }
  out.push(pts[pts.length - 1])
  return out
}

// Connect towns with a minimum spanning tree plus a couple of loops.
export function planRoads(towns, env) {
  const list = towns.filter(t => !t.isle)
  const edges = []
  for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) edges.push([Math.hypot(list[a].x - list[b].x, list[a].z - list[b].z), a, b])
  edges.sort((p, q) => p[0] - q[0])
  const parent = list.map((_, i) => i)
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const chosen = []
  const extra = []
  for (const e of edges) {
    const ra = find(e[1])
    const rb = find(e[2])
    if (ra !== rb) {
      parent[ra] = rb
      chosen.push(e)
    } else if (extra.length < 2 && e[0] < 520) extra.push(e)
  }
  const roads = []
  for (const [, a, b] of [...chosen, ...extra]) {
    const pts = findPath(list[a], list[b], env)
    if (pts) roads.push({ a: list[a].id, b: list[b].id, pts })
  }
  return roads
}

// A signpost where each road leaves a town, pointing at the far end.
export function planSignposts(roads, towns) {
  const posts = []
  const byId = new Map(towns.map(t => [t.id, t]))
  for (const r of roads) {
    for (const [end, other] of [[r.a, r.b], [r.b, r.a]]) {
      const t = byId.get(end)
      const pts = end === r.a ? r.pts : [...r.pts].reverse()
      // first point beyond the town's edge
      let k = pts.findIndex(([x, z]) => Math.hypot(x - t.x, z - t.z) > t.radius + 7)
      if (k < 1) continue
      const [x, z] = pts[k]
      const [nx, nz] = pts[Math.min(pts.length - 1, k + 2)]
      const [px, pz] = pts[k - 1]
      const dist = Math.round(pathLength(pts.slice(k)))
      posts.push({ x: x + (nz - pz) * 0.12, z: z - (nx - px) * 0.12, town: t.id, signs: [{ to: other, angle: Math.atan2(nx - x, nz - z), dist }, { to: end, angle: Math.atan2(t.x - x, t.z - z), dist: 0 }] })
    }
  }
  return posts
}

function pathLength(pts) {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return s
}

// A harbour: walk out from town toward the sea and stop at the shore.
export function planDock(town, heightAt, maxDist = 110) {
  let best = null
  for (let a = 0; a < 32; a++) {
    const ang = (a / 32) * Math.PI * 2
    const dx = Math.cos(ang)
    const dz = Math.sin(ang)
    for (let d = town.radius; d < maxDist; d += 2) {
      if (heightAt(town.x + dx * d, town.z + dz * d) < -1.5) {
        if (!best || d < best.d) best = { d, ang }
        break
      }
    }
  }
  if (!best) return null
  // the dock's land end: last dry point before the water
  let d = best.d
  while (d > town.radius && heightAt(town.x + Math.cos(best.ang) * d, town.z + Math.sin(best.ang) * d) < 0.6) d -= 1
  return { x: town.x + Math.cos(best.ang) * d, z: town.z + Math.sin(best.ang) * d, angle: best.ang, length: best.d - d + 8 }
}

// Distance-to-road lookup, bucketed so terrain can ask for every vertex.
export function roadIndex(roads, cell = 24) {
  const buckets = new Map()
  const key = (i, j) => i * 100003 + j
  for (const r of roads)
    for (let s = 0; s < r.pts.length - 1; s++) {
      const [ax, az] = r.pts[s]
      const [bx, bz] = r.pts[s + 1]
      const i0 = Math.floor((Math.min(ax, bx) - 4) / cell)
      const i1 = Math.floor((Math.max(ax, bx) + 4) / cell)
      const j0 = Math.floor((Math.min(az, bz) - 4) / cell)
      const j1 = Math.floor((Math.max(az, bz) + 4) / cell)
      for (let i = i0; i <= i1; i++)
        for (let j = j0; j <= j1; j++) {
          const k = key(i, j)
          if (!buckets.has(k)) buckets.set(k, [])
          buckets.get(k).push([ax, az, bx, bz])
        }
    }
  // 1 on the road's centre line, fading to 0 about 3 m out
  return (x, z) => {
    const segs = buckets.get(key(Math.floor(x / cell), Math.floor(z / cell)))
    if (!segs) return 0
    let best = Infinity
    for (const [ax, az, bx, bz] of segs) {
      const vx = bx - ax
      const vz = bz - az
      const l2 = vx * vx + vz * vz || 1
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2))
      const d = Math.hypot(x - ax - vx * t, z - az - vz * t)
      if (d < best) best = d
    }
    return best >= 3.4 ? 0 : best <= 1.5 ? 1 : 1 - (best - 1.5) / 1.9
  }
}
