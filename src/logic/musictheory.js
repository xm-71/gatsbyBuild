// Pure music logic for the adaptive score: modes, regional presets, the main
// theme, and seeded phrase generation. No WebAudio here, so it can be tested.
import { RNG } from "../core/rng.js"

export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
}

// Root notes as MIDI numbers (around the second octave, for pads and bass).
const N = { C: 36, Db: 37, D: 38, Eb: 39, E: 40, F: 41, Gb: 42, G: 43, Ab: 44, A: 45, Bb: 46, B: 47 }

// Each preset: key, tempo, how busy the melody is (0..1), the lead instrument,
// and which extra colours play. Layers are faded in and out by the engine.
export const PRESETS = {
  title: { root: N.D, mode: "dorian", bpm: 64, density: 0.7, lead: "horn", colors: ["strings"] },
  ascadian: { root: N.F, mode: "lydian", bpm: 70, density: 0.6, lead: "flute", colors: ["pluck"] },
  grazelands: { root: N.G, mode: "mixolydian", bpm: 72, density: 0.55, lead: "flute", colors: ["pluck"] },
  bitterCoast: { root: N.E, mode: "aeolian", bpm: 60, density: 0.4, lead: "strings", colors: [] },
  westGash: { root: N.D, mode: "dorian", bpm: 66, density: 0.5, lead: "horn", colors: ["strings"] },
  azurasCoast: { root: N.A, mode: "mixolydian", bpm: 66, density: 0.45, lead: "flute", colors: ["bells"] },
  ashlands: { root: N.E, mode: "phrygian", bpm: 58, density: 0.3, lead: "horn", colors: ["drone"] },
  molagAmur: { root: N.Db, mode: "phrygian", bpm: 56, density: 0.25, lead: "horn", colors: ["drone", "frame"] },
  redMountain: { root: N.D, mode: "harmonicMinor", bpm: 54, density: 0.25, lead: "choir", colors: ["drone"] },
  town: { root: N.G, mode: "dorian", bpm: 84, density: 0.6, lead: "flute", colors: ["pluck", "frame"] },
  cave: { root: N.C, mode: "aeolian", bpm: 52, density: 0.2, lead: "strings", colors: ["drone"] },
  tomb: { root: N.D, mode: "phrygian", bpm: 50, density: 0.2, lead: "choir", colors: ["drone"] },
  dwemer: { root: N.Bb, mode: "dorian", bpm: 56, density: 0.3, lead: "bells", colors: ["drone"] },
  daedric: { root: N.Db, mode: "harmonicMinor", bpm: 54, density: 0.25, lead: "choir", colors: ["drone", "frame"] },
  citadel: { root: N.D, mode: "phrygian", bpm: 60, density: 0.25, lead: "choir", colors: ["drone", "heart"] },
}

// Chord roots (scale degrees) for four-bar phrases.
const PROGRESSIONS = {
  bright: [[0, 4, 5, 3], [0, 3, 4, 0], [0, 5, 3, 4], [0, 1, 3, 0]],
  modal: [[0, 6, 5, 6], [0, 3, 6, 0], [0, 5, 6, 0], [0, 2, 3, 0]],
  dark: [[0, 1, 0, 6], [0, 5, 1, 0], [0, 3, 1, 0], [0, 6, 5, 1]],
}

export function progressionFamily(mode) {
  if (mode === "ionian" || mode === "lydian" || mode === "mixolydian") return "bright"
  if (mode === "phrygian" || mode === "harmonicMinor") return "dark"
  return "modal"
}

// MIDI note for a scale degree (degrees past 6 or below 0 move octaves).
export function degreeToMidi(root, mode, degree) {
  const s = MODES[mode]
  const oct = Math.floor(degree / 7)
  const i = ((degree % 7) + 7) % 7
  return root + oct * 12 + s[i]
}

export const midiToFreq = m => 440 * Math.pow(2, (m - 69) / 12)

// A triad (plus optional seventh) stacked in thirds on a scale degree.
export function chordDegrees(degree, seventh = false) {
  return seventh ? [degree, degree + 2, degree + 4, degree + 6] : [degree, degree + 2, degree + 4]
}

// The Ashfall theme: an original heroic motif, as [scale degree, beats].
// Degree 0 is the tonic; the lead plays it two octaves above the pad root.
export const MAIN_THEME = [
  [0, 2], [4, 1], [3, 0.5], [2, 0.5], [1, 1.5], [2, 0.5], [0, 2],
  [0, 1], [4, 1], [5, 1], [4, 1], [3, 1], [2, 1], [1, 2],
  [2, 1], [3, 1], [4, 2], [5, 1], [4, 1], [3, 1], [2, 1],
  [1, 1.5], [0, 0.5], [1, 1], [-3, 1], [0, 4],
]
export const THEME_HEAD = MAIN_THEME.slice(0, 4)

// Pick the preset and layer levels for the current situation.
export function pickMood({ mode = "play", area = "overworld", region = "ascadian", theme = "cave", inTown = false, night = false, combat = 0, boss = false }) {
  let key
  if (mode === "title") key = "title"
  else if (area === "dungeon") key = theme in PRESETS ? theme : "cave"
  else if (inTown) key = "town"
  else key = region in PRESETS ? region : "ascadian"
  const p = PRESETS[key]
  const calm = 1 - Math.min(1, combat)
  const layers = {
    pad: 0.8,
    lead: (mode === "title" ? 1 : night && area !== "dungeon" ? 0.45 : 0.8) * (0.35 + 0.65 * calm),
    color: 0.7 * calm + 0.2,
    bass: area === "dungeon" ? 0.5 : 0.25 + combat * 0.6,
    drums: Math.min(1, combat * 1.2) + (boss ? 0.2 : 0),
    choir: boss ? 0.8 : key === "tomb" || key === "citadel" || key === "redMountain" ? 0.3 : 0,
  }
  const bpm = Math.round(p.bpm * (1 + combat * 0.55 + (boss ? 0.15 : 0)) * (night && !combat ? 0.9 : 1))
  return { key, preset: p, layers, bpm, night }
}

// Generate a bar of lead melody as [{deg, beat, beats}] over a chord.
// Walks chord and scale tones with a seeded RNG; leaps settle by step.
export function generateBar(rng, chordRoot, density, prevDeg = 7) {
  const notes = []
  const chord = chordDegrees(chordRoot).map(d => d + 7)
  let beat = 0
  let deg = prevDeg
  const rhythms = density > 0.5 ? [[1, 1, 1, 1], [1.5, 0.5, 1, 1], [2, 1, 1], [1, 0.5, 0.5, 2]] : density > 0.3 ? [[2, 2], [3, 1], [2, 1, 1], [4]] : [[4], [2, 2], [3, 1]]
  const rhythm = rng.pick(rhythms)
  for (const beats of rhythm) {
    const rest = rng.next() > 0.35 + density * 0.6
    if (!rest) {
      const onBeat = beat === 0 || beat === 2
      if (onBeat || rng.chance(0.4)) {
        // nearest chord tone, up or down
        const options = chord.flatMap(c => [c, c + 7, c - 7]).filter(c => Math.abs(c - deg) <= 4)
        deg = options.length ? rng.pick(options) : chord[0]
      } else deg += rng.pick([-1, 1, 1, -2, 2])
      deg = Math.max(3, Math.min(13, deg))
      notes.push({ deg, beat, beats })
    }
    beat += beats
  }
  return { notes, last: deg }
}

// A four-bar phrase; sometimes the main theme's head, transposed into the current mode.
export function generatePhrase(seed, key, phraseIndex, density) {
  const rng = new RNG(`music:${seed}:${key}:${phraseIndex}`)
  const family = progressionFamily(PRESETS[key]?.mode || "dorian")
  const prog = rng.pick(PROGRESSIONS[family])
  const bars = []
  const quote = phraseIndex % 4 === 3 && rng.chance(0.7)
  let last = 7
  for (let b = 0; b < 4; b++) {
    if (quote && b < 2) {
      const src = b === 0 ? MAIN_THEME.slice(0, 4) : MAIN_THEME.slice(4, 7)
      let beat = 0
      const notes = src.map(([d, beats]) => {
        const n = { deg: d + 7, beat, beats }
        beat += beats
        return n
      })
      bars.push({ chord: prog[b], notes })
      last = notes[notes.length - 1].deg
    } else {
      const bar = generateBar(rng, prog[b], density, last)
      last = bar.last
      bars.push({ chord: prog[b], notes: bar.notes })
    }
  }
  return bars
}
