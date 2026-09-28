export const WEAPON_BASES = {
  dagger: { skill: "shortBlade", damage: [3, 7], speed: 1.5, reach: 1.9, weight: 3, value: 10 },
  tanto: { skill: "shortBlade", damage: [4, 9], speed: 1.4, reach: 2.0, weight: 4, value: 14 },
  shortsword: { skill: "shortBlade", damage: [5, 11], speed: 1.25, reach: 2.1, weight: 8, value: 20 },
  longsword: { skill: "longBlade", damage: [7, 15], speed: 1.1, reach: 2.4, weight: 20, value: 40 },
  broadsword: { skill: "longBlade", damage: [6, 14], speed: 1.15, reach: 2.3, weight: 18, value: 30 },
  katana: { skill: "longBlade", damage: [8, 16], speed: 1.2, reach: 2.4, weight: 16, value: 60 },
  claymore: { skill: "longBlade", damage: [12, 25], speed: 0.85, reach: 2.7, weight: 40, value: 80, twoHanded: true },
  club: { skill: "bluntWeapon", damage: [4, 9], speed: 1.2, reach: 2.0, weight: 10, value: 8 },
  mace: { skill: "bluntWeapon", damage: [6, 13], speed: 1.0, reach: 2.1, weight: 18, value: 30 },
  warhammer: { skill: "bluntWeapon", damage: [14, 27], speed: 0.75, reach: 2.4, weight: 50, value: 80, twoHanded: true },
  "war axe": { skill: "axe", damage: [7, 14], speed: 1.0, reach: 2.2, weight: 24, value: 35 },
  "battle axe": { skill: "axe", damage: [13, 28], speed: 0.8, reach: 2.5, weight: 40, value: 70, twoHanded: true },
  spear: { skill: "spear", damage: [6, 16], speed: 1.0, reach: 3.0, weight: 16, value: 30, twoHanded: true },
  halberd: { skill: "spear", damage: [10, 22], speed: 0.9, reach: 3.2, weight: 30, value: 60, twoHanded: true },
  "short bow": { skill: "marksman", damage: [4, 12], speed: 1.0, reach: 60, weight: 6, value: 40, twoHanded: true, ranged: true },
  "long bow": { skill: "marksman", damage: [7, 18], speed: 0.8, reach: 80, weight: 10, value: 90, twoHanded: true, ranged: true },
}

export const WEAPON_MATERIALS = {
  iron: { tier: 1, mult: 1.0, value: 1, color: 0x6a6e73 },
  chitin: { tier: 1, mult: 1.0, value: 1.4, color: 0x5a4a2a },
  steel: { tier: 2, mult: 1.2, value: 2.2, color: 0xa8adb3 },
  silver: { tier: 3, mult: 1.35, value: 4, color: 0xd9dde2, silver: true },
  dwemer: { tier: 4, mult: 1.6, value: 8, color: 0xb08a3e },
  glass: { tier: 5, mult: 2.0, value: 18, color: 0x7fe0a0, weightMult: 0.6 },
  ebony: { tier: 6, mult: 2.35, value: 30, color: 0x1a1a24, weightMult: 1.3 },
  daedric: { tier: 7, mult: 2.8, value: 60, color: 0x4a1010, weightMult: 1.5 },
}

export const ARMOR_SLOTS = {
  cuirass: { factor: 1.0, weight: 1.0, value: 1.0 },
  helm: { factor: 0.45, weight: 0.3, value: 0.4 },
  greaves: { factor: 0.6, weight: 0.6, value: 0.6 },
  boots: { factor: 0.4, weight: 0.5, value: 0.35 },
  gauntlets: { factor: 0.3, weight: 0.25, value: 0.3 },
  shield: { factor: 0.6, weight: 0.5, value: 0.5 },
}

export const ARMOR_MATERIALS = {
  "netch leather": { class: "lightArmor", tier: 1, ar: 8, weight: 12, value: 20, color: 0x7a5a3a },
  chitin: { class: "lightArmor", tier: 1, ar: 10, weight: 10, value: 30, color: 0x6b5a2a },
  glass: { class: "lightArmor", tier: 5, ar: 30, weight: 18, value: 900, color: 0x7fe0a0 },
  bonemold: { class: "mediumArmor", tier: 2, ar: 15, weight: 24, value: 90, color: 0xc9b58a },
  orcish: { class: "mediumArmor", tier: 4, ar: 24, weight: 26, value: 400, color: 0x5a6a4a },
  indoril: { class: "mediumArmor", tier: 5, ar: 30, weight: 28, value: 1100, color: 0x9a7a3a },
  iron: { class: "heavyArmor", tier: 1, ar: 12, weight: 30, value: 25, color: 0x6a6e73 },
  steel: { class: "heavyArmor", tier: 2, ar: 16, weight: 30, value: 60, color: 0xa8adb3 },
  dwemer: { class: "heavyArmor", tier: 4, ar: 22, weight: 32, value: 300, color: 0xb08a3e },
  ebony: { class: "heavyArmor", tier: 6, ar: 36, weight: 40, value: 2500, color: 0x1a1a24 },
  daedric: { class: "heavyArmor", tier: 7, ar: 46, weight: 50, value: 6000, color: 0x4a1010 },
}

export const POTIONS = {
  health: { name: "Restore Health", effect: "heal", amount: 40, value: 30, color: 0xc0282a },
  magicka: { name: "Restore Magicka", effect: "magicka", amount: 40, value: 40, color: 0x2a5ac0 },
  fatigue: { name: "Restore Fatigue", effect: "fatigue", amount: 80, value: 15, color: 0x3aa04a },
  curePoison: { name: "Cure Poison", effect: "cure", amount: 0, value: 25, color: 0x9ac03a },
  fortifyStrength: { name: "Fortify Strength", effect: "fortify", attr: "strength", amount: 20, duration: 60, value: 60, color: 0xc07a2a },
  resistFire: { name: "Resist Fire", effect: "resist", element: "fire", amount: 0.5, duration: 90, value: 45, color: 0xff7a2a },
}

export const POTION_QUALITY = [
  { name: "Cheap", mult: 0.5 },
  { name: "Standard", mult: 1 },
  { name: "Quality", mult: 1.6 },
  { name: "Exclusive", mult: 2.5 },
]

// Ingredients / valuables — sellable, and edible for a small effect.
export const MISC_ITEMS = {
  "kwama egg": { value: 3, weight: 0.5, eat: { fatigue: 8 }, tags: ["cave"] },
  "saltrice": { value: 2, weight: 0.1, eat: { fatigue: 5 }, tags: ["town"] },
  "scrib jelly": { value: 8, weight: 0.1, eat: { magicka: 5 }, tags: ["cave"] },
  "marshmerrow": { value: 4, weight: 0.1, eat: { health: 4 }, tags: ["wild"] },
  "trama root": { value: 6, weight: 0.5, eat: { magicka: 4 }, tags: ["wild"] },
  "bonemeal": { value: 8, weight: 0.2, tags: ["tomb"] },
  "ectoplasm": { value: 12, weight: 0.1, tags: ["tomb"] },
  "dwemer coherer": { value: 120, weight: 5, tags: ["dwemer"] },
  "dwemer gear": { value: 40, weight: 2, tags: ["dwemer"] },
  "daedra heart": { value: 220, weight: 1, eat: { magicka: 25 }, tags: ["daedric"] },
  "fire salts": { value: 90, weight: 0.1, tags: ["daedric"] },
  "corprus weepings": { value: 60, weight: 0.1, eat: { health: -5, fatigue: 20 }, tags: ["citadel"] },
  "ash salts": { value: 30, weight: 0.1, tags: ["citadel", "ash"] },
  "pearl": { value: 60, weight: 0.2, tags: ["cave", "coast"] },
  "raw glass": { value: 180, weight: 2, tags: ["cave"] },
  "raw ebony": { value: 250, weight: 10, tags: ["cave"] },
  "diamond": { value: 250, weight: 0.2, tags: ["any"] },
  "ruby": { value: 200, weight: 0.2, tags: ["any"] },
  "emerald": { value: 150, weight: 0.2, tags: ["any"] },
}

export const ENCHANTS = {
  weapon: [
    { key: "fire", name: "Flame", tag: "of Flame", element: "fire", min: 3, max: 10 },
    { key: "frost", name: "Frost", tag: "of Frost", element: "frost", min: 3, max: 10 },
    { key: "shock", name: "Storms", tag: "of Storms", element: "shock", min: 3, max: 10 },
    { key: "poison", name: "Venom", tag: "of Venom", element: "poison", min: 3, max: 9 },
    { key: "absorb", name: "Leeching", tag: "of Leeching", absorb: true, min: 2, max: 6 },
  ],
  armor: [
    { key: "resistFire", tag: "of Fire Ward", resist: "fire", min: 0.1, max: 0.4 },
    { key: "resistFrost", tag: "of Frost Ward", resist: "frost", min: 0.1, max: 0.4 },
    { key: "resistShock", tag: "of Storm Ward", resist: "shock", min: 0.1, max: 0.4 },
    { key: "resistMagic", tag: "of Spell Ward", resist: "magic", min: 0.1, max: 0.3 },
    { key: "fortifyStrength", tag: "of the Ox", attr: "strength", min: 3, max: 12 },
    { key: "fortifyAgility", tag: "of the Cat", attr: "agility", min: 3, max: 12 },
    { key: "fortifyEndurance", tag: "of Vigor", attr: "endurance", min: 3, max: 12 },
    { key: "fortifySpeed", tag: "of Swiftness", attr: "speed", min: 3, max: 12 },
    { key: "fortifyIntelligence", tag: "of the Magus", attr: "intelligence", min: 3, max: 12 },
    { key: "fortifyLuck", tag: "of Fortune", attr: "luck", min: 3, max: 12 },
  ],
}

export const JEWELRY = {
  ring: { names: ["Ring", "Band", "Signet"], value: 60 },
  amulet: { names: ["Amulet", "Pendant", "Torc"], value: 80 },
}
