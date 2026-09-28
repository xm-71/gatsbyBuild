import { WEAPON_BASES, WEAPON_MATERIALS, ARMOR_SLOTS, ARMOR_MATERIALS, POTIONS, POTION_QUALITY, MISC_ITEMS, ENCHANTS, JEWELRY, AMMO, AMMO_ENCHANTS, POISONS, REPAIR_TOOLS } from "../data/items.js"
import { ARTIFACTS } from "../data/artifacts.js"
import { SKILLS } from "../data/stats.js"

let uid = 1
const nextUid = () => uid++

// After loading a save, keep new item ids clear of the restored ones.
export function reserveItemUids(maxUsed) {
  uid = Math.max(uid, maxUsed + 1)
}

const titleCase = s => s.replace(/\b\w/g, c => c.toUpperCase())

export function makeWeapon(material, base, enchant = null, qty = 1) {
  const b = WEAPON_BASES[base]
  const m = WEAPON_MATERIALS[material]
  const item = {
    uid: nextUid(),
    kind: "weapon",
    name: titleCase(`${material} ${base}`),
    material,
    base,
    skill: b.skill,
    damage: [Math.round(b.damage[0] * m.mult), Math.round(b.damage[1] * m.mult)],
    speed: b.speed,
    reach: b.reach,
    twoHanded: !!b.twoHanded,
    ranged: !!b.ranged,
    silver: !!m.silver || material === "daedric" || material === "ebony" || material === "glass",
    weight: Math.round(b.weight * (m.weightMult || 1) * 10) / 10,
    value: Math.round(b.value * m.value),
    color: m.color,
    tier: m.tier,
  }
  if (b.ammo) item.ammo = b.ammo
  if (b.crossbow) item.crossbow = true
  if (b.thrown) {
    // throwing weapons stack like ammunition and don't wear out
    item.thrown = true
    item.qty = qty
    item.stackKey = `thrown:${material}:${base}`
  } else {
    item.maxCond = maxCondition(item)
    item.cond = item.maxCond
  }
  if (enchant) applyEnchant(item, enchant)
  if (item.thrown && enchant) item.stackKey += `:${enchant.key}:${enchant.amount}`
  return item
}

export function makeArmor(material, slot, enchant = null) {
  const m = ARMOR_MATERIALS[material]
  const s = ARMOR_SLOTS[slot]
  const item = {
    uid: nextUid(),
    kind: "armor",
    name: titleCase(`${material} ${slot}`),
    material,
    slot,
    armorClass: m.class,
    ar: Math.max(1, Math.round(m.ar * s.factor)),
    weight: Math.round(m.weight * s.weight * 10) / 10,
    value: Math.round(m.value * s.value),
    color: m.color,
    tier: m.tier,
  }
  item.maxCond = maxCondition(item)
  item.cond = item.maxCond
  if (enchant) applyEnchant(item, enchant)
  return item
}

export function makePotion(type, quality = 1) {
  const p = POTIONS[type]
  const q = POTION_QUALITY[quality]
  return {
    uid: nextUid(),
    kind: "potion",
    name: `${q.name} ${p.name}`,
    stackKey: `potion:${type}:${quality}`,
    potion: type,
    effect: p.effect,
    attr: p.attr,
    element: p.element,
    amount: p.effect === "resist" ? p.amount : Math.round(p.amount * q.mult),
    duration: p.duration,
    weight: 0.5,
    value: Math.round(p.value * q.mult),
    color: p.color,
    qty: 1,
  }
}

export function makeMisc(name, qty = 1) {
  const m = MISC_ITEMS[name]
  return {
    uid: nextUid(),
    kind: "misc",
    name: titleCase(name),
    stackKey: `misc:${name}`,
    key: name,
    eat: m?.eat,
    weight: m?.weight ?? 1,
    value: m?.value ?? 1,
    qty,
  }
}

const AMMO_MATERIAL_MULT = { iron: 1, chitin: 1, steel: 1.3, silver: 1.5, orcish: 1.7, dwemer: 1.8, adamantium: 1.9, glass: 2, ebony: 2.5, daedric: 3 }

// Arrows or bolts; an enchant key ("fire", "frost", ...) makes them magical.
export function makeAmmo(type, qty, material = "iron", enchantKey = null) {
  const a = AMMO[type]
  const mult = AMMO_MATERIAL_MULT[material] || 1
  const ench = enchantKey ? AMMO_ENCHANTS[enchantKey] : null
  const item = {
    uid: nextUid(),
    kind: "ammo",
    ammoType: type,
    name: ench ? `${titleCase(material)} ${ench.name} ${a.name}` : `${titleCase(material)} ${a.name}`,
    stackKey: `ammo:${type}:${material}${ench ? ":" + enchantKey : ""}`,
    material,
    bonus: Math.round(a.bonus * mult),
    weight: type === "bolt" ? 0.15 : 0.1,
    value: Math.round(a.value * mult * (ench ? 6 : 1)),
    qty,
  }
  if (ench) item.enchant = { key: enchantKey, element: ench.element, amount: Math.round(ench.amount * (0.8 + mult * 0.3)) }
  return item
}

export function makeArrows(qty, material = "iron", enchantKey = null) {
  return makeAmmo("arrow", qty, material, enchantKey)
}

export function makeBolts(qty, material = "iron", enchantKey = null) {
  return makeAmmo("bolt", qty, material, enchantKey)
}

// The kind of ammunition an item is (old saves stored arrows without a type).
export const ammoTypeOf = item => item.ammoType || "arrow"

export function makePoison(type, qty = 1) {
  const p = POISONS[type]
  return { uid: nextUid(), kind: "poison", name: p.name, stackKey: `poison:${type}`, poison: type, ...pick(p, ["effect", "element", "amount", "duration", "hits", "color"]), weight: 0.5, value: p.value, qty }
}

export function makeRepairTool(quality = 1) {
  const t = REPAIR_TOOLS[quality]
  return { uid: nextUid(), kind: "repair", name: t.name, quality: t.quality, uses: t.uses, maxUses: t.uses, weight: quality === 4 ? 3 : 2, value: t.value }
}

// A legendary artifact, built from its base item with the overrides applied.
export function makeArtifact(id) {
  const a = ARTIFACTS[id]
  const item = a.kind === "weapon" ? makeWeapon(a.material, a.base) : makeArmor(a.material, a.slot)
  item.name = a.name
  item.artifact = id
  item.lore = a.lore
  if (a.color) item.color = a.color
  if (a.damage) item.damage = [...a.damage]
  if (a.ar) item.ar = a.ar
  if (a.weight) item.weight = a.weight
  if (a.enchant) item.enchant = { ...a.enchant, tag: "" }
  if (a.unique) item.unique = { type: a.unique, chance: a.chance, amount: a.amount }
  if (a.speedMult) item.speed = Math.round(item.speed * a.speedMult * 100) / 100
  if (a.indestructible) {
    item.indestructible = true
    delete item.cond
    delete item.maxCond
  } else {
    item.maxCond = Math.round(maxCondition(item) * 1.5)
    item.cond = item.maxCond
  }
  item.value = 4000 + (item.tier || 5) * 800
  item.tier = Math.max(item.tier || 5, 6)
  return item
}

function pick(o, keys) {
  const out = {}
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k]
  return out
}

// ---------- condition (durability) ----------

// Full condition for a weapon or armour piece; better materials last longer.
export function maxCondition(item) {
  if (item.kind === "weapon") return Math.round(300 + (item.tier || 1) * 80 + (item.weight || 0) * 2)
  if (item.kind === "armor" && item.armorClass) return Math.round(100 + (item.tier || 1) * 40 + (item.ar || 0) * 2)
  return 0
}

export function hasCondition(item) {
  return !!item && !item.indestructible && !item.thrown && (item.kind === "weapon" || (item.kind === "armor" && !!item.armorClass))
}

// Old saves predate condition: treat their gear as new.
export function ensureCondition(item) {
  if (hasCondition(item) && item.maxCond === undefined) {
    item.maxCond = maxCondition(item)
    item.cond = item.maxCond
  }
  return item
}

export function conditionRatio(item) {
  if (!hasCondition(item)) return 1
  ensureCondition(item)
  return Math.max(0, item.cond) / item.maxCond
}

export const isBroken = item => hasCondition(item) && conditionRatio(item) <= 0

// Damage scales with a weapon's condition, and armour rating with armour's.
export const weaponConditionMult = item => (hasCondition(item) ? 0.6 + 0.4 * conditionRatio(item) : 1)
export const armorConditionMult = item => (hasCondition(item) ? 0.3 + 0.7 * conditionRatio(item) : 1)

// Wear an item down; returns true when this wear broke it.
export function wear(item, amount) {
  if (!hasCondition(item) || isBroken(item)) return false
  ensureCondition(item)
  item.cond = Math.max(0, item.cond - amount)
  return item.cond <= 0
}

// Condition lost per strike (weapons) or per blow taken (armour).
export const weaponWear = dealt => 1 + dealt / 12
export const armorWear = taken => 2 + taken / 3

// One use of a hammer or tongs. roll is 0..1 (random). Returns what happened.
export function repairWithTool(armorer, strength, luck, tool, item, roll = Math.random()) {
  ensureCondition(item)
  const chance = Math.min(0.95, 0.3 + ((armorer + strength / 10 + luck / 10) / 100) * tool.quality * 0.7)
  tool.uses--
  const toolBroke = tool.uses <= 0
  if (roll > chance) return { success: false, amount: 0, toolBroke }
  // a share of the item's full condition, growing with skill and tool quality
  const amount = Math.max(1, Math.round(item.maxCond * tool.quality * (0.04 + armorer / 400) * (0.8 + roll * 0.4)))
  const before = item.cond
  item.cond = Math.min(item.maxCond, item.cond + amount)
  return { success: true, amount: item.cond - before, toolBroke }
}

// What a smith charges to restore an item fully.
export function repairCost(item) {
  if (!hasCondition(item)) return 0
  ensureCondition(item)
  const missing = 1 - item.cond / item.maxCond
  return missing <= 0 ? 0 : Math.max(2, Math.round(item.value * missing * 0.35 + 3))
}

// ---------- attack types ----------

export const ATTACK_TYPES = ["chop", "slash", "thrust"]

// Damage range for one attack type, from the weapon's profile.
export function attackDamage(item, type) {
  const att = WEAPON_BASES[item.base]?.att || [1, 1, 1]
  const k = att[Math.max(0, ATTACK_TYPES.indexOf(type))]
  return [Math.max(1, Math.round(item.damage[0] * k)), Math.max(1, Math.round(item.damage[1] * k))]
}

// Moving forward thrusts, strafing slashes, standing or backing off chops.
export function attackTypeFor(forward, strafe) {
  if (forward > 0.3 && Math.abs(strafe) < forward) return "thrust"
  if (Math.abs(strafe) > 0.3) return "slash"
  return "chop"
}

export function makeLockpick(quality = 1, qty = 1) {
  const q = [
    { name: "Apprentice's Lockpick", mult: 1 },
    { name: "Journeyman's Lockpick", mult: 1.3 },
    { name: "Master's Lockpick", mult: 1.8 },
  ][quality - 1]
  return { uid: nextUid(), kind: "lockpick", name: q.name, stackKey: `lockpick:${quality}`, mult: q.mult, weight: 0.25, value: 15 * quality, qty }
}

export function makeQuestItem(name, questId) {
  return { uid: nextUid(), kind: "quest", name, questId, weight: 1, value: 0, qty: 1 }
}

export function makeJewelry(rng, tier) {
  const slot = rng.chance(0.6) ? "ring" : "amulet"
  const j = JEWELRY[slot]
  const ench = rollEnchant(rng, "armor", tier)
  const item = {
    uid: nextUid(),
    kind: "armor",
    slot,
    armorClass: null,
    ar: 0,
    name: `${rng.pick(["Silver", "Gold", "Ebony", "Glass", "Bone", "Dwemer"])} ${rng.pick(j.names)}`,
    weight: 0.2,
    value: j.value * tier,
    color: 0xd8b040,
    tier,
  }
  applyEnchant(item, ench)
  return item
}

function applyEnchant(item, enchant) {
  item.enchant = enchant
  item.name = `${item.name} ${enchant.tag}`
  item.value = Math.round(item.value * 1.5 + 60 * (enchant.power || 1))
}

export function rollEnchant(rng, kind, tier) {
  const e = rng.pick(ENCHANTS[kind])
  const scale = 0.5 + tier * 0.25
  const raw = rng.range(e.min, e.max) * scale
  const amount = e.resist ? Math.min(0.75, Math.round(raw * 100) / 100) : Math.round(raw)
  return { ...e, amount, power: tier }
}

// Parse kit strings like "steel longsword", "potion:health", "arrows:40".
export function makeItemFromSpec(spec) {
  if (spec.startsWith("potion:")) {
    const [, type, q] = spec.split(":")
    return makePotion(type, q ? Number(q) : 1)
  }
  if (spec.startsWith("arrows:")) return makeArrows(Number(spec.split(":")[1]))
  if (spec.startsWith("bolts:")) return makeBolts(Number(spec.split(":")[1]))
  if (spec.startsWith("poison:")) return makePoison(spec.split(":")[1])
  if (spec.startsWith("hammer")) return makeRepairTool(Number(spec.split(":")[1] || 1))
  if (spec === "lockpick") return makeLockpick(1)
  if (spec.includes(":")) {
    // "iron dart:20": a stack of throwing weapons
    const [what, n] = spec.split(":")
    const item = makeItemFromSpec(what)
    if (item.stackKey) item.qty = Number(n)
    return item
  }
  for (const material of Object.keys(ARMOR_MATERIALS).sort((a, b) => b.length - a.length)) {
    if (spec.startsWith(material + " ")) {
      const rest = spec.slice(material.length + 1)
      if (ARMOR_SLOTS[rest]) return makeArmor(material, rest)
    }
  }
  for (const material of Object.keys(WEAPON_MATERIALS)) {
    if (spec.startsWith(material + " ")) {
      const rest = spec.slice(material.length + 1)
      if (WEAPON_BASES[rest]) return makeWeapon(material, rest)
    }
  }
  if (MISC_ITEMS[spec]) return makeMisc(spec)
  throw new Error(`Unknown item spec: ${spec}`)
}

function pickMaterial(rng, table, tier) {
  const options = Object.entries(table).filter(([, m]) => m.tier <= tier && m.tier >= tier - 3)
  const weighted = options.map(([k, m]) => ({ k, weight: 1 + m.tier }))
  return rng.weighted(weighted).k
}

const THROWN = Object.keys(WEAPON_BASES).filter(k => WEAPON_BASES[k].thrown)
const HELD = Object.keys(WEAPON_BASES).filter(k => !WEAPON_BASES[k].thrown)

export function randomWeapon(rng, tier, enchantChance = 0) {
  const material = pickMaterial(rng, WEAPON_MATERIALS, tier)
  if (rng.chance(0.14)) return makeWeapon(material, rng.pick(THROWN), rng.chance(enchantChance) ? rollEnchant(rng, "weapon", tier) : null, rng.int(6, 20))
  const base = rng.pick(HELD)
  return makeWeapon(material, base, rng.chance(enchantChance) ? rollEnchant(rng, "weapon", tier) : null)
}

// Arrows or bolts, sometimes enchanted at higher tiers.
export function randomAmmo(rng, tier) {
  const material = rng.pick(["iron", "steel", "silver", "orcish", "dwemer", "glass", "ebony", "daedric"].filter((m, i) => i <= tier + 1))
  const ench = tier >= 2 && rng.chance(0.15 + tier * 0.05) ? rng.pick(Object.keys(AMMO_ENCHANTS)) : null
  const n = ench ? rng.int(4, 12) : rng.int(8, 25)
  return rng.chance(0.6) ? makeArrows(n, material, ench) : makeBolts(n, material, ench)
}

export function randomPoison(rng, tier) {
  const options = Object.keys(POISONS).filter(k => POISONS[k].value <= 40 + tier * 30)
  return makePoison(rng.pick(options.length ? options : ["venom"]), rng.int(1, 2))
}

export function randomArmor(rng, tier, enchantChance = 0) {
  const material = pickMaterial(rng, ARMOR_MATERIALS, tier)
  const slot = rng.pick(Object.keys(ARMOR_SLOTS))
  return makeArmor(material, slot, rng.chance(enchantChance) ? rollEnchant(rng, "armor", tier) : null)
}

export function randomPotion(rng, tier) {
  const type = rng.weighted([
    { k: "health", weight: 5 },
    { k: "magicka", weight: 3 },
    { k: "fatigue", weight: 2 },
    { k: "curePoison", weight: 1 },
    { k: "fortifyStrength", weight: 0.7 },
    { k: "resistFire", weight: 0.7 },
  ]).k
  const q = Math.max(0, Math.min(3, Math.floor(rng.range(0, 1 + tier * 0.45))))
  return makePotion(type, q)
}

export function randomMisc(rng, tag) {
  const options = Object.entries(MISC_ITEMS).filter(([, m]) => m.tags.includes(tag) || m.tags.includes("any"))
  const [name] = rng.pick(options.length ? options : Object.entries(MISC_ITEMS))
  return makeMisc(name, rng.int(1, 3))
}

// Loot for chests / corpses. `tier` is 1..7.
export function randomLoot(rng, tier, tag = "any", count = null) {
  const items = []
  const n = count ?? rng.int(1, 3)
  const enchantChance = 0.05 + tier * 0.06
  for (let i = 0; i < n; i++) {
    const roll = rng.next()
    if (roll < 0.2) items.push(randomWeapon(rng, tier, enchantChance))
    else if (roll < 0.42) items.push(randomArmor(rng, tier, enchantChance))
    else if (roll < 0.7) items.push(randomPotion(rng, tier))
    else if (roll < 0.9) items.push(randomMisc(rng, tag))
    else if (roll < 0.95) {
      const r = rng.next()
      if (r < 0.45) items.push(randomAmmo(rng, tier))
      else if (r < 0.65) items.push(makeLockpick(rng.int(1, Math.min(3, 1 + Math.floor(tier / 3)))))
      else if (r < 0.85) items.push(randomPoison(rng, tier))
      else items.push(makeRepairTool(rng.int(1, Math.min(4, 1 + Math.floor(tier / 2)))))
    }
    else items.push(makeJewelry(rng, tier))
  }
  return items
}

export function describeItem(item) {
  const lines = []
  if (item.artifact) lines.push("Legendary artifact")
  if (item.kind === "weapon") {
    lines.push(`${SKILLS[item.skill].name}${item.thrown ? " (thrown)" : item.crossbow ? " (crossbow, bolts)" : item.ranged ? " (bow, arrows)" : item.twoHanded ? " (two-handed)" : ""}`)
    if (item.ranged || item.thrown) lines.push(`Damage ${item.damage[0]}–${item.damage[1]}  Speed ${item.speed}`)
    else {
      lines.push(ATTACK_TYPES.map(t => `${t[0].toUpperCase()}${t.slice(1)} ${attackDamage(item, t).join("–")}`).join(" · "))
      lines.push(`Speed ${item.speed}  Reach ${item.reach}`)
    }
    if (item.enchant) lines.push(item.enchant.absorb ? `Absorb Health ${item.enchant.amount} on strike` : `${item.enchant.amount} ${item.enchant.element} damage on strike`)
    if (item.bound) lines.push("Bound (conjured) — vanishes when the spell ends")
  } else if (item.kind === "armor") {
    if (item.armorClass) lines.push(`${SKILLS[item.armorClass].name} · ${item.slot}`)
    else lines.push(`Jewelry · ${item.slot}`)
    if (item.ar) lines.push(`Armor Rating ${Math.round(item.ar * armorConditionMult(item))}${hasCondition(item) && conditionRatio(item) < 1 ? ` (${item.ar} when repaired)` : ""}`)
    if (item.enchant) lines.push(item.enchant.resist ? `Resist ${item.enchant.resist} ${Math.round(item.enchant.amount * 100)}%` : `Fortify ${item.enchant.attr} +${item.enchant.amount}`)
  } else if (item.kind === "potion") {
    if (item.effect === "fortify") lines.push(`Fortify ${item.attr} +${item.amount} for ${item.duration}s`)
    else if (item.effect === "resist") lines.push(`Resist ${item.element} ${item.amount * 100}% for ${item.duration}s`)
    else if (item.effect === "cure") lines.push("Cures poison")
    else lines.push(`Restores ${item.amount} ${item.effect === "heal" ? "health" : item.effect}`)
  } else if (item.kind === "misc" && item.eat) {
    lines.push("Edible: " + Object.entries(item.eat).map(([k, v]) => `${v > 0 ? "+" : ""}${v} ${k}`).join(", "))
  } else if (item.kind === "ammo") {
    lines.push(`+${item.bonus} damage with ${ammoTypeOf(item) === "bolt" ? "crossbows" : "bows"}`)
    if (item.enchant) lines.push(`${item.enchant.amount} ${item.enchant.element} damage on hit`)
  } else if (item.kind === "poison") {
    lines.push(poisonText(item))
    lines.push(`Coats your weapon for ${item.hits} strikes. Use it from the inventory.`)
  } else if (item.kind === "repair") {
    lines.push(`Repairs weapons and armour (Armorer). Quality ×${item.quality}`)
    lines.push(`Uses left ${item.uses}/${item.maxUses}`)
  } else if (item.kind === "lockpick") {
    lines.push(`Lockpicking quality ×${item.mult}`)
  } else if (item.kind === "quest") {
    lines.push("Quest item")
  }
  if (item.unique) lines.push(uniqueText(item.unique))
  if (item.indestructible) lines.push("Never wears out")
  else if (hasCondition(item)) {
    ensureCondition(item)
    lines.push(`Condition ${Math.ceil(item.cond)}/${item.maxCond}${isBroken(item) ? " — broken" : ""}`)
  }
  lines.push(`Weight ${item.weight}  Value ${item.value}`)
  if (item.lore) lines.push(item.lore)
  return lines
}

export function poisonText(p) {
  if (p.effect === "dot") return `${p.amount} ${p.element} damage per second for ${p.duration}s`
  if (p.effect === "paralyze") return `Paralyzes for ${p.duration}s`
  if (p.effect === "weaken") return `Weakens the target's attacks by ${Math.round(p.amount * 100)}% for ${p.duration}s`
  return ""
}

function uniqueText(u) {
  return {
    banish: `${Math.round(u.chance * 100)}% chance to slay a lesser foe outright`,
    paralyze: `${Math.round(u.chance * 100)}% chance to paralyze on strike`,
    stagger: "Every blow staggers",
    absorbMagicka: `Absorb ${u.amount} magicka on strike`,
    absorbFatigue: `Absorb ${u.amount} fatigue on strike`,
    regen: `Restore ${u.amount} health per second while worn`,
    fireShield: `Burns melee attackers for ${u.amount}`,
    blinding: "Greatly fortifies speed, but blinds: your attacks miss more",
    shadow: `Chameleon ${Math.round(u.amount * 100)}% while equipped`,
  }[u.type] || ""
}
