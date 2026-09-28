// Formulas loosely modelled on Morrowind's, softened a little for real-time play.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

export function hitChance({ skill, agility, luck, fatigue, bonus = 0 }, evasion = 0) {
  const base = (skill + agility / 5 + luck / 10) * (0.75 + 0.5 * fatigue) + bonus + 12
  return clamp(base - evasion, 8, 98) / 100
}

export function evasionOf(agility, luck = 40, bonus = 0) {
  return agility / 5 + luck / 10 - 8 + bonus
}

export function meleeDamage(weaponDamage, strength, charge) {
  const [min, max] = weaponDamage
  const raw = min + (max - min) * clamp(charge, 0, 1)
  return raw * (0.5 + strength / 100)
}

export function applyArmor(damage, ar) {
  if (ar <= 0) return damage
  return Math.max(damage * 0.25, (damage * damage) / (damage + ar * 0.6))
}

export function spellChance({ skill, willpower, luck, fatigue }, cost) {
  return clamp((skill * 2 + willpower / 5 + luck / 10 - cost + 10) * (0.75 + 0.5 * fatigue), 0, 100) / 100
}

export function blockChance(blockSkill, agility, luck) {
  return clamp((blockSkill + agility / 5 + luck / 10) / 2.4, 0, 55) / 100
}

export function lockpickChance(security, agility, luck, lockLevel, mult = 1) {
  return clamp(((security + agility / 5 + luck / 10) * mult - lockLevel + 20) / 100, 0.02, 0.95)
}

export function buyPrice(value, { mercantile, personality, disposition }) {
  const f = 1.45 - mercantile / 250 - personality / 500 - disposition / 400
  return Math.max(1, Math.round(value * clamp(f, 0.85, 1.6)))
}

export function sellPrice(value, { mercantile, personality, disposition }) {
  const f = 0.45 + mercantile / 350 + personality / 700 + disposition / 500
  return Math.max(1, Math.floor(value * clamp(f, 0.25, 0.8)))
}

export function persuadeChance(speechcraft, personality, luck, disposition, difficulty = 0) {
  return clamp((speechcraft + personality / 5 + luck / 10 + disposition / 4 - 25 - difficulty) / 100, 0.05, 0.95)
}
