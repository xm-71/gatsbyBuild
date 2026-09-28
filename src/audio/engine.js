// WebAudio core: buses, a generated reverb, 3D panning, and the synth
// instruments shared by the score, ambience and sound effects.
import { settings } from "../core/settings.js"
import { midiToFreq } from "../logic/musictheory.js"

export class AudioEngine {
  constructor() {
    this.ctx = null
    this.enabled = true
    this.pluckCache = new Map()
  }

  // Create the context on the first user gesture (browsers require one).
  // A context may be passed in (an OfflineAudioContext renders to a buffer).
  init(existing = null) {
    if (this.ctx || !this.enabled) return !!this.ctx
    try {
      const ctx = (this.ctx = existing || new (window.AudioContext || window.webkitAudioContext)())
      this.master = ctx.createGain()
      this.master.gain.value = 0.7
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -14
      comp.ratio.value = 4
      // muffles everything when the listener is under water
      this.muffle = ctx.createBiquadFilter()
      this.muffle.type = "lowpass"
      this.muffle.frequency.value = 20000
      this.master.connect(this.muffle).connect(comp).connect(ctx.destination)
      this.sfxBus = ctx.createGain()
      this.musicBus = ctx.createGain()
      this.ambBus = ctx.createGain()
      this.uiBus = ctx.createGain()
      for (const b of [this.sfxBus, this.musicBus, this.ambBus, this.uiBus]) b.connect(this.master)
      this.reverb = ctx.createConvolver()
      this.reverb.buffer = this.impulse(2.8, 2.2)
      this.reverbReturn = ctx.createGain()
      this.reverbReturn.gain.value = 1
      this.reverb.connect(this.reverbReturn).connect(this.master)
      // music has its own long hall
      this.musicVerb = ctx.createConvolver()
      this.musicVerb.buffer = this.impulse(3.6, 2.6)
      const mv = ctx.createGain()
      mv.gain.value = 0.55
      this.musicVerb.connect(mv).connect(this.musicBus)
      this.sfxSend = ctx.createGain()
      this.sfxSend.gain.value = 0.12
      this.sfxSend.connect(this.reverb)
      this.noiseBuf = this.makeNoise(3)
      this.applyVolumes()
      return true
    } catch {
      this.enabled = false
      return false
    }
  }

  get now() {
    return this.ctx.currentTime
  }

  applyVolumes() {
    if (!this.ctx) return
    this.sfxBus.gain.value = settings.sfxVolume
    this.uiBus.gain.value = settings.sfxVolume * 0.6
    this.ambBus.gain.value = settings.ambienceVolume ?? 0.7
    this.musicBus.gain.value = 0.55 * settings.musicVolume
    this.sfxSend.gain.value = (this.space?.send ?? 0.12) * settings.sfxVolume
  }

  // Room character: more reverb in dungeons, less in the open.
  setSpace(kind) {
    if (!this.ctx) return
    const send = { dungeon: 0.5, town: 0.14, overworld: 0.08 }[kind] ?? 0.1
    this.space = { kind, send }
    this.sfxSend.gain.setTargetAtTime(send * settings.sfxVolume, this.now, 0.3)
  }

  impulse(seconds, decay) {
    const ctx = this.ctx
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 200 ? i / 200 : 1)
    }
    return buf
  }

  makeNoise(seconds) {
    const ctx = this.ctx
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    return buf
  }

  // Keep the listener on the camera so positional sounds pan correctly.
  setListener(camera) {
    if (!this.ctx) return
    const L = this.ctx.listener
    const p = camera.getWorldPosition(this._v || (this._v = camera.position.clone()))
    const m = camera.matrixWorld.elements
    const fx = -m[8], fy = -m[9], fz = -m[10]
    const ux = m[4], uy = m[5], uz = m[6]
    const t = this.now
    if (L.positionX) {
      L.positionX.setTargetAtTime(p.x, t, 0.02)
      L.positionY.setTargetAtTime(p.y, t, 0.02)
      L.positionZ.setTargetAtTime(p.z, t, 0.02)
      L.forwardX.setTargetAtTime(fx, t, 0.02)
      L.forwardY.setTargetAtTime(fy, t, 0.02)
      L.forwardZ.setTargetAtTime(fz, t, 0.02)
      L.upX.setTargetAtTime(ux, t, 0.02)
      L.upY.setTargetAtTime(uy, t, 0.02)
      L.upZ.setTargetAtTime(uz, t, 0.02)
    } else {
      L.setPosition(p.x, p.y, p.z)
      L.setOrientation(fx, fy, fz, ux, uy, uz)
    }
    this.listenerPos = p
  }

  // An output node for one sound: panned in 3D if it has a position.
  // Sounds too far away return null and are skipped.
  out(pos, { bus = this.sfxBus, ref = 3, max = 70, send = true, cull = true } = {}) {
    if (!this.ctx) return null
    if (pos && cull && this.listenerPos && this.listenerPos.distanceTo(pos) > max) return null
    const g = this.ctx.createGain()
    if (pos) {
      const p = this.ctx.createPanner()
      p.panningModel = "HRTF"
      p.distanceModel = "inverse"
      p.refDistance = ref
      p.rolloffFactor = 1.1
      p.maxDistance = max
      if (p.positionX) {
        p.positionX.value = pos.x
        p.positionY.value = pos.y
        p.positionZ.value = pos.z
      } else p.setPosition(pos.x, pos.y, pos.z)
      g.connect(p).connect(bus)
      if (send) p.connect(this.sfxSend)
    } else {
      g.connect(bus)
      if (send && bus === this.sfxBus) g.connect(this.sfxSend)
    }
    return g
  }

  // ---------- primitives ----------

  env(g, t0, { a = 0.01, peak = 0.3, hold = 0, d = 0.2, sustain = 0 } = {}) {
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a)
    if (hold) g.gain.setValueAtTime(Math.max(0.0002, peak), t0 + a + hold)
    if (sustain > 0) g.gain.setTargetAtTime(sustain, t0 + a + hold, d / 3)
    else g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + hold + d)
  }

  osc(dest, { type = "sine", freq = 440, t0 = this.now, dur = 0.3, gain = 0.2, a = 0.01, slide = 0, slideTime = null, detune = 0 } = {}) {
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t0)
    o.detune.value = detune
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + (slideTime ?? dur))
    const g = this.ctx.createGain()
    this.env(g, t0, { a, peak: gain, d: Math.max(0.02, dur - a) })
    o.connect(g).connect(dest)
    o.start(t0)
    o.stop(t0 + dur + 0.05)
    return o
  }

  noise(dest, { t0 = this.now, dur = 0.2, gain = 0.3, type = "bandpass", freq = 1000, q = 1, sweep = 0, a = 0.005, rate = 1 } = {}) {
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.playbackRate.value = rate
    const f = this.ctx.createBiquadFilter()
    f.type = type
    f.frequency.setValueAtTime(freq, t0)
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(30, freq + sweep), t0 + dur)
    f.Q.value = q
    const g = this.ctx.createGain()
    this.env(g, t0, { a, peak: gain, d: Math.max(0.02, dur - a) })
    src.connect(f).connect(g).connect(dest)
    const off = Math.random() * 2
    src.start(t0, off, dur + 0.1)
    return src
  }

  // Frequency-modulated tone: metallic clanks, bells and chimes.
  fm(dest, { t0 = this.now, freq = 300, ratio = 3.5, index = 400, dur = 0.5, gain = 0.2, a = 0.002 } = {}) {
    const ctx = this.ctx
    const car = ctx.createOscillator()
    const mod = ctx.createOscillator()
    const mg = ctx.createGain()
    car.frequency.value = freq
    mod.frequency.value = freq * ratio
    mg.gain.setValueAtTime(index, t0)
    mg.gain.exponentialRampToValueAtTime(Math.max(1, index * 0.05), t0 + dur)
    mod.connect(mg).connect(car.frequency)
    const g = ctx.createGain()
    this.env(g, t0, { a, peak: gain, d: dur })
    car.connect(g).connect(dest)
    car.start(t0)
    mod.start(t0)
    car.stop(t0 + dur + 0.05)
    mod.stop(t0 + dur + 0.05)
  }

  // Karplus-Strong plucked string, cached per pitch.
  pluckBuffer(freq) {
    const key = Math.round(freq * 4)
    let buf = this.pluckCache.get(key)
    if (buf) return buf
    const sr = this.ctx.sampleRate
    const len = Math.floor(sr * 2.2)
    buf = this.ctx.createBuffer(1, len, sr)
    const d = buf.getChannelData(0)
    const period = Math.max(2, Math.round(sr / freq))
    const ring = new Float32Array(period)
    for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1
    let idx = 0
    for (let i = 0; i < len; i++) {
      const next = (idx + 1) % period
      const v = ring[idx]
      ring[idx] = (v + ring[next]) * 0.4985
      d[i] = v
      idx = next
    }
    this.pluckCache.set(key, buf)
    return buf
  }

  // ---------- instruments (used by the score) ----------

  instrument(name, dest, midi, t0, dur, vel = 1) {
    const f = midiToFreq(midi)
    const ctx = this.ctx
    switch (name) {
      case "pad": {
        const g = ctx.createGain()
        const lp = ctx.createBiquadFilter()
        lp.type = "lowpass"
        lp.frequency.value = this.padCutoff || 900
        lp.Q.value = 0.5
        // one soft saw for body, detuned triangles for warmth
        for (const [type, det, lv] of [["sawtooth", -6, 0.45], ["triangle", 7, 1], ["triangle", -12, 0.8]]) {
          const o = ctx.createOscillator()
          o.type = type
          o.frequency.value = f
          o.detune.value = det
          const og = ctx.createGain()
          og.gain.value = lv
          o.connect(og).connect(lp)
          o.start(t0)
          o.stop(t0 + dur + 2.5)
        }
        g.gain.setValueAtTime(0.0001, t0)
        g.gain.linearRampToValueAtTime(0.055 * vel, t0 + Math.min(1.8, dur * 0.4))
        g.gain.setValueAtTime(0.055 * vel, t0 + dur)
        g.gain.linearRampToValueAtTime(0.0001, t0 + dur + 2.4)
        lp.connect(g).connect(dest)
        return
      }
      case "strings": {
        const g = ctx.createGain()
        const lp = ctx.createBiquadFilter()
        lp.type = "lowpass"
        lp.frequency.value = 2200
        const vib = ctx.createOscillator()
        const vg = ctx.createGain()
        vib.frequency.value = 5
        vg.gain.value = f * 0.006
        vib.connect(vg)
        for (const det of [-9, 0, 8]) {
          const o = ctx.createOscillator()
          o.type = "sawtooth"
          o.frequency.value = f
          o.detune.value = det
          vg.connect(o.frequency)
          o.connect(lp)
          o.start(t0)
          o.stop(t0 + dur + 1.2)
        }
        vib.start(t0)
        vib.stop(t0 + dur + 1.2)
        g.gain.setValueAtTime(0.0001, t0)
        g.gain.linearRampToValueAtTime(0.045 * vel, t0 + 0.35)
        g.gain.setValueAtTime(0.045 * vel, t0 + dur)
        g.gain.linearRampToValueAtTime(0.0001, t0 + dur + 1)
        lp.connect(g).connect(dest)
        return
      }
      case "flute": {
        const g = ctx.createGain()
        const o = ctx.createOscillator()
        o.type = "sine"
        o.frequency.value = f
        const o2 = ctx.createOscillator()
        o2.type = "triangle"
        o2.frequency.value = f * 2
        const g2 = ctx.createGain()
        g2.gain.value = 0.12
        const vib = ctx.createOscillator()
        const vg = ctx.createGain()
        vib.frequency.value = 5.2
        vg.gain.setValueAtTime(0, t0)
        vg.gain.linearRampToValueAtTime(f * 0.012, t0 + Math.min(0.5, dur))
        vib.connect(vg).connect(o.frequency)
        o.connect(g)
        o2.connect(g2).connect(g)
        g.gain.setValueAtTime(0.0001, t0)
        g.gain.linearRampToValueAtTime(0.11 * vel, t0 + 0.07)
        g.gain.setValueAtTime(0.1 * vel, t0 + Math.max(0.08, dur - 0.08))
        g.gain.linearRampToValueAtTime(0.0001, t0 + dur + 0.15)
        g.connect(dest)
        for (const n of [o, o2, vib]) {
          n.start(t0)
          n.stop(t0 + dur + 0.2)
        }
        this.noise(dest, { t0, dur: 0.09, gain: 0.03 * vel, freq: f * 2, q: 3 })
        return
      }
      case "horn": {
        const g = ctx.createGain()
        const lp = ctx.createBiquadFilter()
        lp.type = "lowpass"
        lp.Q.value = 1.5
        lp.frequency.setValueAtTime(f * 1.2, t0)
        lp.frequency.linearRampToValueAtTime(f * 4, t0 + 0.12)
        lp.frequency.linearRampToValueAtTime(f * 2.5, t0 + dur)
        for (const det of [-4, 4]) {
          const o = ctx.createOscillator()
          o.type = "sawtooth"
          o.frequency.value = f
          o.detune.value = det
          o.connect(lp)
          o.start(t0)
          o.stop(t0 + dur + 0.5)
        }
        g.gain.setValueAtTime(0.0001, t0)
        g.gain.linearRampToValueAtTime(0.07 * vel, t0 + 0.08)
        g.gain.setValueAtTime(0.065 * vel, t0 + dur)
        g.gain.linearRampToValueAtTime(0.0001, t0 + dur + 0.4)
        lp.connect(g).connect(dest)
        return
      }
      case "choir": {
        const g = ctx.createGain()
        const src = ctx.createGain()
        for (const det of [-10, 0, 11]) {
          const o = ctx.createOscillator()
          o.type = "sawtooth"
          o.frequency.value = f
          o.detune.value = det
          o.connect(src)
          o.start(t0)
          o.stop(t0 + dur + 1.5)
        }
        // "ah" formants
        for (const [ff, q, lv] of [[800, 6, 1], [1150, 7, 0.6], [2900, 9, 0.25]]) {
          const bp = ctx.createBiquadFilter()
          bp.type = "bandpass"
          bp.frequency.value = ff
          bp.Q.value = q
          const lg = ctx.createGain()
          lg.gain.value = lv
          src.connect(bp).connect(lg).connect(g)
        }
        g.gain.setValueAtTime(0.0001, t0)
        g.gain.linearRampToValueAtTime(0.16 * vel, t0 + 0.6)
        g.gain.setValueAtTime(0.16 * vel, t0 + dur)
        g.gain.linearRampToValueAtTime(0.0001, t0 + dur + 1.4)
        g.connect(dest)
        return
      }
      case "pluck": {
        const src = ctx.createBufferSource()
        src.buffer = this.pluckBuffer(f)
        const g = ctx.createGain()
        g.gain.value = 0.22 * vel
        const lp = ctx.createBiquadFilter()
        lp.type = "lowpass"
        lp.frequency.value = 3000
        src.connect(lp).connect(g).connect(dest)
        src.start(t0)
        src.stop(t0 + 2.2)
        return
      }
      case "bells":
        return this.fm(dest, { t0, freq: f, ratio: 3.51, index: f * 1.2, dur: 2.5, gain: 0.07 * vel })
      case "bass": {
        this.osc(dest, { type: "triangle", freq: f, t0, dur: Math.min(dur, 1.2), gain: 0.16 * vel, a: 0.01 })
        this.osc(dest, { type: "sine", freq: f / 2, t0, dur: Math.min(dur, 1.2), gain: 0.12 * vel, a: 0.01 })
        return
      }
      case "drone": {
        const g = ctx.createGain()
        const o = ctx.createOscillator()
        o.type = "sawtooth"
        o.frequency.value = f / 2
        const lp = ctx.createBiquadFilter()
        lp.type = "lowpass"
        lp.frequency.value = 220
        const lfo = ctx.createOscillator()
        const lg = ctx.createGain()
        lfo.frequency.value = 0.15
        lg.gain.value = 90
        lfo.connect(lg).connect(lp.frequency)
        o.connect(lp).connect(g).connect(dest)
        g.gain.setValueAtTime(0.0001, t0)
        g.gain.linearRampToValueAtTime(0.09 * vel, t0 + 2)
        g.gain.setValueAtTime(0.09 * vel, t0 + dur)
        g.gain.linearRampToValueAtTime(0.0001, t0 + dur + 2)
        for (const n of [o, lfo]) {
          n.start(t0)
          n.stop(t0 + dur + 2.1)
        }
        return
      }
      case "taiko":
        this.osc(dest, { type: "sine", freq: 95, slide: -50, slideTime: 0.3, t0, dur: 0.6, gain: 0.5 * vel, a: 0.003 })
        this.noise(dest, { t0, dur: 0.08, gain: 0.12 * vel, type: "lowpass", freq: 900 })
        return
      case "tom":
        this.osc(dest, { type: "sine", freq: 150, slide: -60, slideTime: 0.2, t0, dur: 0.35, gain: 0.26 * vel, a: 0.003 })
        return
      case "frame":
        this.noise(dest, { t0, dur: 0.18, gain: 0.12 * vel, freq: 260, q: 2 })
        this.osc(dest, { type: "sine", freq: 120, t0, dur: 0.2, gain: 0.08 * vel, a: 0.003 })
        return
      case "shaker":
        this.noise(dest, { t0, dur: 0.06, gain: 0.05 * vel, type: "highpass", freq: 6000, a: 0.01 })
        return
      case "heart":
        this.osc(dest, { type: "sine", freq: 55, slide: -15, t0, dur: 0.3, gain: 0.45 * vel, a: 0.01 })
        this.osc(dest, { type: "sine", freq: 50, slide: -12, t0: t0 + 0.24, dur: 0.35, gain: 0.32 * vel, a: 0.01 })
        return
    }
  }
}
