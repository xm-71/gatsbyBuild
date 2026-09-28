// Named sound recipes. Each takes the engine, an output node, and options.

// Which surface a creature's body is, for impact sounds and hit particles.
export function bodyMaterial(def) {
  if (def.construct) return "metal"
  if (def.body === "ghost") return "ghost"
  if (def.body === "skeleton") return "bone"
  if (def.body === "crab" || def.body === "spider" || def.body === "worm") return "chitin"
  if (def.body === "ash" || def.body === "sleeper" || def.body === "dagoth") return "ash"
  if (def.humanoid && def.ar >= 20) return "metal"
  return "flesh"
}

// Weapon class for impact character.
export function weaponClass(w) {
  if (!w || w.skill === "handToHand") return "fist"
  if (w.skill === "bluntWeapon") return "blunt"
  if (w.skill === "axe") return "axe"
  if (w.skill === "spear") return "spear"
  if (w.skill === "marksman") return "arrow"
  return "blade"
}

// Creature voices by body type: pitch, timbre and call shape.
const VOICES = {
  flier: { kind: "screech", f: 1500 },
  quad: { kind: "squeak", f: 1800 },
  hound: { kind: "growl", f: 160 },
  alit: { kind: "growl", f: 120 },
  kagouti: { kind: "snort", f: 110 },
  guar: { kind: "snort", f: 150 },
  crab: { kind: "click", f: 900 },
  spider: { kind: "click", f: 1400 },
  worm: { kind: "click", f: 700 },
  netch: { kind: "whale", f: 90 },
  humanoid: { kind: "grunt", f: 130 },
  skeleton: { kind: "rattle", f: 600 },
  ghost: { kind: "moan", f: 220 },
  scamp: { kind: "cackle", f: 380 },
  clannfear: { kind: "roar", f: 140 },
  sphere: { kind: "clank", f: 260 },
  centurion: { kind: "clank", f: 160 },
  ash: { kind: "whisper", f: 200 },
  sleeper: { kind: "whisper", f: 150 },
  dagoth: { kind: "roar", f: 80 },
}

export function voiceFor(def) {
  if (def.construct && def.body === "spider") return { kind: "clank", f: 420 }
  return VOICES[def.body] || { kind: "growl", f: 150 }
}

// event: "idle" | "alert" | "pain" | "death". scale: bigger creatures sound lower.
export function creatureVoice(e, out, def, event, scale = 1) {
  const v = voiceFor(def)
  const f = v.f / Math.sqrt(scale)
  const loud = { idle: 0.5, alert: 0.9, pain: 0.8, death: 1 }[event]
  const len = { idle: 0.5, alert: 0.7, pain: 0.3, death: 1.1 }[event]
  const t0 = e.now
  switch (v.kind) {
    case "screech":
      e.osc(out, { type: "sawtooth", freq: f * (event === "pain" ? 1.3 : 1), slide: event === "death" ? -f * 0.7 : f * 0.6, slideTime: len * 0.4, dur: len, gain: 0.12 * loud })
      e.noise(out, { dur: len, gain: 0.08 * loud, freq: f * 2, q: 5, sweep: -f })
      return
    case "squeak":
      for (let i = 0; i < (event === "idle" ? 2 : 3); i++) e.osc(out, { freq: f * (1 + i * 0.1), slide: 500, dur: 0.07, gain: 0.07 * loud, t0: t0 + i * 0.09 })
      return
    case "growl":
    case "roar": {
      const big = v.kind === "roar" ? 1.6 : 1
      e.osc(out, { type: "sawtooth", freq: f * (event === "pain" ? 1.4 : 1), slide: event === "death" ? -f * 0.5 : -f * 0.2, dur: len * big, gain: 0.14 * loud, a: 0.05 })
      e.noise(out, { dur: len * big, gain: 0.14 * loud, type: "lowpass", freq: f * 4, a: 0.04 })
      return
    }
    case "snort":
      for (let i = 0; i < (event === "idle" ? 2 : 1); i++) e.noise(out, { t0: t0 + i * 0.22, dur: 0.18, gain: 0.2 * loud, type: "bandpass", freq: f * 3, q: 1.5, sweep: -f })
      if (event !== "idle") e.osc(out, { type: "sawtooth", freq: f, slide: event === "death" ? -f * 0.5 : f * 0.3, dur: len, gain: 0.1 * loud, a: 0.03 })
      return
    case "click":
      for (let i = 0; i < 4; i++) e.noise(out, { t0: t0 + i * 0.05, dur: 0.02, gain: 0.12 * loud, freq: f * (1 + Math.random() * 0.3), q: 8 })
      if (event === "death") e.osc(out, { freq: f * 0.4, slide: -f * 0.2, dur: 0.4, gain: 0.05 })
      return
    case "whale":
      e.osc(out, { freq: f * 1.6, slide: event === "death" ? -f : f * 0.5, slideTime: len, dur: len * 2, gain: 0.12 * loud, a: 0.3 })
      e.osc(out, { freq: f * 2.4, slide: f * 0.3, dur: len * 1.6, gain: 0.05 * loud, a: 0.3 })
      return
    case "grunt":
      e.osc(out, { type: "sawtooth", freq: f * (event === "pain" ? 1.5 : 1), slide: event === "death" ? -f * 0.4 : -f * 0.15, dur: len * 0.7, gain: 0.08 * loud, a: 0.02 })
      e.noise(out, { dur: len * 0.6, gain: 0.06 * loud, freq: 700, q: 3 })
      return
    case "rattle":
      for (let i = 0; i < 6; i++) e.noise(out, { t0: t0 + i * 0.045, dur: 0.03, gain: 0.08 * loud, freq: f * (1.5 + Math.random()), q: 6 })
      return
    case "moan": {
      const o = e.osc(out, { freq: f, slide: event === "death" ? -f * 0.6 : -f * 0.25, dur: len * 2, gain: 0.08 * loud, a: 0.25 })
      const vib = e.ctx.createOscillator()
      const vg = e.ctx.createGain()
      vib.frequency.value = 6
      vg.gain.value = f * 0.03
      vib.connect(vg).connect(o.frequency)
      vib.start(t0)
      vib.stop(t0 + len * 2)
      return
    }
    case "cackle":
      for (let i = 0; i < 4; i++) e.osc(out, { type: "square", freq: f * (1 + (i % 2) * 0.25), slide: -80, dur: 0.08, gain: 0.04 * loud, t0: t0 + i * 0.1 })
      return
    case "clank":
      e.fm(out, { freq: f, ratio: 2.76, index: f * 3, dur: 0.6, gain: 0.1 * loud })
      if (event !== "pain") e.noise(out, { dur: 0.5, gain: 0.05 * loud, type: "highpass", freq: 3000, a: 0.08 })
      return
    case "whisper":
      e.noise(out, { dur: len * 1.4, gain: 0.08 * loud, freq: 1800, q: 2, sweep: -800, a: 0.1 })
      e.osc(out, { type: "sawtooth", freq: f, slide: -f * 0.3, dur: len, gain: 0.05 * loud, a: 0.1 })
      return
  }
}

// Weapon impact on a body material.
export function impact(e, out, material, wclass, strength = 1) {
  const s = strength
  const thud = wclass === "blunt" || wclass === "fist"
  switch (material) {
    case "metal":
      e.fm(out, { freq: thud ? 220 : 480, ratio: 2.76, index: 1200, dur: 0.45, gain: 0.16 * s })
      e.noise(out, { dur: 0.08, gain: 0.2 * s, type: "highpass", freq: 3000 })
      break
    case "bone":
      for (let i = 0; i < 3; i++) e.noise(out, { t0: e.now + i * 0.02, dur: 0.04, gain: 0.16 * s, freq: 1400 + i * 400, q: 5 })
      break
    case "chitin":
      e.noise(out, { dur: 0.06, gain: 0.22 * s, freq: 2200, q: 3 })
      e.osc(out, { type: "square", freq: 320, slide: -120, dur: 0.08, gain: 0.06 * s })
      break
    case "ghost":
      e.osc(out, { freq: 900, slide: -500, dur: 0.3, gain: 0.07 * s })
      e.noise(out, { dur: 0.3, gain: 0.05 * s, freq: 3000, q: 1, sweep: -2000 })
      break
    case "ash":
      e.noise(out, { dur: 0.18, gain: 0.25 * s, type: "lowpass", freq: 700 })
      e.noise(out, { dur: 0.25, gain: 0.06 * s, type: "highpass", freq: 4000, a: 0.02 })
      break
    case "stone":
      e.noise(out, { dur: 0.1, gain: 0.2 * s, type: "bandpass", freq: 1200, q: 1 })
      break
    default:
      e.noise(out, { dur: 0.12, gain: 0.3 * s, type: "lowpass", freq: thud ? 350 : 700 })
      e.osc(out, { type: "triangle", freq: thud ? 80 : 120, slide: -40, dur: 0.14, gain: 0.22 * s })
  }
  if (!thud && material !== "ghost") e.noise(out, { dur: 0.07, gain: 0.08 * s, freq: 3500, q: 2, sweep: -1500 }) // edge bite
}

export function spellCast(e, out, element) {
  switch (element) {
    case "fire":
      e.noise(out, { dur: 0.5, gain: 0.22, type: "lowpass", freq: 400, sweep: 2200, a: 0.05 })
      e.osc(out, { type: "sawtooth", freq: 110, slide: 90, dur: 0.4, gain: 0.05 })
      return
    case "frost":
      for (let i = 0; i < 5; i++) e.osc(out, { freq: 2000 + i * 370, dur: 0.35, gain: 0.03, t0: e.now + i * 0.04 })
      e.noise(out, { dur: 0.4, gain: 0.08, type: "highpass", freq: 5000 })
      return
    case "shock":
      for (let i = 0; i < 6; i++) e.noise(out, { t0: e.now + i * 0.035, dur: 0.03, gain: 0.14, type: "highpass", freq: 2500 + Math.random() * 2000 })
      e.osc(out, { type: "square", freq: 60, dur: 0.3, gain: 0.05 })
      return
    case "poison":
      for (let i = 0; i < 5; i++) e.osc(out, { freq: 300 + Math.random() * 300, slide: 250, dur: 0.08, gain: 0.05, t0: e.now + i * 0.07 })
      return
    case "restore":
      ;[660, 880, 1320].forEach((f, i) => e.osc(out, { type: "triangle", freq: f, dur: 0.6, gain: 0.06, t0: e.now + i * 0.06, a: 0.05 }))
      return
    default:
      e.osc(out, { freq: 300, slide: 500, dur: 0.4, gain: 0.14 })
      e.noise(out, { dur: 0.4, gain: 0.06, freq: 2000, q: 3 })
  }
}

export function spellImpact(e, out, element, size = 1) {
  switch (element) {
    case "fire":
      e.noise(out, { dur: 0.7 * size, gain: 0.38, type: "lowpass", freq: 900, sweep: -700 })
      e.osc(out, { freq: 70, slide: -30, dur: 0.5, gain: 0.25 })
      return
    case "frost":
      for (let i = 0; i < 6; i++) e.noise(out, { t0: e.now + i * 0.03, dur: 0.05, gain: 0.1, freq: 3000 + Math.random() * 3000, q: 6 })
      e.noise(out, { dur: 0.5, gain: 0.1, type: "highpass", freq: 3000 })
      return
    case "shock":
      e.noise(out, { dur: 0.25, gain: 0.3, type: "highpass", freq: 1500 })
      for (let i = 0; i < 4; i++) e.osc(out, { type: "square", freq: 90 + i * 40, dur: 0.1, gain: 0.06, t0: e.now + i * 0.05 })
      return
    case "poison":
      e.noise(out, { dur: 0.5, gain: 0.18, type: "bandpass", freq: 500, q: 2, sweep: 600 })
      for (let i = 0; i < 4; i++) e.osc(out, { freq: 200 + Math.random() * 200, slide: 300, dur: 0.1, gain: 0.05, t0: e.now + 0.1 + i * 0.08 })
      return
    default:
      e.noise(out, { dur: 0.5 * size, gain: 0.3, type: "lowpass", freq: 600, sweep: -400 })
  }
}

// Footsteps: surface picks the texture; heavy armour adds weight and jingle.
export function footstep(e, out, surface, heavy = 0, loud = 1) {
  const g = 0.06 * loud * (1 + heavy * 0.6)
  const low = 1 - heavy * 0.35
  switch (surface) {
    case "grass":
      e.noise(out, { dur: 0.09, gain: g * 0.9, type: "bandpass", freq: 2200 * low, q: 0.8 })
      break
    case "ash":
      e.noise(out, { dur: 0.12, gain: g, type: "lowpass", freq: 900 * low })
      e.noise(out, { dur: 0.1, gain: g * 0.3, type: "highpass", freq: 5000, a: 0.01 })
      break
    case "gravel":
      for (let i = 0; i < 3; i++) e.noise(out, { t0: e.now + i * 0.018, dur: 0.03, gain: g * 0.7, freq: 1800 + Math.random() * 1500, q: 3 })
      break
    case "mud":
      e.noise(out, { dur: 0.16, gain: g * 1.1, type: "lowpass", freq: 500 * low, sweep: 400 })
      break
    case "water":
      e.noise(out, { dur: 0.22, gain: g * 1.4, type: "bandpass", freq: 900, q: 1, sweep: 1200 })
      break
    case "wood":
      e.osc(out, { type: "triangle", freq: 180 * low, slide: -60, dur: 0.08, gain: g * 1.6 })
      e.noise(out, { dur: 0.05, gain: g * 0.6, freq: 800, q: 2 })
      break
    case "metal":
      e.fm(out, { freq: 300 * low, ratio: 3.1, index: 300, dur: 0.18, gain: g * 0.9 })
      e.noise(out, { dur: 0.05, gain: g * 0.6, type: "lowpass", freq: 700 })
      break
    case "flesh":
      e.noise(out, { dur: 0.14, gain: g * 1.1, type: "lowpass", freq: 380, sweep: -150 })
      break
    default: // stone
      e.noise(out, { dur: 0.06, gain: g * 1.2, type: "lowpass", freq: 1100 * low })
      e.osc(out, { type: "triangle", freq: 110 * low, slide: -30, dur: 0.06, gain: g * 0.8 })
  }
  if (heavy > 0.3) e.fm(out, { t0: e.now + 0.02, freq: 1800 + Math.random() * 400, ratio: 1.41, index: 400, dur: 0.12, gain: 0.008 * heavy * loud })
}

// Simple one-shots for everything else.
export function misc(e, out, name, opts = {}) {
  switch (name) {
    case "swing": {
      const heavy = Math.min(1, (opts.weight || 10) / 40)
      return e.noise(out, { dur: 0.22 + heavy * 0.1, gain: 0.22, freq: 1100 - heavy * 600, sweep: -500, q: 0.9 })
    }
    case "whiff":
      return e.noise(out, { dur: 0.18, gain: 0.12, freq: 1500, sweep: -900, q: 1.2 })
    case "block":
      if (opts.wood) {
        e.osc(out, { type: "triangle", freq: 140, slide: -50, dur: 0.15, gain: 0.3 })
        return e.noise(out, { dur: 0.1, gain: 0.2, type: "lowpass", freq: 800 })
      }
      return e.fm(out, { freq: 620, ratio: 2.76, index: 1500, dur: 0.6, gain: 0.16 })
    case "hurt":
      e.osc(out, { type: "sawtooth", freq: 170, slide: -80, dur: 0.22, gain: 0.1 })
      return e.noise(out, { dur: 0.1, gain: 0.12, type: "lowpass", freq: 500 })
    case "fizzle":
      e.osc(out, { type: "sawtooth", freq: 220, slide: -160, dur: 0.3, gain: 0.08 })
      return e.noise(out, { dur: 0.3, gain: 0.05, type: "highpass", freq: 3000 })
    case "bow":
      e.noise(out, { dur: 0.14, gain: 0.2, freq: 1600, q: 2 })
      return e.osc(out, { type: "triangle", freq: 220, slide: -80, dur: 0.12, gain: 0.12 })
    case "crossbow":
      e.fm(out, { freq: 180, ratio: 1.5, index: 300, dur: 0.15, gain: 0.18 })
      return e.noise(out, { dur: 0.1, gain: 0.22, type: "lowpass", freq: 1200 })
    case "throw":
      return e.noise(out, { dur: 0.16, gain: 0.14, freq: 2400, sweep: -1400, q: 1.5 })
    case "stick":
      e.noise(out, { dur: 0.05, gain: 0.15, freq: 900, q: 2 })
      return e.osc(out, { type: "triangle", freq: 260, slide: -100, dur: 0.1, gain: 0.08 })
    case "pickup":
      return e.osc(out, { type: "triangle", freq: 660, dur: 0.1, gain: 0.1 })
    case "gold":
      e.osc(out, { type: "square", freq: 1200, dur: 0.08, gain: 0.05 })
      return e.osc(out, { type: "square", freq: 1600, dur: 0.1, gain: 0.04, t0: e.now + 0.06 })
    case "door":
      e.noise(out, { dur: 0.6, gain: 0.28, type: "lowpass", freq: 220 })
      return e.osc(out, { type: "sawtooth", freq: 70, slide: 30, dur: 0.5, gain: 0.03, a: 0.1 })
    case "unlock":
      e.noise(out, { dur: 0.03, gain: 0.15, freq: 3000, q: 5 })
      return e.fm(out, { t0: e.now + 0.04, freq: 900, ratio: 2, index: 400, dur: 0.12, gain: 0.07 })
    case "skillup":
      e.osc(out, { type: "triangle", freq: 587, dur: 0.3, gain: 0.09 })
      return e.osc(out, { type: "triangle", freq: 880, dur: 0.4, gain: 0.09, t0: e.now + 0.1 })
    case "death":
      return e.osc(out, { type: "sawtooth", freq: 220, slide: -170, dur: 1.5, gain: 0.16 })
    case "repair":
      for (let i = 0; i < 3; i++) e.fm(out, { t0: e.now + i * 0.22, freq: 700, ratio: 2.4, index: 900, dur: 0.25, gain: 0.08 })
      return
    case "break":
      e.fm(out, { freq: 400, ratio: 3.3, index: 2000, dur: 0.5, gain: 0.14 })
      return e.noise(out, { dur: 0.3, gain: 0.2, type: "highpass", freq: 2000 })
    case "poison":
      return e.noise(out, { dur: 0.35, gain: 0.1, freq: 700, q: 3, sweep: 500 })
    case "drink":
      for (let i = 0; i < 3; i++) e.osc(out, { freq: 300 + i * 40, slide: 120, dur: 0.12, gain: 0.05, t0: e.now + i * 0.13 })
      return
    case "click":
      return e.osc(out, { type: "triangle", freq: 1400, dur: 0.035, gain: 0.05, a: 0.002 })
    case "open":
      e.noise(out, { dur: 0.12, gain: 0.05, freq: 1800, q: 1, sweep: 800 })
      return e.osc(out, { type: "triangle", freq: 520, dur: 0.08, gain: 0.04 })
    case "close":
      e.noise(out, { dur: 0.1, gain: 0.04, freq: 1500, q: 1, sweep: -700 })
      return e.osc(out, { type: "triangle", freq: 420, dur: 0.07, gain: 0.035 })
    case "splash":
      return e.noise(out, { dur: 0.4, gain: 0.25, freq: 800, q: 0.8, sweep: 1500 })
  }
}
