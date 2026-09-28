import { generateWorld, hydrateWorld } from "../logic/worldgen.js"
import { computeTerrainChunks } from "../logic/terrainData.js"
import { Q } from "../core/quality.js"

// Generate a world in a worker; falls back to the main thread if workers fail.
export function loadWorld(seed, onStage = () => {}) {
  return new Promise(resolve => {
    const fallback = () => {
      const world = generateWorld(seed)
      resolve({ world, chunks: computeTerrainChunks(world, Q.terrainRes) })
    }
    let worker
    try {
      worker = new Worker(new URL("../logic/worldworker.js", import.meta.url), { type: "module" })
    } catch {
      return fallback()
    }
    worker.onerror = () => {
      worker.terminate()
      fallback()
    }
    worker.onmessage = e => {
      if (e.data.stage) return onStage(e.data.stage)
      worker.terminate()
      resolve({ world: hydrateWorld(e.data.data), chunks: e.data.chunks })
    }
    worker.postMessage({ seed, terrainRes: Q.terrainRes })
  })
}
