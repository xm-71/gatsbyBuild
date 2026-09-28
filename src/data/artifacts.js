// Legendary artifacts: hand-made weapons and armour with lore and unique
// effects. Each world hides some of them with dungeon bosses, and every
// Daedric shrine's master carries one.
//
// base/material build the item; the rest overrides it. `unique` names a
// special effect handled in combat code:
//   banish      small chance to kill a non-boss outright
//   paralyze    chance to freeze the target briefly
//   stagger     every hit staggers
//   absorbMagicka  strikes restore your magicka
//   absorbFatigue  strikes restore your fatigue
//   regen       restore health over time while worn
//   fireShield  melee attackers are burned
//   blinding    huge speed, but your attacks miss more often
//   shadow      constant chameleon while equipped
export const ARTIFACTS = {
  razor: {
    name: "Mehrunes' Razor", kind: "weapon", base: "dagger", material: "daedric", damage: [8, 18], weight: 2,
    unique: "banish", chance: 0.05,
    lore: "A Daedric blade of the Prince of Destruction. Its edge can cut a mortal soul loose from the world in one stroke.",
  },
  goldbrand: {
    name: "Goldbrand", kind: "weapon", base: "katana", material: "ebony", color: 0xd8a830, damage: [22, 42],
    enchant: { key: "fire", element: "fire", amount: 18 }, indestructible: true,
    lore: "A golden katana forged by Boethiah. It never dulls, and its edge is wreathed in fire.",
  },
  umbra: {
    name: "Umbra", kind: "weapon", base: "claymore", material: "ebony", color: 0x303048, damage: [26, 46],
    enchant: { key: "absorb", absorb: true, amount: 9 },
    lore: "The sword of a warrior who became the blade. It drinks the life of whatever it cuts.",
  },
  iceBlade: {
    name: "Ice Blade of the Monarch", kind: "weapon", base: "claymore", material: "glass", color: 0xa0e0ff, damage: [24, 44],
    enchant: { key: "frost", element: "frost", amount: 16 }, unique: "paralyze", chance: 0.15,
    lore: "A glass greatsword of an ancient Nordic king. Frost spreads from its wounds and locks muscles rigid.",
  },
  bitterMercy: {
    name: "Spear of Bitter Mercy", kind: "weapon", base: "long spear", material: "daedric", damage: [20, 40],
    enchant: { key: "shock", element: "shock", amount: 20 },
    lore: "A long Daedric spear that hums with stored lightning. Its mercy is a quick death.",
  },
  molagMace: {
    name: "Mace of Molag Bal", kind: "weapon", base: "mace", material: "daedric", color: 0x3a0a18, damage: [16, 30],
    unique: "absorbMagicka", amount: 8,
    lore: "The King of Schemes' cudgel. Each blow steals the victim's magical strength for its bearer.",
  },
  skullCrusher: {
    name: "Skull Crusher", kind: "weapon", base: "warhammer", material: "dwemer", color: 0x9a7030, damage: [30, 52],
    unique: "stagger",
    lore: "A Dwemer warhammer weighted with a core of dense brass. No creature stands firm against it.",
  },
  fang: {
    name: "Fang of Haynekhtnamet", kind: "weapon", base: "dagger", material: "glass", color: 0xd0ffd0, damage: [7, 15],
    enchant: { key: "poison", element: "poison", amount: 14 },
    lore: "A tooth of the legendary serpent, set into a hilt. Its venom never runs dry.",
  },
  bowOfShadows: {
    name: "Bow of Shadows", kind: "weapon", base: "long bow", material: "daedric", color: 0x201828, damage: [14, 30],
    unique: "shadow", amount: 0.4,
    lore: "Nocturnal's gift to thieves. Its bearer fades into the dark while it is drawn.",
  },
  dwemerRepeater: {
    name: "Kagrenac's Repeater", kind: "weapon", base: "crossbow", material: "dwemer", color: 0xc09a40, damage: [18, 34],
    speedMult: 1.8,
    lore: "A Dwemer crossbow whose clockwork cranks itself. It reloads almost as fast as you can aim.",
  },
  saviorsHide: {
    name: "Cuirass of the Savior's Hide", kind: "armor", slot: "cuirass", material: "netch leather", color: 0xb09070, ar: 30,
    enchant: { key: "resistMagic", resist: "magic", amount: 0.6 },
    lore: "The flayed skin of a hero, tanned by Hircine. Spells slide from it like rain.",
  },
  lordsMail: {
    name: "Lord's Mail", kind: "armor", slot: "cuirass", material: "steel", color: 0xc0c8d0, ar: 40,
    unique: "regen", amount: 1.2,
    lore: "The Armour of Kings, blessed by Stendarr. Wounds close on their own beneath it.",
  },
  ebonyMail: {
    name: "Ebony Mail", kind: "armor", slot: "cuirass", material: "ebony", ar: 52,
    unique: "fireShield", amount: 10,
    lore: "Boethiah's gift to her champions. Those who strike its wearer are scorched by black fire.",
  },
  blindingSpeed: {
    name: "Boots of Blinding Speed", kind: "armor", slot: "boots", material: "netch leather", color: 0x8a5040, ar: 6,
    unique: "blinding", amount: 0.8,
    lore: "Boots that make you fly across the land, at the cost of seeing clearly what you swing at.",
  },
}

export const ARTIFACT_IDS = Object.keys(ARTIFACTS)
