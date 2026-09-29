// Xbox / PlayStation controllers through the Gamepad API (standard mapping).
//
//   Left stick   move            Right stick   look
//   RT           attack (hold)   LT            cast
//   A / Cross    jump · confirm  B / Circle    sneak · back
//   X / Square   activate        Y / Triangle  drink a potion
//   LB / RB      previous / next spell
//   L3           sprint (hold)   R3            character sheet
//   Start        inventory       Back / Share  map
//   D-pad        up: rest · down: journal · left/right: quick-slots 1 and 2
//
// In menus the D-pad or left stick moves a highlight between buttons, A
// presses, B closes, and LB/RB switch menu tabs.
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 }
const DEAD = 0.18

export class GamepadInput {
  constructor(game) {
    this.game = game
    this.prev = []
    this.navT = 0
    this.index = null
    window.addEventListener("gamepadconnected", e => {
      this.index = e.gamepad.index
      game.msg?.(`Controller connected: ${e.gamepad.id.split("(")[0].trim()}`, "#c9b88f")
    })
    window.addEventListener("gamepaddisconnected", () => {
      this.index = null
      game.input.padActive = false
    })
  }

  pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []
    if (this.index != null && pads[this.index]) return pads[this.index]
    for (const p of pads) if (p && p.connected) return (this.index = p.index), p
    return null
  }

  poll(dt) {
    const p = this.pad()
    const input = this.game.input
    if (!p) return
    const down = i => !!p.buttons[i]?.pressed
    const hit = i => down(i) && !this.prev[i]
    const dz = v => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD))
    const lx = dz(p.axes[0] || 0)
    const ly = dz(p.axes[1] || 0)
    const rx = dz(p.axes[2] || 0)
    const ry = dz(p.axes[3] || 0)
    const any = p.buttons.some(b => b.pressed) || Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0
    if (any) {
      input.padActive = true
      this.game.audio?.ensure()
    }
    const ui = this.game.ui
    const inMenu = !!ui.modal || this.game.mode !== "play"
    if (inMenu) this.navigate(p, hit, lx, ly, dt)
    else if (input.padActive) {
      // gameplay
      input.axis.x = lx
      input.axis.y = -ly
      const look = 900 * dt * this.game.input.sensitivity / 0.0022
      input.mouseDX += rx * Math.abs(rx) * look
      input.mouseDY += ry * Math.abs(ry) * look
      if (hit(B.RT)) (input.mouseDown = true), (input.mouseClicked = true)
      if (!down(B.RT) && this.prev[B.RT]) input.mouseDown = false
      if (hit(B.LT)) input.press("cast")
      if (hit(B.A)) input.press("jump")
      input.vHeld[down(B.A) ? "add" : "delete"]("jump")
      if (hit(B.B)) input.press("sneak")
      if (hit(B.X)) input.press("activate")
      if (hit(B.Y)) input.press("quaff")
      if (hit(B.LB)) input.wheel -= 1
      if (hit(B.RB)) input.wheel += 1
      input.vHeld[down(B.L3) ? "add" : "delete"]("sprint")
      if (hit(B.R3)) input.press("character")
      if (hit(B.START)) input.press("inventory")
      if (hit(B.BACK)) input.press("map")
      if (hit(B.UP)) input.press("rest")
      if (hit(B.DOWN)) input.press("journal")
      if (hit(B.LEFT)) input.vPressed.add("slot1")
      if (hit(B.RIGHT)) input.vPressed.add("slot2")
    }
    this.prev = p.buttons.map(b => b.pressed)
  }

  // Move a highlight between the visible buttons and press them.
  navigate(p, hit, lx, ly, dt) {
    const input = this.game.input
    input.axis.x = input.axis.y = 0
    input.mouseDown = false
    this.navT -= dt
    let dir = null
    if (hit(B.UP)) dir = [0, -1]
    else if (hit(B.DOWN)) dir = [0, 1]
    else if (hit(B.LEFT)) dir = [-1, 0]
    else if (hit(B.RIGHT)) dir = [1, 0]
    else if (this.navT <= 0 && Math.abs(lx) + Math.abs(ly) > 0.6) dir = Math.abs(lx) > Math.abs(ly) ? [Math.sign(lx), 0] : [0, Math.sign(ly)]
    if (dir) {
      this.navT = 0.22
      this.move(dir)
    }
    const cur = this.current()
    if (hit(B.A) && cur) cur.click()
    if (hit(B.B)) {
      const ui = this.game.ui
      if (ui.modal) ui.closeModal()
      else document.querySelector(".screen:not(.hidden) [data-act='back'], .screen:not(.hidden) .back")?.click()
    }
    if (hit(B.LB) || hit(B.RB)) {
      const tabs = [...document.querySelectorAll(".tabs .tab")]
      const i = tabs.findIndex(t => t.classList.contains("sel"))
      if (tabs.length) tabs[(i + (hit(B.RB) ? 1 : tabs.length - 1)) % tabs.length].click()
    }
  }

  targets() {
    const root = document.querySelector(".modal-layer:not(.hidden)") || document.querySelector(".screen:not(.hidden)") || document.body
    return [...root.querySelectorAll("button, [data-act], .item, input[type=range], input[type=checkbox]")].filter(el => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && !el.disabled
    })
  }

  current() {
    const el = document.querySelector(".pad-focus")
    return el && el.isConnected && this.targets().includes(el) ? el : null
  }

  move([dx, dy]) {
    const list = this.targets()
    if (!list.length) return
    let cur = this.current()
    if (!cur) return this.focus(list[0])
    const a = cur.getBoundingClientRect()
    const ax = a.left + a.width / 2
    const ay = a.top + a.height / 2
    let best = null
    for (const el of list) {
      if (el === cur) continue
      const b = el.getBoundingClientRect()
      const vx = b.left + b.width / 2 - ax
      const vy = b.top + b.height / 2 - ay
      const along = vx * dx + vy * dy
      if (along <= 4) continue
      const across = Math.abs(vx * dy - vy * dx)
      const score = along + across * 2.5
      if (!best || score < best.score) best = { el, score }
    }
    if (best) this.focus(best.el)
  }

  focus(el) {
    document.querySelectorAll(".pad-focus").forEach(e => e.classList.remove("pad-focus"))
    el.classList.add("pad-focus")
    el.scrollIntoView?.({ block: "nearest" })
  }
}
