import * as N from "../data/names.js"

const cap = s => s.charAt(0).toUpperCase() + s.slice(1)

export function npcName(rng, race) {
  switch (race) {
    case "nord": return `${rng.pick(N.NORD_FIRST)} ${rng.pick(N.NORD_LAST)}`
    case "imperial":
    case "breton":
    case "redguard": return `${rng.pick(N.IMP_FIRST)} ${rng.pick(N.IMP_LAST)}`
    case "khajiit": return rng.pick(N.KHAJIIT)
    case "argonian": return `${rng.pick(N.ARGONIAN_A)}-${rng.pick(N.ARGONIAN_B)}`
    case "altmer":
    case "bosmer": return cap(rng.pick(N.ALTMER_A) + rng.pick(N.ALTMER_B))
    case "orc": return `${rng.pick(N.ORC_FIRST)} ${rng.pick(N.ORC_LAST)}`
    default:
      return `${rng.pick(N.DUNMER_FIRST_A)}${rng.pick(N.DUNMER_FIRST_B)} ${rng.pick(N.DUNMER_LAST_A)}${rng.pick(N.DUNMER_LAST_B)}`
  }
}

export function placeName(rng, used = new Set()) {
  for (let i = 0; i < 50; i++) {
    const a = rng.pick(N.PLACE_A)
    const b = rng.pick(N.PLACE_B)
    const name = rng.chance(0.25) ? `${a} ${cap(rng.pick(N.PLACE_A).toLowerCase() + b)}` : a + b
    if (!used.has(name)) {
      used.add(name)
      return name
    }
  }
  return `Nchu${used.size}`
}

export function dungeonName(rng, type, used = new Set()) {
  for (let i = 0; i < 50; i++) {
    let name
    if (type === "dwemer") name = rng.pick(N.DWEMER_A) + rng.pick(N.DWEMER_B)
    else if (type === "daedric") name = `${rng.pick(N.DAEDRIC_A)}${rng.pick(N.DAEDRIC_B)} Shrine`.replace(/\s+/g, " ")
    else if (type === "tomb") name = `${rng.pick(N.TOMB_FAMILIES)} Ancestral Tomb`
    else if (type === "citadel") name = "Dagoth Ur Citadel"
    else name = `${placeName(rng)} ${rng.pick(N.CAVE_SUFFIX)}`
    if (!used.has(name)) {
      used.add(name)
      return name
    }
  }
  return `Forgotten Vault ${used.size}`
}

export function artifactName(rng) {
  return `${rng.pick(N.ARTIFACT_NOUNS)} of ${rng.pick(N.ARTIFACT_OWNERS)}`
}

export function bossName(rng, baseName) {
  return `${baseName} ${rng.pick(N.BOSS_EPITHETS)}`
}

export function dagothName(rng) {
  return `Dagoth ${rng.pick(N.DAGOTH_NAMES)}`
}
