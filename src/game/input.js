import { settings } from "../core/settings.js"

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
    // gamepad and touch controls feed these: held actions, one-frame presses,
    // and an analog movement axis (x strafe, y forward)
    this.vHeld = new Set()
    this.vPressed = new Set()
    this.axis = { x: 0, y: 0 }
    this.padActive = false
    this.touchActive = false

    window.addEventListener("keydown", e => {
      if (e.target instanceof HTMLInputElement) return
      if (!this.keys.has(e.code)) this.pressed.add(e.code)
      this.keys.add(e.code)
      if (["Tab", "Space"].includes(e.code) || (this.locked && (e.code.startsWith("Arrow") || Object.values(settings.keys).includes(e.code)))) e.preventDefault()
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

  // Playing without a mouse lock: a gamepad or touch screen is in charge.
  get active() {
    return this.locked || this.padActive || this.touchActive
  }

  // Rebindable actions (see core/settings.js), plus gamepad and touch.
  action(name) {
    if (this.keys.has(settings.keys[name]) || this.vHeld.has(name)) return true
    const a = this.axis
    if (name === "forward") return a.y > 0.35
    if (name === "back") return a.y < -0.35
    if (name === "right") return a.x > 0.35
    if (name === "left") return a.x < -0.35
    return false
  }

  actionPressed(name) {
    return this.pressed.has(settings.keys[name]) || this.vPressed.has(name)
  }

  // A virtual button press from the gamepad or touch controls.
  press(name) {
    this.vPressed.add(name)
  }

  endFrame() {
    this.vPressed.clear()
    this.pressed.clear()
    this.mouseDX = 0
    this.mouseDY = 0
    this.mouseClicked = false
    this.mouseReleased = false
    this.wheel = 0
  }
}
