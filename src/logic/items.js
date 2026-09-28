import { WEAPON_BASES, WEAPON_MATERIALS, ARMOR_SLOTS, ARMOR_MATERIALS, POTIONS, POTION_QUALITY, MISC_ITEMS, ENCHANTS, JEWELRY } from "../data/items.js"
import { SKILLS } from "../data/stats.js"

let uid = 1
const nextUid = () => uid++

// After loading a save, keep new item ids clear of the restored ones.
export function reserveItemUids(maxUsed) {
  uid = Math.max(uid, maxUsed + 1)
}

const titleCase = s => s.replace(/\b\w/g, c => c.toUpperCase())

export function makeWeapon(material, base, enchant = null) {
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
  if (enchant) applyEnchant(item, enchant)
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

export function makeArrows(qty, material = "iron") {
  const mult = { iron: 1, steel: 1.3, glass: 2, ebony: 2.5, daedric: 3 }[material] || 1
  return {
    uid: nextUid(),
    kind: "ammo",
    name: `${titleCase(material)} Arrow`,
    stackKey: `ammo:${material}`,
    bonus: Math.round(2 * mult),
    weight: 0.1,
    value: Math.round(1 * mult),
    qty,
  }
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
  if (spec === "lockpick") return makeLockpick(1)
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

export function randomWeapon(rng, tier, enchantChance = 0) {
  const material = pickMaterial(rng, WEAPON_MATERIALS, tier)
  const base = rng.pick(Object.keys(WEAPON_BASES))
  return makeWeapon(material, base, rng.chance(enchantChance) ? rollEnchant(rng, "weapon", tier) : null)
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
    else if (roll < 0.95) items.push(rng.chance(0.5) ? makeArrows(rng.int(8, 25), rng.pick(["iron", "steel", "glass"])) : makeLockpick(rng.int(1, Math.min(3, 1 + Math.floor(tier / 3)))))
    else items.push(makeJewelry(rng, tier))
  }
  return items
}

export function describeItem(item) {
  const lines = []
  if (item.kind === "weapon") {
    lines.push(`${SKILLS[item.skill].name}${item.twoHanded ? " (two-handed)" : ""}`)
    lines.push(`Damage ${item.damage[0]}–${item.damage[1]}  Speed ${item.speed}`)
    if (item.enchant) lines.push(item.enchant.absorb ? `Absorb Health ${item.enchant.amount} on strike` : `${item.enchant.amount} ${item.enchant.element} damage on strike`)
    if (item.bound) lines.push("Bound (conjured) — vanishes when the spell ends")
  } else if (item.kind === "armor") {
    if (item.armorClass) lines.push(`${SKILLS[item.armorClass].name} · ${item.slot}`)
    else lines.push(`Jewelry · ${item.slot}`)
    if (item.ar) lines.push(`Armor Rating ${item.ar}`)
    if (item.enchant) lines.push(item.enchant.resist ? `Resist ${item.enchant.resist} ${Math.round(item.enchant.amount * 100)}%` : `Fortify ${item.enchant.attr} +${item.enchant.amount}`)
  } else if (item.kind === "potion") {
    if (item.effect === "fortify") lines.push(`Fortify ${item.attr} +${item.amount} for ${item.duration}s`)
    else if (item.effect === "resist") lines.push(`Resist ${item.element} ${item.amount * 100}% for ${item.duration}s`)
    else if (item.effect === "cure") lines.push("Cures poison")
    else lines.push(`Restores ${item.amount} ${item.effect === "heal" ? "health" : item.effect}`)
  } else if (item.kind === "misc" && item.eat) {
    lines.push("Edible: " + Object.entries(item.eat).map(([k, v]) => `${v > 0 ? "+" : ""}${v} ${k}`).join(", "))
  } else if (item.kind === "ammo") {
    lines.push(`+${item.bonus} damage with bows`)
  } else if (item.kind === "lockpick") {
    lines.push(`Lockpicking quality ×${item.mult}`)
  } else if (item.kind === "quest") {
    lines.push("Quest item")
  }
  lines.push(`Weight ${item.weight}  Value ${item.value}`)
  return lines
}
