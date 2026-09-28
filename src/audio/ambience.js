// Ambient soundscape: continuous beds (wind, rain, surf, cave air, machinery,
// chanting, town murmur) mixed from the player's surroundings, plus scattered
// one-shots such as drips, birds, crickets, steam and distant hammering.
export class Ambience {
  constructor(engine) {
    this.e = engine
    this.beds = null
    this.timers = {}
    this.emitters = []
  }

  start() {
    if (this.beds || !this.e.ctx) return
    const e = this.e
    const ctx = e.ctx
    const bed = (filterType, freq, q = 0.7, rate = 1) => {
      const src = ctx.createBufferSource()
      src.buffer = e.noiseBuf
      src.loop = true
      src.playbackRate.value = rate
      const f = ctx.createBiquadFilter()
      f.type = filterType
      f.frequency.value = freq
      f.Q.value = q
      const g = ctx.createGain()
      g.gain.value = 0
      src.connect(f).connect(g).connect(e.ambBus)
      src.start(0, Math.random() * 2)
      return { g, f, src }
    }
    const hum = () => {
      const g = ctx.createGain()
      g.gain.value = 0
      const trem = ctx.createOscillator()
      const tg = ctx.createGain()
      trem.frequency.value = 0.3
      tg.gain.value = 0.25
      const inner = ctx.createGain()
      inner.gain.value = 0.75
      trem.connect(tg).connect(inner.gain)
      for (const [f, lv] of [[55, 0.5], [110.4, 0.3], [165.2, 0.15], [331, 0.04]]) {
        const o = ctx.createOscillator()
        o.frequency.value = f
        const og = ctx.createGain()
        og.gain.value = lv
        o.connect(og).connect(inner)
        o.start()
      }
      trem.start()
      inner.connect(g).connect(e.ambBus)
      return { g }
    }
    const chant = () => {
      const g = ctx.createGain()
      g.gain.value = 0
      const src = ctx.createGain()
      const voices = []
      for (const f of [73.4, 110, 146.8]) {
        const o = ctx.createOscillator()
        o.type = "sawtooth"
        o.frequency.value = f
        o.detune.value = Math.random() * 12 - 6
        o.connect(src)
        o.start()
        voices.push(o)
      }
      const formants = []
      for (const [ff, q] of [[500, 5], [850, 6], [2500, 8]]) {
        const bp = ctx.createBiquadFilter()
        bp.type = "bandpass"
        bp.frequency.value = ff
        bp.Q.value = q
        src.connect(bp).connect(g)
        formants.push(bp)
      }
      g.connect(e.ambBus)
      return { g, voices, formants }
    }
    this.beds = {
      wind: bed("bandpass", 400, 0.8, 0.5),
      grit: bed("highpass", 3500, 0.5, 1),
      rain: bed("highpass", 2500, 0.4, 1),
      surf: bed("lowpass", 600, 0.6, 0.6),
      cave: bed("lowpass", 140, 0.7, 0.4),
      murmur: bed("bandpass", 520, 1.4, 0.8),
      rumble: bed("lowpass", 70, 0.9, 0.3),
      hum: hum(),
      chant: chant(),
    }
    this.levels = Object.fromEntries(Object.keys(this.beds).map(k => [k, 0]))
    this.t = 0
  }

  // env: { kind, region, weather, night, inTown, coast (0..1), lava, theme, underwater, title }
  update(dt, env) {
    if (!this.beds) return
    const e = this.e
    this.t += dt
    const B = this.beds
    const out = env.kind === "overworld"
    const dung = env.kind === "dungeon"
    const w = env.weather
    const storm = w === "ash" || w === "blight"
    const ashy = ["ashlands", "redMountain", "molagAmur"].includes(env.region)
    const target = {
      wind: out ? (storm ? 0.5 : ashy ? 0.2 : 0.09) * (env.title ? 0.5 : 1) : dung && env.theme === "cave" ? 0.02 : 0,
      grit: out && storm ? 0.12 : 0,
      rain: out && w === "rain" ? 0.2 : 0,
      surf: out ? env.coast * 0.22 : 0,
      cave: dung ? (env.theme === "dwemer" ? 0.05 : 0.14) : 0,
      murmur: out && env.inTown && !env.night ? 0.035 : 0,
      rumble: (out && (w === "blight" || env.lava) ? 0.25 : 0) + (dung && (env.theme === "citadel" || env.theme === "daedric") ? 0.18 : 0),
      hum: dung && env.theme === "dwemer" ? 0.05 : 0,
      chant: dung && env.theme === "daedric" ? 0.035 : 0,
    }
    // slow gusts
    const gust = 0.7 + 0.3 * Math.sin(this.t * 0.37) * Math.sin(this.t * 0.13 + 1)
    B.wind.f.frequency.setTargetAtTime(storm ? 600 + gust * 500 : 280 + gust * 260, e.now, 0.5)
    target.wind *= gust
    // surf swells
    target.surf *= 0.55 + 0.45 * Math.max(0, Math.sin(this.t * 0.8))
    // murmur babble
    target.murmur *= 0.6 + 0.4 * Math.abs(Math.sin(this.t * 3.1) * Math.sin(this.t * 1.7))
    B.murmur.f.frequency.setTargetAtTime(420 + 220 * Math.abs(Math.sin(this.t * 2.3)), e.now, 0.05)
    // chanting vowels drift
    if (B.chant.formants) {
      const v = (Math.sin(this.t * 0.4) + 1) / 2
      B.chant.formants[0].frequency.setTargetAtTime(400 + v * 300, e.now, 0.3)
      B.chant.formants[1].frequency.setTargetAtTime(800 + v * 400, e.now, 0.3)
      target.chant *= 0.5 + 0.5 * Math.max(0, Math.sin(this.t * 0.5))
    }
    for (const k in target) {
      if (Math.abs(target[k] - this.levels[k]) > 0.002) {
        this.levels[k] = target[k]
        B[k].g.gain.setTargetAtTime(target[k], e.now, 0.8)
      }
    }
    // one-shots
    const every = (key, min, max, fn) => {
      this.timers[key] = (this.timers[key] ?? Math.random() * max) - dt
      if (this.timers[key] <= 0) {
        this.timers[key] = min + Math.random() * (max - min)
        fn()
      }
    }
    const bus = e.ambBus
    const grassy = ["ascadian", "grazelands", "bitterCoast", "westGash", "azurasCoast"].includes(env.region)
    if (out && !env.title) {
      if (grassy && !env.night && w !== "rain" && !storm) every("bird", 2.5, 9, () => this.bird())
      if (grassy && env.night && w !== "rain") every("cricket", 0.4, 1.6, () => this.cricket())
      if (w === "rain") every("drop", 0.05, 0.2, () => e.noise(bus, { dur: 0.03, gain: 0.03 + Math.random() * 0.04, freq: 3000 + Math.random() * 4000, q: 4 }))
      if (env.lava) every("lava", 0.8, 2.5, () => this.bubble())
      if (env.inTown && !env.night) every("hammer", 5, 14, () => this.distantHammer())
      if (env.region === "bitterCoast" && !env.night) every("frog", 3, 8, () => e.osc(bus, { type: "square", freq: 140, slide: -40, dur: 0.12, gain: 0.02 }))
    }
    if (env.underwater) every("bubble", 0.6, 2.2, () => {
      for (let i = 0; i < 3; i++) e.osc(bus, { freq: 500 + Math.random() * 700, slide: 400, dur: 0.06, gain: 0.03, t0: e.now + i * 0.08 })
    })
    if (dung) {
      if (env.theme === "cave" || env.theme === "tomb" || env.theme === "citadel") every("drip", 1.2, 4.5, () => this.drip())
      if (env.theme === "dwemer") {
        every("steam", 4, 11, () => e.noise(bus, { dur: 1.4, gain: 0.05, type: "highpass", freq: 2500, a: 0.2 }))
        every("clank", 3, 9, () => e.fm(bus, { freq: 180 + Math.random() * 120, ratio: 2.76, index: 500, dur: 0.6, gain: 0.03 }))
      }
      if (env.theme === "tomb") every("moan", 9, 20, () => this.moan())
    }
  }

  bird() {
    const e = this.e
    const f = 2200 + Math.random() * 1600
    const n = 2 + Math.floor(Math.random() * 4)
    for (let i = 0; i < n; i++) e.osc(e.ambBus, { freq: f * (1 + Math.random() * 0.2), slide: (Math.random() - 0.3) * 1400, dur: 0.07 + Math.random() * 0.06, gain: 0.018, t0: e.now + i * 0.11 })
  }

  cricket() {
    const e = this.e
    const f = 4200 + Math.random() * 800
    for (let i = 0; i < 3; i++) e.osc(e.ambBus, { freq: f, dur: 0.025, gain: 0.012, t0: e.now + i * 0.045 })
  }

  drip() {
    const e = this.e
    const f = 900 + Math.random() * 1400
    const g = e.ctx.createGain()
    g.gain.value = 1
    g.connect(e.ambBus)
    g.connect(e.reverb)
    e.osc(g, { freq: f, slide: -f * 0.5, slideTime: 0.06, dur: 0.1, gain: 0.05, a: 0.002 })
  }

  bubble() {
    const e = this.e
    e.osc(e.ambBus, { freq: 60 + Math.random() * 40, slide: 80, dur: 0.25, gain: 0.08 })
    e.noise(e.ambBus, { dur: 0.3, gain: 0.04, type: "lowpass", freq: 300 })
  }

  distantHammer() {
    const e = this.e
    for (let i = 0; i < 3; i++) e.fm(e.ambBus, { t0: e.now + i * 0.55, freq: 520, ratio: 2.4, index: 900, dur: 0.35, gain: 0.012 })
  }

  moan() {
    const e = this.e
    const o = e.osc(e.ambBus, { type: "sine", freq: 180, slide: -60, dur: 2.2, gain: 0.03, a: 0.7 })
    void o
  }

  // Looping crackle at each torch or brazier, panned in 3D.
  setEmitters(positions) {
    this.clearEmitters()
    const e = this.e
    if (!e.ctx) return
    if (!this.crackleBuf) {
      const sr = e.ctx.sampleRate
      const len = sr * 3
      const buf = e.ctx.createBuffer(1, len, sr)
      const d = buf.getChannelData(0)
      let lp = 0
      for (let i = 0; i < len; i++) {
        lp = lp * 0.97 + (Math.random() * 2 - 1) * 0.03
        d[i] = lp * 0.6 + (Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.9 : 0)
      }
      this.crackleBuf = buf
    }
    for (const p of positions.slice(0, 8)) {
      const out = e.out(p, { bus: e.ambBus, ref: 1.5, max: 30, send: false, cull: false })
      if (!out) continue
      const src = e.ctx.createBufferSource()
      src.buffer = this.crackleBuf
      src.loop = true
      out.gain.value = 0.5
      src.connect(out)
      src.start(0, Math.random() * 3)
      this.emitters.push(src)
    }
  }

  clearEmitters() {
    for (const s of this.emitters) {
      try {
        s.stop()
      } catch {
        /* already stopped */
      }
    }
    this.emitters = []
  }
}
