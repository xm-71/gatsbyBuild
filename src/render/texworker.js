import { P, hashName, toColorData, toNormalData } from "./painters.js"

// Generates texture buffers off the main thread.
self.onmessage = e => {
  for (const job of e.data.jobs) {
    const b = P[job.painter](job.size, hashName(job.seedName))
    const c = toColorData(b)
    const n = toNormalData(b, b.n)
    self.postMessage({ key: job.key, c, n }, [c.buffer, n.buffer])
  }
  self.postMessage({ done: true })
}
