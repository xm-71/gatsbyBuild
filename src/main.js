import "./ui/style.css"
import { Game } from "./game/game.js"
import { Enemy } from "./game/actors.js"
import { preloadTextures } from "./render/texgen.js"
import { Q } from "./core/quality.js"
import { randomSeed } from "./core/rng.js"
import { showLoading, hideLoading } from "./ui/loading.js"

async function start() {
  // Stage 1 (0–45%): paint textures in parallel workers.
  showLoading(`Painting textures (${Q.name} quality)…`, 0)
  await preloadTextures(p => showLoading(`Painting textures (${Q.name} quality)…`, p * 0.45))
  const game = new Game(document.getElementById("app"))
  game.debug = { Enemy } // handy from the devtools console
  window.game = game
  let seed = randomSeed()
  try {
    seed = sessionStorage.getItem("ashfall-seed") || seed
    sessionStorage.removeItem("ashfall-seed")
  } catch {
    /* storage unavailable */
  }
  // Stage 2 (45–100%): generate the island in a worker and build it step by step.
  await game.prepareWorld(seed, (p, text) => showLoading(text, 0.45 + p * 0.55))
  hideLoading()
  game.ui.showTitle()
}

start()

// Offline play: cache the game once it has loaded (production builds only,
// so the dev server always serves fresh code).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}))
}
