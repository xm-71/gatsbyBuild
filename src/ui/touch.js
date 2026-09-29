// Touch controls for phones and tablets, landscape only: a movement stick on
// the left, drag anywhere on the right to look, and buttons for fighting,
// casting, jumping and using things. Menus work by tapping as they are.
export class TouchControls {
  constructor(game) {
    this.game = game
    this.enabled = false
    this.stick = null // { id, ox, oy }
    this.look = null // { id, x, y }
    const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches
    if (coarse || navigator.maxTouchPoints > 0) this.enable()
    // a first touch anywhere turns them on (e.g. a laptop with a touch screen)
    window.addEventListener("touchstart", () => this.enabled || this.enable(), { once: true, passive: true })
  }

  enable() {
    if (this.enabled) return
    this.enabled = true
    document.body.classList.add("touch")
    const root = (this.root = document.createElement("div"))
    root.className = "touch-ui hidden"
    root.innerHTML = `
      <div class="t-zone t-move"><div class="t-base"><div class="t-knob"></div></div></div>
      <div class="t-zone t-look"></div>
      <div class="t-buttons">
        <button class="t-btn t-attack" data-t="attack">⚔</button>
        <button class="t-btn t-cast" data-t="cast">✦</button>
        <button class="t-btn t-jump" data-t="jump">⤒</button>
        <button class="t-btn t-use" data-t="activate">E</button>
        <button class="t-btn t-sneak" data-t="sneak">◉</button>
        <button class="t-btn t-potion" data-t="quaff">⚗</button>
        <button class="t-btn t-sprint" data-t="sprint">»</button>
      </div>
      <div class="t-top">
        <button class="t-small" data-t="inventory">Menu</button>
        <button class="t-small" data-t="map">Map</button>
        <button class="t-small" data-t="rest">Rest</button>
      </div>`
    const rotate = (this.rotate = document.createElement("div"))
    rotate.className = "t-rotate hidden"
    rotate.innerHTML = `<div><div class="t-phone">📱</div><p>Turn your phone sideways to play.</p></div>`
    document.body.append(root, rotate)
    this.base = root.querySelector(".t-base")
    this.knob = root.querySelector(".t-knob")
    const input = this.game.input
    const opt = { passive: false }
    // movement stick: appears where your thumb lands
    const move = root.querySelector(".t-move")
    move.addEventListener("touchstart", e => {
      e.preventDefault()
      const t = e.changedTouches[0]
      this.stick = { id: t.identifier, ox: t.clientX, oy: t.clientY }
      this.base.style.left = `${t.clientX}px`
      this.base.style.top = `${t.clientY}px`
      this.base.classList.add("on")
    }, opt)
    // look: drag on the right side of the screen
    const look = root.querySelector(".t-look")
    look.addEventListener("touchstart", e => {
      e.preventDefault()
      const t = e.changedTouches[0]
      this.look = { id: t.identifier, x: t.clientX, y: t.clientY }
    }, opt)
    window.addEventListener("touchmove", e => {
      for (const t of e.changedTouches) {
        if (this.stick && t.identifier === this.stick.id) {
          const R = 56
          let dx = t.clientX - this.stick.ox
          let dy = t.clientY - this.stick.oy
          const l = Math.hypot(dx, dy)
          if (l > R) (dx *= R / l), (dy *= R / l)
          this.knob.style.transform = `translate(${dx}px, ${dy}px)`
          input.axis.x = dx / R
          input.axis.y = -dy / R
          if (this.stick) e.preventDefault()
        } else if (this.look && t.identifier === this.look.id) {
          input.mouseDX += (t.clientX - this.look.x) * 2.2
          input.mouseDY += (t.clientY - this.look.y) * 2.2
          this.look.x = t.clientX
          this.look.y = t.clientY
          e.preventDefault()
        }
      }
    }, opt)
    const end = e => {
      for (const t of e.changedTouches) {
        if (this.stick && t.identifier === this.stick.id) {
          this.stick = null
          input.axis.x = input.axis.y = 0
          this.knob.style.transform = ""
          this.base.classList.remove("on")
        }
        if (this.look && t.identifier === this.look.id) this.look = null
      }
    }
    window.addEventListener("touchend", end)
    window.addEventListener("touchcancel", end)
    // buttons
    for (const b of root.querySelectorAll("[data-t]")) {
      const name = b.dataset.t
      b.addEventListener("touchstart", e => {
        e.preventDefault()
        e.stopPropagation()
        b.classList.add("down")
        this.game.audio.ensure()
        if (name === "attack") (input.mouseDown = true), (input.mouseClicked = true)
        else if (name === "sprint") input.vHeld.add("sprint")
        else if (name === "jump") input.press("jump"), input.vHeld.add("jump")
        else input.press(name)
      }, opt)
      b.addEventListener("touchend", e => {
        e.preventDefault()
        b.classList.remove("down")
        if (name === "attack") input.mouseDown = false
        else if (name === "sprint") input.vHeld.delete("sprint")
        else if (name === "jump") input.vHeld.delete("jump")
      }, opt)
    }
    // quick-slots: tap a slot in the bar
    document.addEventListener("touchstart", e => {
      const slot = e.target.closest?.(".quickbar [data-slot]")
      if (!slot || this.game.mode !== "play" || this.game.ui.modal) return
      e.preventDefault()
      input.vPressed.add(`slot${slot.dataset.slot}`)
    }, opt)
  }

  update() {
    if (!this.enabled) return
    const g = this.game
    const playing = g.mode === "play" && !g.ui.modal
    const portrait = window.innerHeight > window.innerWidth
    this.root.classList.toggle("hidden", !playing || portrait)
    this.rotate.classList.toggle("hidden", !(portrait && g.mode === "play"))
    g.input.touchActive = playing && !portrait
    if (!playing) {
      this.stick = this.look = null
      g.input.axis.x = g.input.axis.y = 0
      this.base?.classList.remove("on")
    }
  }
}
