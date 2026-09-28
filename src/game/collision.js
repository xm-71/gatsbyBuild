// Static obstacle collision for the overworld: circles (trees, rocks) and
// oriented boxes (buildings), bucketed in a spatial hash.
export class Colliders {
  constructor(cellSize = 16) {
    this.cell = cellSize
    this.buckets = new Map()
  }

  key(i, j) {
    return i * 73856093 ^ j * 19349663
  }

  insert(shape, x, z, r) {
    const c = this.cell
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++)
      for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) {
        const k = this.key(i, j)
        let b = this.buckets.get(k)
        if (!b) this.buckets.set(k, (b = []))
        b.push(shape)
      }
  }

  addCircle(x, z, r, top = Infinity) {
    this.insert({ kind: "circle", x, z, r, top }, x, z, r)
  }

  addBox(x, z, w, d, rot, top = Infinity) {
    this.insert({ kind: "box", x, z, hw: w / 2, hd: d / 2, cos: Math.cos(rot), sin: Math.sin(rot), top }, x, z, Math.hypot(w, d) / 2)
  }

  // Push a circle at pos (x,z) with radius r out of any obstacles. Mutates pos.
  resolve(pos, r, feetY = -Infinity) {
    const c = this.cell
    const b = this.buckets.get(this.key(Math.floor(pos.x / c), Math.floor(pos.z / c)))
    if (!b) return false
    let hit = false
    for (const s of b) {
      if (feetY > s.top) continue
      if (s.kind === "circle") {
        const dx = pos.x - s.x
        const dz = pos.z - s.z
        const d = Math.hypot(dx, dz)
        const min = s.r + r
        if (d < min && d > 1e-6) {
          pos.x = s.x + (dx / d) * min
          pos.z = s.z + (dz / d) * min
          hit = true
        }
      } else {
        // into box local space
        const dx = pos.x - s.x
        const dz = pos.z - s.z
        const lx = dx * s.cos - dz * s.sin
        const lz = dx * s.sin + dz * s.cos
        const cx = Math.max(-s.hw, Math.min(s.hw, lx))
        const cz = Math.max(-s.hd, Math.min(s.hd, lz))
        let ox = lx - cx
        let oz = lz - cz
        const d = Math.hypot(ox, oz)
        let nlx = lx
        let nlz = lz
        if (d < r) {
          if (d > 1e-6) {
            nlx = cx + (ox / d) * r
            nlz = cz + (oz / d) * r
          } else {
            // centre inside the box: push out along the shallowest axis
            const px = s.hw - Math.abs(lx)
            const pz = s.hd - Math.abs(lz)
            if (px < pz) nlx = Math.sign(lx || 1) * (s.hw + r)
            else nlz = Math.sign(lz || 1) * (s.hd + r)
          }
          pos.x = s.x + nlx * s.cos + nlz * s.sin
          pos.z = s.z - nlx * s.sin + nlz * s.cos
          hit = true
        }
      }
    }
    return hit
  }
}
