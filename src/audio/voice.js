// Optional spoken greetings through the browser's built-in speech synthesis.
// Off by default (Settings → Audio); pitch and pace vary by race.
const RACE_VOICE = {
  dunmer: { pitch: 0.75, rate: 0.92 },
  altmer: { pitch: 1.05, rate: 0.88 },
  bosmer: { pitch: 1.2, rate: 1.08 },
  breton: { pitch: 1.05, rate: 1 },
  imperial: { pitch: 0.95, rate: 0.95 },
  nord: { pitch: 0.7, rate: 0.9 },
  orc: { pitch: 0.55, rate: 0.85 },
  redguard: { pitch: 0.85, rate: 0.98 },
  khajiit: { pitch: 1.1, rate: 0.85 },
  argonian: { pitch: 0.8, rate: 0.82 },
}

let lastSpoken = 0

// Speak the first sentence of a greeting. Returns false if speech is unavailable.
export function speakGreeting(text, raceId, spec = {}) {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : null
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") return false
  const now = performance.now()
  if (now - lastSpoken < 1500) return false
  lastSpoken = now
  const first = greetingLine(text)
  synth.cancel()
  const u = new SpeechSynthesisUtterance(first)
  const v = RACE_VOICE[raceId] || { pitch: 1, rate: 1 }
  const female = spec.sex === "female" || spec.female
  u.pitch = Math.max(0.1, Math.min(2, v.pitch * (female ? 1.35 : 1)))
  u.rate = v.rate
  u.volume = 0.9
  const voices = synth.getVoices().filter(x => /^en/i.test(x.lang))
  if (voices.length) {
    const want = female ? /female|woman|zira|samantha|victoria|karen|moira|fiona|susan/i : /male|man|david|daniel|alex|fred|george|arthur/i
    u.voice = voices.find(x => want.test(x.name) && !(female ? false : /female/i.test(x.name))) || voices[0]
  }
  synth.speak(u)
  return true
}

// The part of a greeting worth saying aloud: the first sentence, capped in length.
export function greetingLine(text) {
  const m = String(text).match(/^[^.!?]*[.!?]/)
  const s = (m ? m[0] : String(text)).trim()
  return s.length > 90 ? s.slice(0, 87).replace(/\s+\S*$/, "") + "…" : s
}
