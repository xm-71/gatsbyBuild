export class Input {
  constructor(canvas) {
    this.canvas = canvas
    this.keys = new Set()
    this.pressed = new Set()
    this.mouseDX = 0
    this.mouseDY = 0
    this.mouseDown = false
    this.mouseClicked = false
    this.mouseReleased = false
    this.wheel = 0
    this.locked = false
    this.sensitivity = 0.0022

    window.addEventListener("keydown", e => {
      if (e.target instanceof HTMLInputElement) return
      if (!this.keys.has(e.code)) this.pressed.add(e.code)
      this.keys.add(e.code)
      if (["Tab", "Space"].includes(e.code) || (this.locked && e.code.startsWith("Arrow"))) e.preventDefault()
    })
    window.addEventListener("keyup", e => this.keys.delete(e.code))
    window.addEventListener("blur", () => {
      this.keys.clear()
      this.mouseDown = false
    })
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === canvas
    })
    window.addEventListener("mousemove", e => {
      if (!this.locked) return
      this.mouseDX += e.movementX
      this.mouseDY += e.movementY
    })
    canvas.addEventListener("mousedown", e => {
      if (!this.locked) return
      if (e.button === 0) {
        this.mouseDown = true
        this.mouseClicked = true
      } else if (e.button === 2) this.pressed.add("Mouse2")
    })
    window.addEventListener("mouseup", e => {
      if (e.button === 0 && this.mouseDown) {
        this.mouseDown = false
        this.mouseReleased = true
      }
    })
    canvas.addEventListener("contextmenu", e => e.preventDefault())
    window.addEventListener("wheel", e => {
      if (this.locked) this.wheel += Math.sign(e.deltaY)
    })
  }

  lock() {
    if (!this.locked) {
      try {
        const p = this.canvas.requestPointerLock()
        if (p && p.catch) p.catch(() => {})
      } catch {
        /* pointer lock unavailable (e.g. headless) */
      }
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock()
  }

  down(code) {
    return this.keys.has(code)
  }

  wasPressed(code) {
    return this.pressed.has(code)
  }

  endFrame() {
    this.pressed.clear()
    this.mouseDX = 0
    this.mouseDY = 0
    this.mouseClicked = false
    this.mouseReleased = false
    this.wheel = 0
  }
}
