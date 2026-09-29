// Seeded pseudo-random number generation. Every procedural system in the game
// derives its own RNG stream from the run seed so worlds are reproducible.

export function hashString(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export class RNG {
  constructor(seed) {
    this.state = (typeof seed === "string" ? hashString(seed) : seed) >>> 0
    if (this.state === 0) this.state = 0x9e3779b9
  }

  // mulberry32
  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(min, max) {
    return min + (max - min) * this.next()
  }

  int(min, max) {
    return Math.floor(this.range(min, max + 1))
  }

  chance(p) {
    return this.next() < p
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)]
  }

  weighted(entries, weightOf = e => e.weight) {
    let total = 0
    for (const e of entries) total += weightOf(e)
    let r = this.next() * total
    for (const e of entries) {
      r -= weightOf(e)
      if (r <= 0) return e
    }
    return entries[entries.length - 1]
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }

  // Derive an independent child stream, e.g. rng.fork("dungeon:3").
  fork(label) {
    return new RNG((hashString(String(label)) ^ Math.floor(this.next() * 4294967296)) >>> 0)
  }
}

export function randomSeed() {
  const words = ["ash", "silt", "kwama", "netch", "guar", "scrib", "nix", "alit", "ebony", "glass", "corprus", "muck", "trama", "saltrice", "bonemold", "chitin"]
  const w = words[Math.floor(Math.random() * words.length)]
  return `${w}-${Math.floor(Math.random() * 90000 + 10000)}`
}
