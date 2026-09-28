// Graphics quality presets. Changing quality reloads the page so textures and
// meshes are regenerated at the new detail level.
export const PRESETS = {
  low: { name: "Low", tex: 256, tile: 128, pixelRatio: 1, shadows: false, shadowMap: 1024, terrainRes: 256, grass: 0, floraMult: 0.6, drawDist: 0.8, seg: 0.6, charShadows: false, antialias: false, post: { bloom: false, ao: false, shafts: false } },
  medium: { name: "Medium", tex: 512, tile: 256, pixelRatio: 1.5, shadows: true, shadowMap: 2048, terrainRes: 512, grass: 1, floraMult: 1, drawDist: 1, seg: 1, charShadows: true, antialias: true, post: { bloom: true, ao: false, shafts: true } },
  high: { name: "High", tex: 1024, tile: 512, pixelRatio: 2, shadows: true, shadowMap: 4096, terrainRes: 768, grass: 2, floraMult: 1.5, drawDist: 1.3, seg: 1.4, charShadows: true, antialias: true, post: { bloom: true, ao: true, shafts: true } },
}

function load() {
  try {
    return localStorage.getItem("ashfall-quality") || "medium"
  } catch {
    return "medium"
  }
}

export let qualityName = PRESETS[load()] ? load() : "medium"
export const Q = { ...PRESETS[qualityName], maxAniso: 4 }

export function setQuality(name) {
  try {
    localStorage.setItem("ashfall-quality", name)
  } catch {
    /* storage unavailable */
  }
}

// segment count helper: scales geometry tessellation with quality
export const seg = n => Math.max(3, Math.round(n * Q.seg))
