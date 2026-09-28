import { ATTRIBUTES, SKILLS, SKILL_IDS, RACES, CLASSES, BIRTHSIGNS } from "../data/stats.js"
import { makeItemFromSpec } from "./items.js"

// Morrowind-style: skills rise by use, every 10 major/minor skill increases
// earns a level, and attribute multipliers depend on which skills you trained.
export const SKILL_GAIN_RATE = 1.6

export function createCharacter({ name, race, cls, sign }) {
  const R = RACES[race]
  const C = CLASSES[cls]
  const S = BIRTHSIGNS[sign]
  const attrs = { ...R.attrs }
  for (const a of C.attrs) attrs[a] += 10
  for (const [a, v] of Object.entries(S.attrs || {})) attrs[a] += v

  const skills = {}
  for (const id of SKILL_IDS) {
    let v = C.major.includes(id) ? 30 : C.minor.includes(id) ? 15 : 5
    if (SKILLS[id].spec === C.spec) v += 5
    v += R.skills[id] || 0
    v += S.skills?.[id] || 0
    skills[id] = Math.min(100, v)
  }

  const c = {
    name: name || "Outlander",
    race,
    cls,
    sign,
    level: 1,
    attrs,
    skills,
    skillProgress: Object.fromEntries(SKILL_IDS.map(id => [id, 0])),
    levelProgress: 0,
    attrSkillUps: Object.fromEntries(ATTRIBUTES.map(a => [a, 0])),
    baseHealth: Math.round((attrs.strength + attrs.endurance) / 2),
    health: 0,
    magicka: 0,
    fatigue: 0,
    gold: 60,
    inventory: [],
    equipment: {},
    spells: [...new Set([...(C.spells || []), ...(S.spells || [])])],
    powers: [R.power, S.power].filter(Boolean),
    powersUsed: {},
    selectedSpell: null,
    factions: {},
    effects: [],
    poison: 0,
    stats: { kills: 0, dungeonsCleared: 0, questsDone: 0, goldEarned: 0, skillUps: 0, deepest: 0, spellsCast: 0 },
  }
  c.selectedSpell = c.spells[0] || c.powers[0] || null
  for (const spec of C.kit) {
    const item = makeItemFromSpec(spec)
    addItem(c, item)
    autoEquip(c, item)
  }
  c.health = maxHealth(c)
  c.magicka = maxMagicka(c)
  c.fatigue = maxFatigue(c)
  // Quick-slots 1–9: start with known spells and powers, then a healing potion.
  c.quickslots = Array(9).fill(null)
  let n = 0
  for (const id of [...c.spells, ...c.powers]) if (n < 8) c.quickslots[n++] = { type: "spell", id }
  const potion = c.inventory.find(i => i.kind === "potion" && i.effect === "heal")
  if (potion) c.quickslots[n] = slotForItem(potion)
  return c
}

// A quick-slot entry for an item. Stackable items are tracked by kind, so the
// slot keeps working when a stack runs out and is replaced by a new one.
export function slotForItem(item) {
  return item.stackKey ? { type: "item", stackKey: item.stackKey, name: item.name } : { type: "item", uid: item.uid, name: item.name }
}

export function itemForSlot(c, slot) {
  if (!slot || slot.type !== "item") return null
  return c.inventory.find(i => (slot.stackKey ? i.stackKey === slot.stackKey : i.uid === slot.uid)) || null
}

export function assignQuickslot(c, index, entry) {
  c.quickslots ||= Array(9).fill(null)
  // one thing per slot, and each thing in only one slot
  c.quickslots = c.quickslots.map(s => (s && entry && sameSlot(s, entry) ? null : s))
  c.quickslots[index] = entry
}

function sameSlot(a, b) {
  if (a.type !== b.type) return false
  if (a.type === "spell") return a.id === b.id
  return a.stackKey ? a.stackKey === b.stackKey : a.uid === b.uid
}

// ---------- derived stats ----------

function equipmentBonus(c, attr) {
  let v = 0
  for (const item of Object.values(c.equipment)) if (item?.enchant?.attr === attr) v += item.enchant.amount
  return v
}

function effectBonus(c, type, key) {
  let v = 0
  for (const e of c.effects) if (e.type === type && (key === undefined || e.key === key)) v += e.amount
  return v
}

export function getAttr(c, a) {
  return Math.max(0, c.attrs[a] + equipmentBonus(c, a) + effectBonus(c, "fortify", a))
}

export function getSkill(c, s) {
  return c.skills[s]
}

export function maxHealth(c) {
  return Math.round(c.baseHealth)
}

export function magickaMult(c) {
  return 1 + (RACES[c.race].magickaMult || 0) + (BIRTHSIGNS[c.sign].magickaMult || 0)
}

export function maxMagicka(c) {
  return Math.round(getAttr(c, "intelligence") * magickaMult(c))
}

export function maxFatigue(c) {
  return Math.round(getAttr(c, "strength") + getAttr(c, "willpower") + getAttr(c, "agility") + getAttr(c, "endurance"))
}

export function fatigueRatio(c) {
  return Math.max(0, Math.min(1, c.fatigue / Math.max(1, maxFatigue(c))))
}

const ARMOR_SLOT_WEIGHTS = { cuirass: 0.3, helm: 0.1, greaves: 0.1, boots: 0.1, gauntlets: 0.1, shield: 0.1 }

export function armorRating(c) {
  let ar = 0
  let empty = 0
  for (const [slot, w] of Object.entries(ARMOR_SLOT_WEIGHTS)) {
    const item = c.equipment[slot]
    if (item && item.armorClass) {
      ar += item.ar * (0.3 + getSkill(c, item.armorClass) / 100)
    } else if (slot !== "shield") {
      empty += w
    }
  }
  ar += empty * getSkill(c, "unarmored") * 0.6
  ar += effectBonus(c, "shield")
  return Math.round(ar)
}

export function resistance(c, element) {
  let r = RACES[c.race].resist?.[element] || 0
  r += BIRTHSIGNS[c.sign].resist?.[element] || 0
  for (const item of Object.values(c.equipment)) if (item?.enchant?.resist === element) r += item.enchant.amount
  r += effectBonus(c, "resist", element)
  if (element !== "magic" && element !== "poison") r += Math.max(0, resistance(c, "magic") * 0.5)
  return Math.min(1, r)
}

export function carryCapacity(c) {
  return getAttr(c, "strength") * 5
}

export function encumbrance(c) {
  return c.inventory.reduce((sum, it) => sum + it.weight * (it.qty || 1), 0)
}

export function moveSpeed(c) {
  const base = 3.2 + getAttr(c, "speed") / 30 + getSkill(c, "athletics") / 45
  const over = encumbrance(c) > carryCapacity(c)
  return over ? base * 0.4 : base
}

export function jumpVelocity(c) {
  return 4.2 + getSkill(c, "acrobatics") / 30 + effectBonus(c, "jump")
}

// ---------- inventory ----------

export function addItem(c, item) {
  if (item.stackKey) {
    const existing = c.inventory.find(i => i.stackKey === item.stackKey)
    if (existing) {
      existing.qty += item.qty || 1
      return existing
    }
  }
  c.inventory.push(item)
  return item
}

export function removeItem(c, item, qty = 1) {
  if (item.stackKey && item.qty > qty) {
    item.qty -= qty
    return
  }
  c.inventory = c.inventory.filter(i => i !== item)
  for (const [slot, eq] of Object.entries(c.equipment)) if (eq === item) delete c.equipment[slot]
}

export function slotFor(item) {
  if (item.kind === "weapon") return "weapon"
  if (item.kind === "ammo") return "ammo"
  if (item.kind === "armor") {
    if (item.slot === "ring") return "ring"
    return item.slot
  }
  return null
}

export function equip(c, item) {
  const slot = slotFor(item)
  if (!slot) return false
  if (slot === "shield" && c.equipment.weapon?.twoHanded) delete c.equipment.weapon
  if (slot === "weapon" && item.twoHanded) delete c.equipment.shield
  c.equipment[slot] = item
  return true
}

export function unequip(c, item) {
  for (const [slot, eq] of Object.entries(c.equipment)) if (eq === item) delete c.equipment[slot]
}

export function isEquipped(c, item) {
  return Object.values(c.equipment).includes(item)
}

function autoEquip(c, item) {
  const slot = slotFor(item)
  if (slot && !c.equipment[slot]) equip(c, item)
}

// ---------- progression ----------

export function skillType(c, skill) {
  const C = CLASSES[c.cls]
  if (C.major.includes(skill)) return "major"
  if (C.minor.includes(skill)) return "minor"
  return "misc"
}

export function skillRequirement(c, skill) {
  const type = skillType(c, skill)
  let mult = type === "major" ? 0.75 : type === "minor" ? 1 : 1.25
  if (SKILLS[skill].spec === CLASSES[c.cls].spec) mult *= 0.8
  return (c.skills[skill] + 1) * mult
}

// Returns a list of events describing what happened.
export function exerciseSkill(c, skill, amount = 1) {
  const events = []
  if (c.skills[skill] >= 100) return events
  c.skillProgress[skill] += amount * SKILL_GAIN_RATE
  while (c.skillProgress[skill] >= skillRequirement(c, skill) && c.skills[skill] < 100) {
    c.skillProgress[skill] -= skillRequirement(c, skill)
    events.push(...raiseSkill(c, skill))
  }
  return events
}

export function raiseSkill(c, skill, countsForLevel = true) {
  const events = []
  c.skills[skill] = Math.min(100, c.skills[skill] + 1)
  c.stats.skillUps++
  events.push({ type: "skillUp", skill, value: c.skills[skill] })
  c.attrSkillUps[SKILLS[skill].attr]++
  const type = skillType(c, skill)
  if (countsForLevel && type !== "misc") {
    c.levelProgress++
    if (c.levelProgress === 10) events.push({ type: "levelReady" })
  }
  return events
}

export function canLevelUp(c) {
  return c.levelProgress >= 10
}

export function attrMultiplier(c, attr) {
  if (attr === "luck") return 1
  const n = c.attrSkillUps[attr]
  if (n >= 10) return 5
  if (n >= 8) return 4
  if (n >= 5) return 3
  if (n >= 1) return 2
  return 1
}

export function levelUp(c, chosen) {
  if (!canLevelUp(c) || chosen.length !== 3) return false
  for (const a of chosen) c.attrs[a] = Math.min(100, c.attrs[a] + attrMultiplier(c, a))
  c.level++
  c.levelProgress -= 10
  c.baseHealth += c.attrs.endurance / 10
  for (const a of ATTRIBUTES) c.attrSkillUps[a] = 0
  c.health = maxHealth(c)
  return true
}

// ---------- timed effects ----------

export function addEffect(c, effect) {
  // Refresh rather than stack identical buffs.
  const existing = c.effects.find(e => e.type === effect.type && e.key === effect.key)
  if (existing) {
    existing.remaining = Math.max(existing.remaining, effect.remaining)
    existing.amount = Math.max(existing.amount, effect.amount)
    return
  }
  c.effects.push({ ...effect })
}

export function hasEffect(c, type) {
  return c.effects.some(e => e.type === type)
}

export function effectAmount(c, type) {
  return effectBonus(c, type)
}

export function tickEffects(c, dt) {
  const expired = []
  for (const e of c.effects) {
    e.remaining -= dt
    if (e.remaining <= 0) expired.push(e)
  }
  if (expired.length) c.effects = c.effects.filter(e => e.remaining > 0)
  return expired
}

// ---------- factions ----------

export function factionRank(c, id) {
  return c.factions[id]?.rank ?? -1
}
