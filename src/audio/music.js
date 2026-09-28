// The adaptive score: a look-ahead sequencer that plays generated phrases in
// the current region's mode, and crossfades layers (pad, lead, colour, bass,
// drums, choir) as you move between wilderness, towns, dungeons and combat.
import { pickMood, generatePhrase, degreeToMidi, chordDegrees, MAIN_THEME, THEME_HEAD, PRESETS } from "../logic/musictheory.js"

const LAYERS = ["pad", "lead", "color", "bass", "drums", "choir"]
const THEME_CHORDS = [0, 6, 0, 4, 2, 3, 4, 0]
const OCTAVE = { flute: 24, horn: 12, strings: 12, choir: 12, bells: 24, pluck: 24 }

export class Music {
  constructor(engine) {
    this.e = engine
    this.state = { mode: "title" }
    this.mood = pickMood(this.state)
    this.key = this.mood.key
    this.seed = Math.floor(Math.random() * 1e6)
    this.started = false
  }

  start() {
    if (this.started || !this.e.ctx) return
    this.started = true
    const ctx = this.e.ctx
    this.main = ctx.createGain()
    this.main.connect(this.e.musicBus)
    const wet = ctx.createGain()
    wet.gain.value = 1
    this.main.connect(wet).connect(this.e.musicVerb)
    this.layer = {}
    for (const l of LAYERS) {
      const g = ctx.createGain()
      g.gain.value = 0
      g.connect(this.main)
      this.layer[l] = g
    }
    this.stingBus = ctx.createGain()
    this.stingBus.connect(this.e.musicBus)
    this.stingBus.connect(this.e.musicVerb)
    this.beat = 0
    this.nextT = ctx.currentTime + 0.1
    this.phraseIdx = 0
    this.applyLayers(0.1)
    this.timer = setInterval(() => this.schedule(), 60)
  }

  // Situation from the game: { mode, area, region, theme, inTown, night, combat, boss }.
  set(state) {
    this.state = state
    const mood = pickMood(state)
    const combatChange = Math.abs((this.mood?.layers.drums || 0) - mood.layers.drums) > 0.3
    this.mood = mood
    if (this.started) this.applyLayers(combatChange ? 0.5 : 2.2)
  }

  applyLayers(tau) {
    const t = this.e.now
    for (const l of LAYERS) this.layer[l].gain.setTargetAtTime(this.mood.layers[l], t, tau)
  }

  schedule() {
    if (!this.e.ctx || this.e.ctx.state !== "running") return
    const ahead = this.e.now + 0.3
    while (this.nextT < ahead) {
      this.playBeat(this.beat, this.nextT)
      this.nextT += 60 / this.mood.bpm
      this.beat++
    }
  }

  playBeat(beat, t) {
    const b = beat % 4
    const bar = Math.floor(beat / 4)
    const spb = 60 / this.mood.bpm
    const title = this.state.mode === "title"
    if (!title && ((b === 0 && bar % 4 === 0) || !this.phrase)) {
      // new phrase: the key may change only here, so transitions stay musical
      this.key = this.mood.key
      this.phrase = generatePhrase(this.seed, this.key, this.phraseIdx++, this.mood.preset.density)
    }
    const p = PRESETS[title ? "title" : this.key]
    const mode = p.mode
    const root = p.root
    const e = this.e
    let chord
    let notes = []
    if (title) {
      const tb = bar % 8
      chord = THEME_CHORDS[tb]
      if (b === 0) notes = themeBar(MAIN_THEME, tb)
    } else {
      const pb = this.phrase[bar % 4]
      chord = pb.chord
      if (b === 0) notes = pb.notes
    }
    const deg = d => degreeToMidi(root, mode, d)

    // pad: one sustained chord per bar
    if (b === 0) {
      e.padCutoff = this.state.night ? 500 : this.state.area === "dungeon" ? 600 : 800
      for (const d of chordDegrees(chord, mode === "dorian" || mode === "aeolian")) e.instrument("pad", this.layer.pad, deg(d) + 12, t, spb * 4)
    }
    // lead melody
    const lead = this.state.night && !title && p.lead === "flute" ? "strings" : p.lead
    for (const n of notes) e.instrument(lead, this.layer.lead, deg(n.deg) + (OCTAVE[lead] ?? 12) - 12, t + n.beat * spb, n.beats * spb * 0.95, 0.9)
    // colour instruments
    for (const c of p.colors) {
      if (c === "pluck") {
        const arp = chordDegrees(chord).map(d => deg(d) + 24)
        for (let i = 0; i < 2; i++) e.instrument("pluck", this.layer.color, arp[(b * 2 + i) % arp.length], t + i * spb * 0.5, spb * 0.5, 0.7)
      } else if (c === "bells" && b === 2 && Math.random() < 0.5) e.instrument("bells", this.layer.color, deg(chord + 7 * 3), t, spb * 2, 0.8)
      else if (c === "strings" && b === 0) e.instrument("strings", this.layer.color, deg(chord + 4) + 12, t, spb * 4, 0.6)
      else if (c === "drone" && b === 0 && bar % 2 === 0) e.instrument("drone", this.layer.color, root, t, spb * 8, 1)
      else if (c === "frame" && (b === 0 || (b === 2 && Math.random() < 0.6))) e.instrument("frame", this.layer.color, 0, t, spb, 0.8)
      else if (c === "heart") e.instrument("heart", this.layer.color, 0, t, spb, 1)
    }
    // bass
    if (b === 0 || (this.mood.layers.drums > 0.3 && b === 2)) e.instrument("bass", this.layer.bass, deg(chord), t, spb * 2, 0.9)
    if (this.mood.layers.drums > 0.3) {
      // driving ostinato under combat
      e.instrument("bass", this.layer.drums, deg(chord), t + spb * 0.5, spb * 0.4, 0.5)
    }
    // war drums
    if (this.mood.layers.drums > 0.05) {
      if (b === 0 || b === 2) e.instrument("taiko", this.layer.drums, 0, t, spb, b === 0 ? 1 : 0.7)
      if (b === 3) {
        e.instrument("tom", this.layer.drums, 0, t, spb, 0.8)
        e.instrument("tom", this.layer.drums, 0, t + spb * 0.5, spb, 0.6)
      }
      e.instrument("shaker", this.layer.drums, 0, t, spb, 0.8)
      e.instrument("shaker", this.layer.drums, 0, t + spb * 0.5, spb, 0.5)
    }
    // choir
    if (b === 0 && bar % 2 === 0 && this.mood.layers.choir > 0) {
      for (const d of chordDegrees(chord)) e.instrument("choir", this.layer.choir, deg(d) + 12, t, spb * 8, 0.8)
    }
  }

  // Short cues over the score: level-up, victory, death, discovery.
  sting(name) {
    if (!this.started) return
    const e = this.e
    const t = e.now + 0.05
    const duck = (len, to = 0.25) => {
      this.main.gain.cancelScheduledValues(t)
      this.main.gain.setTargetAtTime(to, t, 0.15)
      this.main.gain.setTargetAtTime(1, t + len, 1.2)
    }
    const play = (inst, root, mode, notes, spb, chords) => {
      let beat = 0
      for (const [d, beats] of notes) {
        e.instrument(inst, this.stingBus, degreeToMidi(root, mode, d + 7) + (OCTAVE[inst] ?? 12) - 12, t + beat * spb, beats * spb * 0.95, 1)
        beat += beats
      }
      for (const [at, c, len] of chords || []) for (const d of chordDegrees(c)) e.instrument("strings", this.stingBus, degreeToMidi(root, mode, d) + 12, t + at * spb, len * spb, 0.8)
      return beat * spb
    }
    if (name === "levelup") {
      const len = play("horn", 38, "ionian", [...THEME_HEAD, [4, 2]], 0.3, [[0, 0, 4], [4, 4, 2]])
      duck(len + 0.6)
    } else if (name === "victory") {
      const len = play("horn", 38, "ionian", MAIN_THEME, 0.42, [[0, 0, 8], [8, 6, 8], [16, 3, 8], [24, 4, 4], [28, 0, 4]])
      for (let i = 0; i < 16; i++) e.instrument("taiko", this.stingBus, 0, t + i * 0.42 * 2, 0.4, 0.6)
      duck(len + 1, 0.05)
    } else if (name === "death") {
      const len = play("strings", 38, "aeolian", [[4, 2], [3, 1], [2, 1], [1, 2], [0, 4]], 0.6, [[0, 0, 6], [6, 5, 4]])
      duck(len + 1.5, 0.1)
    } else if (name === "discover") {
      play("bells", 38, PRESETS[this.key]?.mode || "dorian", [[0, 1], [4, 1], [7, 2]], 0.28)
    }
  }
}

function themeBar(theme, barIndex) {
  const out = []
  let beat = 0
  for (const [d, beats] of theme) {
    const bar = Math.floor(beat / 4 + 1e-6)
    if (bar === barIndex) out.push({ deg: d + 7, beat: beat - bar * 4, beats })
    beat += beats
  }
  return out
}
