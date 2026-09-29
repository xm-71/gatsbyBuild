import { defineConfig } from "vite"
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

// Write the list of built files into the service worker, so the whole game
// is cached for offline play on the first visit.
function precacheList() {
  let outDir
  return {
    name: "ashfall-precache",
    apply: "build",
    configResolved(c) {
      outDir = c.build.outDir
    },
    closeBundle() {
      const files = []
      const walk = d => {
        for (const f of readdirSync(d)) {
          const p = join(d, f)
          if (statSync(p).isDirectory()) walk(p)
          else if (f !== "sw.js") files.push(relative(outDir, p).split("\\").join("/"))
        }
      }
      walk(outDir)
      const sw = join(outDir, "sw.js")
      const version = files.filter(f => f.startsWith("assets/")).sort().join("|")
      let hash = 0
      for (let i = 0; i < version.length; i++) hash = (hash * 31 + version.charCodeAt(i)) | 0
      writeFileSync(
        sw,
        readFileSync(sw, "utf8")
          .replace("const PRECACHE = []", `const PRECACHE = ${JSON.stringify(["./", ...files.filter(f => f !== "index.html")])}`)
          .replace('const CACHE = "ashfall-dev"', `const CACHE = "ashfall-${(hash >>> 0).toString(36)}"`),
      )
    },
  }
}

export default defineConfig({
  base: "./",
  build: { chunkSizeWarningLimit: 1200 },
  plugins: [precacheList()],
})
