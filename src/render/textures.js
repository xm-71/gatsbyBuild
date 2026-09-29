import * as THREE from "three"
import { createNoise2D } from "../core/noise.js"

const cache = {}

// Tileable-ish grayscale detail texture, multiplied over vertex colours.
export function detailTexture(kind = "ground") {
  if (cache[kind]) return cache[kind]
  const size = 256
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = size
  const ctx = canvas.getContext("2d")
  const img = ctx.createImageData(size, size)
  const noise = createNoise2D(`tex:${kind}`)
  const period = size
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // blend 4 samples to make it wrap seamlessly
      const fx = x / period
      const fy = y / period
      const s = f => {
        const sc = kind === "stone" ? 6 : kind === "flesh" ? 5 : 10
        const n = (a, b) => noise.fbm(a * sc, b * sc, 4)
        return n(fx, fy) * (1 - fx) * (1 - fy) + n(fx - 1, fy) * fx * (1 - fy) + n(fx, fy - 1) * (1 - fx) * fy + n(fx - 1, fy - 1) * fx * fy
      }
      let v = s()
      if (kind === "stone") {
        // brick-ish lines
        const row = Math.floor(y / 32)
        const bx = (x + (row % 2) * 32) % 64
        if (y % 32 < 2 || bx < 2) v -= 0.5
      }
      if (kind === "metal") {
        if (y % 64 < 2 || x % 64 < 2) v -= 0.35
        if ((x % 64 === 6 || x % 64 === 58) && (y % 64 === 6 || y % 64 === 58)) v += 0.6
      }
      const g = Math.max(0, Math.min(255, 215 + v * 70 + (Math.random() - 0.5) * 18))
      const i = (y * size + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = g
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  cache[kind] = tex
  return tex
}

export function makeLabel(text, { color = "#e8d8a8", size = 28, bg = "rgba(20,14,8,0.72)", scale = 0.012 } = {}) {
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  ctx.font = `${size}px Georgia, serif`
  const w = Math.ceil(ctx.measureText(text).width) + 24
  const h = size + 16
  canvas.width = w
  canvas.height = h
  ctx.font = `${size}px Georgia, serif`
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = "#8a6a2a"
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, w - 2, h - 2)
  ctx.fillStyle = color
  ctx.textBaseline = "middle"
  ctx.fillText(text, 12, h / 2 + 1)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: true })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(w * scale, h * scale, 1)
  return sprite
}

export function srgbColor(r, g, b) {
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace)
}
