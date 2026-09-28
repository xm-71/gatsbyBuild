import "./ui/style.css"
import { Game } from "./game/game.js"
import { Enemy } from "./game/actors.js"

// Let the loading text paint before the (synchronous) world generation runs.
requestAnimationFrame(() =>
  setTimeout(() => {
    window.game = new Game(document.getElementById("app"))
    window.game.debug = { Enemy } // handy from the devtools console
    document.getElementById("loading")?.remove()
  }, 30)
)
