// Player preferences, kept in browser storage and shared by every run.
export const ACTIONS = [
  ["forward", "Move forward", "KeyW"],
  ["back", "Move back", "KeyS"],
  ["left", "Strafe left", "KeyA"],
  ["right", "Strafe right", "KeyD"],
  ["jump", "Jump", "Space"],
  ["sprint", "Sprint", "ShiftLeft"],
  ["sneak", "Toggle sneak", "KeyC"],
  ["activate", "Activate / talk", "KeyE"],
  ["cast", "Cast spell", "KeyF"],
  ["quaff", "Drink healing potion", "KeyQ"],
  ["rest", "Rest", "KeyT"],
  ["inventory", "Inventory", "Tab"],
  ["character", "Character", "KeyK"],
  ["map", "Map", "KeyM"],
  ["journal", "Journal", "KeyJ"],
]

const DEFAULTS = {
  sensitivity: 1,
  invertY: false,
  fov: 72,
  musicVolume: 0.5,
  sfxVolume: 0.8,
  ambienceVolume: 0.7,
  npcVoice: false,
  compass: true,
  postfx: true,
  keys: Object.fromEntries(ACTIONS.map(([id, , key]) => [id, key])),
}

const KEY = "ashfall-settings"
const listeners = new Set()

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}")
    return { ...DEFAULTS, ...raw, keys: { ...DEFAULTS.keys, ...(raw.keys || {}) } }
  } catch {
    return { ...DEFAULTS, keys: { ...DEFAULTS.keys } }
  }
}

export const settings = load()

export function updateSettings(patch) {
  Object.assign(settings, patch)
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    /* storage unavailable: settings last for this visit */
  }
  for (const fn of listeners) fn(settings)
}

// Bind a key to an action; if another action already uses it, the two swap.
export function bindKey(action, code) {
  const keys = { ...settings.keys }
  const other = Object.keys(keys).find(a => a !== action && keys[a] === code)
  if (other) keys[other] = keys[action]
  keys[action] = code
  updateSettings({ keys })
  return other
}

export function resetKeys() {
  updateSettings({ keys: { ...DEFAULTS.keys } })
}

export function onSettingsChange(fn) {
  listeners.add(fn)
  fn(settings)
}

export function keyLabel(code) {
  if (!code) return "—"
  if (code.startsWith("Key")) return code.slice(3)
  if (code.startsWith("Digit")) return code.slice(5)
  const names = { Space: "Space", ShiftLeft: "Left Shift", ShiftRight: "Right Shift", ControlLeft: "Left Ctrl", AltLeft: "Left Alt", Tab: "Tab", Backquote: "`", CapsLock: "Caps Lock", Enter: "Enter" }
  return names[code] || code.replace(/(Left|Right)$/, " $1")
}
