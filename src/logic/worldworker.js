import { generateWorld, worldData } from "./worldgen.js"
import { computeTerrainChunks } from "./terrainData.js"

// Generates the island and its terrain mesh data off the main thread.
self.onmessage = e => {
  const { seed, terrainRes } = e.data
  const world = generateWorld(seed)
  self.postMessage({ stage: "terrain" })
  const chunks = computeTerrainChunks(world, terrainRes)
  const data = worldData(world)
  const transfer = [data.heights.buffer, data.flatMask.buffer, data.regions.buffer]
  for (const c of chunks) transfer.push(c.pos.buffer, c.nor.buffer, c.uv.buffer, c.col.buffer, c.sA.buffer, c.sB.buffer, c.idx.buffer)
  self.postMessage({ data, chunks }, transfer)
}
