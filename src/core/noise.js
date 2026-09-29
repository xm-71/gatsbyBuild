import { RNG } from "./rng.js"

// Classic 2D Perlin gradient noise with fractal helpers, seeded.
export function createNoise2D(seed) {
  const rng = new RNG(seed)
  const perm = new Uint8Array(512)
  const p = Array.from({ length: 256 }, (_, i) => i)
  rng.shuffle(p)
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]

  const grad = (h, x, y) => {
    switch (h & 7) {
      case 0: return x + y
      case 1: return -x + y
      case 2: return x - y
      case 3: return -x - y
      case 4: return x
      case 5: return -x
      case 6: return y
      default: return -y
    }
  }
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10)
  const lerp = (a, b, t) => a + (b - a) * t

  function noise(x, y) {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const X = xi & 255
    const Y = yi & 255
    const xf = x - xi
    const yf = y - yi
    const u = fade(xf)
    const v = fade(yf)
    const aa = perm[perm[X] + Y]
    const ab = perm[perm[X] + Y + 1]
    const ba = perm[perm[X + 1] + Y]
    const bb = perm[perm[X + 1] + Y + 1]
    return lerp(
      lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
      lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
      v
    )
  }

  function fbm(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1
    let freq = 1
    let sum = 0
    let norm = 0
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise(x * freq, y * freq)
      norm += amp
      amp *= gain
      freq *= lacunarity
    }
    return sum / norm
  }

  function ridged(x, y, octaves = 4) {
    let amp = 0.5
    let freq = 1
    let sum = 0
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(noise(x * freq, y * freq))
      sum += n * n * amp
      amp *= 0.5
      freq *= 2
    }
    return sum
  }

  return { noise, fbm, ridged }
}
