import "./ui/style.css"
import { Game } from "./game/game.js"
import { Enemy } from "./game/actors.js"
import { preloadTextures } from "./render/texgen.js"
import { Q } from "./core/quality.js"

const loading = document.getElementById("loading")
const say = text => loading && (loading.textContent = text)

// Paint textures in parallel workers, then build the world.
say(`Painting textures (${Q.name} quality)…`)
preloadTextures(p => say(`Painting textures (${Q.name} quality)… ${Math.round(p * 100)}%`)).then(() => {
  say("Raising Vvardenfell from the sea…")
  requestAnimationFrame(() =>
    setTimeout(() => {
      window.game = new Game(document.getElementById("app"))
      window.game.debug = { Enemy } // handy from the devtools console
      loading?.remove()
    }, 30)
  )
})
