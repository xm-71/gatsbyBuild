import { settings } from "../core/settings.js"

// Tiny procedural sound effects + an ambient drone, all synthesized with WebAudio.
export class Audio {
  constructor() {
    this.ctx = null
    this.master = null
    this.musicGain = null
    this.enabled = true
  }

  ensure() {
    if (this.ctx || !this.enabled) return
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.5
      this.master.connect(this.ctx.destination)
      this.sfx = this.ctx.createGain()
      this.sfx.connect(this.master)
      this.applyVolumes()
      this.startMusic()
    } catch {
      this.enabled = false
    }
  }

  noise(duration, { freq = 800, q = 1, gain = 0.3, type = "bandpass", sweep = 0 } = {}) {
    if (!this.ctx) return
    const ctx = this.ctx
    const len = Math.floor(ctx.sampleRate * duration)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), ctx.currentTime + duration)
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.value = gain
    src.connect(f).connect(g).connect(this.sfx)
    src.start()
  }

  tone(freq, duration, { type = "sine", gain = 0.2, slide = 0, delay = 0 } = {}) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t0 = ctx.currentTime + delay
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t0)
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + duration)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
    o.connect(g).connect(this.sfx)
    o.start(t0)
    o.stop(t0 + duration + 0.05)
  }

  play(name) {
    if (!this.ctx) return
    switch (name) {
      case "swing": return this.noise(0.22, { freq: 900, sweep: -600, q: 0.8, gain: 0.25 })
      case "hit": this.noise(0.12, { freq: 300, q: 1, gain: 0.5, type: "lowpass" }); return this.tone(90, 0.15, { type: "triangle", gain: 0.3, slide: -40 })
      case "block": return this.tone(420, 0.2, { type: "square", gain: 0.12, slide: -200 })
      case "hurt": return this.tone(160, 0.25, { type: "sawtooth", gain: 0.15, slide: -80 })
      case "spell": this.tone(300, 0.4, { type: "sine", gain: 0.2, slide: 500 }); return this.noise(0.4, { freq: 2000, gain: 0.08, q: 3 })
      case "fizzle": return this.tone(200, 0.3, { type: "sawtooth", gain: 0.1, slide: -150 })
      case "explode": return this.noise(0.5, { freq: 500, gain: 0.4, type: "lowpass", sweep: -400 })
      case "bow": return this.noise(0.15, { freq: 1500, gain: 0.2, q: 2 })
      case "pickup": return this.tone(660, 0.1, { type: "triangle", gain: 0.12 })
      case "gold": this.tone(1200, 0.08, { type: "square", gain: 0.06 }); return this.tone(1600, 0.1, { type: "square", gain: 0.05, delay: 0.06 })
      case "door": return this.noise(0.6, { freq: 200, gain: 0.3, type: "lowpass" })
      case "unlock": return this.tone(900, 0.08, { type: "square", gain: 0.1 })
      case "levelup":
        ;[523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.5, { type: "triangle", gain: 0.15, delay: i * 0.12 }))
        return
      case "skillup":
        this.tone(587, 0.3, { type: "triangle", gain: 0.1 })
        return this.tone(880, 0.4, { type: "triangle", gain: 0.1, delay: 0.1 })
      case "death": return this.tone(220, 1.5, { type: "sawtooth", gain: 0.2, slide: -170 })
      case "step": return this.noise(0.06, { freq: 250, gain: 0.05, type: "lowpass" })
    }
  }

  // A slow, modal ambient pad, loosely evoking the Morrowind main theme mood.
  startMusic() {
    const ctx = this.ctx
    this.musicGain = ctx.createGain()
    this.musicGain.connect(this.master)
    this.applyVolumes()
    const chords = [
      [146.8, 220, 293.7],
      [130.8, 196, 261.6],
      [116.5, 174.6, 233.1],
      [130.8, 196, 293.7],
    ]
    let i = 0
    const playChord = () => {
      if (!this.ctx) return
      const t0 = ctx.currentTime
      for (const f of chords[i % chords.length]) {
        const o = ctx.createOscillator()
        o.type = "sine"
        o.frequency.value = f
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, t0)
        g.gain.exponentialRampToValueAtTime(0.5, t0 + 2.5)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 8)
        o.connect(g).connect(this.musicGain)
        o.start(t0)
        o.stop(t0 + 8.2)
      }
      i++
    }
    playChord()
    this.musicTimer = setInterval(playChord, 7000)
  }

  // Volumes come from the settings menu (0..1 each).
  applyVolumes() {
    if (this.sfx) this.sfx.gain.value = settings.sfxVolume
    if (this.musicGain) this.musicGain.gain.value = 0.1 * settings.musicVolume
  }
}
