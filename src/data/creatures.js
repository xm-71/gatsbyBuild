// body: which procedural mesh builder to use. habitat: biomes / dungeon types where they spawn.
export const CREATURES = {
  mudcrab: { name: "Mudcrab", level: 1, hp: 16, dmg: [1, 4], speed: 2.2, rate: 1.3, reach: 1.8, ar: 8, agility: 20, body: "crab", color: 0x7a5d44, scale: 0.9, habitat: ["bitterCoast", "azurasCoast", "ascadian"], loot: ["pearl"] },
  rat: { name: "Rat", level: 1, hp: 10, dmg: [1, 3], speed: 4.5, rate: 1.0, reach: 1.5, ar: 0, agility: 40, body: "quad", color: 0x4a3a30, scale: 0.45, habitat: ["cave", "tomb", "bitterCoast", "ascadian"] },
  kwamaForager: { name: "Kwama Forager", level: 1, hp: 14, dmg: [1, 5], speed: 3.5, rate: 1.1, reach: 1.6, ar: 0, agility: 30, body: "worm", color: 0xd8c8a0, scale: 0.6, habitat: ["cave", "grazelands"], loot: ["kwama egg"] },
  scrib: { name: "Scrib", level: 1, hp: 12, dmg: [1, 4], speed: 3.2, rate: 1.1, reach: 1.5, ar: 4, agility: 30, body: "spider", color: 0x6a7a8a, scale: 0.5, habitat: ["cave", "westGash"], loot: ["scrib jelly"] },
  cliffRacer: { name: "Cliff Racer", level: 2, hp: 22, dmg: [2, 8], speed: 6, rate: 1.2, reach: 2.0, ar: 2, agility: 50, body: "flier", color: 0x8a7a5a, scale: 1.0, flying: true, habitat: ["ashlands", "westGash", "grazelands", "molagAmur", "azurasCoast", "ascadian", "bitterCoast", "redMountain"] },
  nixHound: { name: "Nix-Hound", level: 3, hp: 32, dmg: [3, 8], speed: 5.6, rate: 1.0, reach: 1.9, ar: 6, agility: 40, body: "hound", color: 0x5e5a3c, scale: 0.9, habitat: ["ashlands", "westGash", "grazelands", "molagAmur"] },
  alit: { name: "Alit", level: 3, hp: 42, dmg: [3, 10], speed: 5.2, rate: 0.9, reach: 2.0, ar: 8, agility: 30, body: "alit", color: 0x7a6a4a, scale: 1.0, habitat: ["ashlands", "molagAmur", "grazelands"] },
  kagouti: { name: "Kagouti", level: 4, hp: 58, dmg: [4, 12], speed: 5.0, rate: 0.9, reach: 2.1, ar: 10, agility: 30, body: "kagouti", color: 0x8a6a4a, scale: 1.1, habitat: ["grazelands", "ascadian", "ashlands", "westGash"] },
  guar: { name: "Wild Guar", level: 2, hp: 40, dmg: [2, 6], speed: 3.8, rate: 1.0, reach: 2.0, ar: 6, agility: 20, body: "guar", color: 0x9a7a52, scale: 1.1, habitat: ["grazelands", "ascadian", "westGash"] },
  netch: { name: "Bull Netch", level: 5, hp: 90, dmg: [4, 10], speed: 1.6, rate: 0.7, reach: 3.0, ar: 12, agility: 10, body: "netch", color: 0x9a7aa8, scale: 1.6, floating: 3, element: "poison", habitat: ["bitterCoast", "grazelands", "ascadian"] },
  bandit: { name: "Bandit", level: 2, hp: 34, dmg: [3, 9], speed: 4.2, rate: 1.0, reach: 2.2, ar: 12, agility: 35, body: "humanoid", color: 0x6a4a30, scale: 1, humanoid: true, gold: [5, 40], habitat: ["cave", "westGash", "bitterCoast", "ascadian"] },
  smuggler: { name: "Smuggler", level: 3, hp: 40, dmg: [4, 10], speed: 4.2, rate: 1.1, reach: 2.2, ar: 14, agility: 40, body: "humanoid", color: 0x3a4a5a, scale: 1, humanoid: true, gold: [15, 60], habitat: ["cave", "bitterCoast"] },
  necromancer: { name: "Necromancer", level: 5, hp: 40, dmg: [2, 6], speed: 3.6, rate: 1.0, reach: 2.2, ar: 6, agility: 35, body: "humanoid", color: 0x2a1a2a, scale: 1, humanoid: true, caster: "frostbite", gold: [20, 80], habitat: ["tomb"] },
  skeleton: { name: "Skeleton", level: 3, hp: 30, dmg: [3, 9], speed: 3.4, rate: 1.0, reach: 2.2, ar: 10, agility: 30, body: "skeleton", color: 0xd8d0b8, scale: 1, undead: true, habitat: ["tomb"], loot: ["bonemeal"] },
  ancestorGhost: { name: "Ancestor Ghost", level: 3, hp: 26, dmg: [2, 8], speed: 3.8, rate: 1.0, reach: 2.0, ar: 0, agility: 40, body: "ghost", color: 0x9ad0e0, scale: 1, undead: true, element: "frost", resist: { frost: 0.75, poison: 1 }, habitat: ["tomb"], loot: ["ectoplasm"] },
  bonewalker: { name: "Bonewalker", level: 5, hp: 55, dmg: [4, 11], speed: 3.0, rate: 0.9, reach: 2.2, ar: 8, agility: 20, body: "skeleton", color: 0x8a6a5a, scale: 1.1, undead: true, habitat: ["tomb"], loot: ["bonemeal"] },
  bonelord: { name: "Bonelord", level: 9, hp: 80, dmg: [6, 14], speed: 3.2, rate: 0.9, reach: 2.4, ar: 10, agility: 30, body: "ghost", color: 0xb03030, scale: 1.3, undead: true, caster: "frostbite", resist: { frost: 0.75, poison: 1 }, habitat: ["tomb"] },
  scamp: { name: "Scamp", level: 3, hp: 30, dmg: [3, 8], speed: 4.5, rate: 1.1, reach: 1.8, ar: 6, agility: 40, body: "scamp", color: 0xa0502a, scale: 0.8, daedra: true, caster: "fireBite", resist: { fire: 0.5 }, habitat: ["daedric", "molagAmur"], loot: ["fire salts"] },
  clannfear: { name: "Clannfear", level: 6, hp: 70, dmg: [6, 14], speed: 5.5, rate: 1.0, reach: 2.2, ar: 14, agility: 40, body: "clannfear", color: 0x6a7a3a, scale: 1.1, daedra: true, habitat: ["daedric", "molagAmur"] },
  dremora: { name: "Dremora", level: 10, hp: 110, dmg: [9, 20], speed: 4.4, rate: 1.0, reach: 2.4, ar: 30, agility: 45, body: "humanoid", color: 0x5a1010, scale: 1.15, humanoid: true, daedra: true, resist: { fire: 0.5 }, gold: [30, 120], habitat: ["daedric"], loot: ["daedra heart"] },
  daedroth: { name: "Daedroth", level: 12, hp: 150, dmg: [10, 22], speed: 4.0, rate: 0.9, reach: 2.5, ar: 24, agility: 35, body: "clannfear", color: 0x3a5a2a, scale: 1.5, daedra: true, caster: "poisonBloom", resist: { poison: 0.75 }, habitat: ["daedric"], loot: ["daedra heart"] },
  wingedTwilight: { name: "Winged Twilight", level: 14, hp: 140, dmg: [12, 24], speed: 5.5, rate: 1.1, reach: 2.4, ar: 20, agility: 60, body: "flier", color: 0x3a6a9a, scale: 1.3, flying: true, daedra: true, resist: { frost: 0.5 }, habitat: ["daedric"] },
  centurionSpider: { name: "Centurion Spider", level: 3, hp: 34, dmg: [3, 9], speed: 4.4, rate: 1.1, reach: 1.9, ar: 18, agility: 40, body: "spider", color: 0xb08a3e, scale: 0.8, construct: true, resist: { poison: 1 }, habitat: ["dwemer"], loot: ["dwemer gear"] },
  centurionSphere: { name: "Centurion Sphere", level: 7, hp: 80, dmg: [7, 16], speed: 4.8, rate: 1.0, reach: 2.2, ar: 26, agility: 40, body: "sphere", color: 0xc09a4e, scale: 1.1, construct: true, resist: { poison: 1, shock: -0.5 }, habitat: ["dwemer"], loot: ["dwemer coherer"] },
  dwarvenGhost: { name: "Dwarven Spectre", level: 6, hp: 45, dmg: [4, 12], speed: 3.8, rate: 1.0, reach: 2.2, ar: 0, agility: 40, body: "ghost", color: 0xe0c070, scale: 1, undead: true, caster: "sparks", resist: { poison: 1, frost: 0.5 }, habitat: ["dwemer"], loot: ["ectoplasm"] },
  steamCenturion: { name: "Steam Centurion", level: 12, hp: 170, dmg: [12, 24], speed: 3.6, rate: 0.9, reach: 2.6, ar: 36, agility: 30, body: "centurion", color: 0xb08a3e, scale: 1.6, construct: true, resist: { poison: 1, fire: 0.5, shock: -0.5 }, habitat: ["dwemer"], loot: ["dwemer coherer"] },
  ashZombie: { name: "Ash Zombie", level: 6, hp: 70, dmg: [6, 13], speed: 3.0, rate: 0.9, reach: 2.2, ar: 10, agility: 20, body: "ash", color: 0x6a6660, scale: 1.1, sixthHouse: true, habitat: ["redMountain", "ashlands", "citadel"], loot: ["ash salts"] },
  ashSlave: { name: "Ash Slave", level: 5, hp: 50, dmg: [4, 9], speed: 3.8, rate: 1.0, reach: 2.2, ar: 8, agility: 30, body: "ash", color: 0x8a7a70, scale: 1.0, sixthHouse: true, caster: "sparks", habitat: ["redMountain", "citadel"], loot: ["ash salts"] },
  corprusStalker: { name: "Corprus Stalker", level: 8, hp: 95, dmg: [8, 16], speed: 3.6, rate: 1.0, reach: 2.3, ar: 14, agility: 25, body: "ash", color: 0x9a6a50, scale: 1.2, sixthHouse: true, element: "poison", habitat: ["citadel", "redMountain"], loot: ["corprus weepings"] },
  ashGhoul: { name: "Ash Ghoul", level: 11, hp: 130, dmg: [10, 20], speed: 3.8, rate: 1.0, reach: 2.4, ar: 20, agility: 40, body: "ash", color: 0x4a3a34, scale: 1.25, sixthHouse: true, caster: "fireball", habitat: ["citadel"], loot: ["ash salts"] },
  ascendedSleeper: { name: "Ascended Sleeper", level: 15, hp: 200, dmg: [14, 28], speed: 3.8, rate: 1.0, reach: 2.6, ar: 26, agility: 40, body: "sleeper", color: 0x6a3a2a, scale: 1.4, sixthHouse: true, caster: "lightningBolt", resist: { fire: 0.5 }, habitat: ["citadel"], loot: ["ash salts"] },
  // the frozen isle
  wolf: { name: "Wolf", level: 3, hp: 30, dmg: [3, 8], speed: 6, rate: 1.1, reach: 1.9, ar: 4, agility: 45, body: "hound", color: 0x8a8c90, scale: 0.85, resist: { frost: 0.5 }, habitat: ["frostholm"], loot: ["wolf pelt"] },
  snowBear: { name: "Snow Bear", level: 7, hp: 110, dmg: [8, 18], speed: 4.6, rate: 0.8, reach: 2.4, ar: 14, agility: 25, body: "hound", color: 0xe4e0d8, scale: 1.65, resist: { frost: 0.75 }, habitat: ["frostholm"], loot: ["bear pelt"] },
  riekling: { name: "Riekling", level: 3, hp: 28, dmg: [3, 8], speed: 4.4, rate: 1.2, reach: 2.2, ar: 8, agility: 45, body: "riekling", color: 0x7aa0c8, scale: 0.62, humanoid: true, gold: [2, 20], resist: { frost: 0.5 }, habitat: ["frostholm", "barrow"] },
  iceWraith: { name: "Ice Wraith", level: 6, hp: 55, dmg: [6, 12], speed: 5.8, rate: 1.1, reach: 2.2, ar: 6, agility: 60, body: "ghost", color: 0xb0e0ff, scale: 1, flying: true, undead: true, element: "frost", resist: { frost: 1, poison: 1 }, habitat: ["frostholm"], loot: ["ectoplasm"] },
  draugr: { name: "Draugr", level: 5, hp: 60, dmg: [5, 12], speed: 3.4, rate: 0.95, reach: 2.3, ar: 16, agility: 30, body: "draugr", color: 0x6a7280, scale: 1.05, undead: true, element: "frost", resist: { frost: 0.75, poison: 1 }, habitat: ["barrow"], loot: ["bonemeal"] },
  draugrLord: { name: "Draugr Deathlord", level: 11, hp: 140, dmg: [10, 22], speed: 3.6, rate: 1.0, reach: 2.5, ar: 28, agility: 40, body: "draugr", color: 0x4a5260, scale: 1.25, undead: true, element: "frost", caster: "frostbite", resist: { frost: 0.9, poison: 1 }, habitat: ["barrow"], loot: ["bonemeal"] },
  dagoth: { name: "Dagoth", level: 22, hp: 480, dmg: [18, 34], speed: 4.2, rate: 1.1, reach: 2.8, ar: 40, agility: 60, body: "dagoth", color: 0xc8a030, scale: 1.7, sixthHouse: true, caster: "fireball", resist: { fire: 0.75, frost: 0.25, shock: 0.25, poison: 1 }, habitat: [], boss: true },
}

export function creaturesFor(habitat, maxLevel) {
  const list = Object.entries(CREATURES)
    .filter(([, c]) => c.habitat.includes(habitat) && c.level <= maxLevel)
    .map(([id, c]) => ({ id, ...c }))
  if (list.length) return list
  // Always offer something: fall back to the weakest native creatures.
  return Object.entries(CREATURES)
    .filter(([, c]) => c.habitat.includes(habitat))
    .sort((a, b) => a[1].level - b[1].level)
    .slice(0, 2)
    .map(([id, c]) => ({ id, ...c }))
}
