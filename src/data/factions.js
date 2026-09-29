export const FACTIONS = {
  fightersGuild: {
    name: "Fighters Guild",
    color: "#b86b3a",
    ranks: ["Associate", "Apprentice", "Journeyman", "Swordsman", "Protector", "Defender", "Warder", "Guardian", "Champion", "Master"],
    skills: ["longBlade", "axe", "bluntWeapon", "heavyArmor", "block", "athletics"],
    questTypes: ["bounty", "cull", "clear"],
    services: ["training", "barter"],
    hall: "guild",
  },
  magesGuild: {
    name: "Mages Guild",
    color: "#4a6ac0",
    ranks: ["Associate", "Apprentice", "Journeyman", "Evoker", "Conjurer", "Magician", "Warlock", "Wizard", "Master Wizard", "Arch-Mage"],
    skills: ["destruction", "alteration", "illusion", "mysticism", "restoration", "conjuration"],
    questTypes: ["retrieve", "clear", "deliver"],
    services: ["spells", "training"],
    hall: "guild",
  },
  thievesGuild: {
    name: "Thieves Guild",
    color: "#5a8a5a",
    ranks: ["Toad", "Wet Ear", "Footpad", "Blackcap", "Operative", "Bandit", "Captain", "Ringleader", "Mastermind", "Master Thief"],
    skills: ["security", "sneak", "acrobatics", "lightArmor", "shortBlade", "marksman"],
    questTypes: ["retrieve", "deliver"],
    services: ["barter", "training"],
    hall: "guild",
  },
  temple: {
    name: "Tribunal Temple",
    color: "#c8a040",
    ranks: ["Novice", "Initiate", "Acolyte", "Adept", "Curate", "Disciple", "Diviner", "Master", "Patriarch", "Archcanon"],
    skills: ["restoration", "mysticism", "alteration", "bluntWeapon", "speechcraft", "unarmored"],
    questTypes: ["clear", "retrieve", "deliver"],
    services: ["spells", "healing"],
    hall: "temple",
  },
  legion: {
    name: "Imperial Legion",
    color: "#a02828",
    ranks: ["Recruit", "Spearman", "Trooper", "Agent", "Champion", "Knight Errant", "Knight Bachelor", "Knight Protector", "Knight of the Garland", "Knight of the Imperial Dragon"],
    skills: ["longBlade", "spear", "heavyArmor", "block", "athletics", "bluntWeapon"],
    questTypes: ["bounty", "cull", "clear"],
    services: ["training", "barter"],
    hall: "fort",
  },
  redoran: {
    name: "House Redoran",
    color: "#a0502a",
    ranks: ["Hireling", "Retainer", "Oathman", "Lawman", "Kinsman", "House Cousin", "House Brother", "Councilman", "Archmaster", "Hortator"],
    skills: ["longBlade", "spear", "mediumArmor", "heavyArmor", "athletics", "block"],
    questTypes: ["bounty", "clear", "cull"],
    services: ["training"],
    hall: "manor",
  },
  hlaalu: {
    name: "House Hlaalu",
    color: "#c0a060",
    ranks: ["Hireling", "Retainer", "Oathman", "Lawman", "Kinsman", "House Cousin", "House Brother", "Councilman", "Grandmaster", "Hortator"],
    skills: ["speechcraft", "mercantile", "shortBlade", "lightArmor", "sneak", "marksman"],
    questTypes: ["deliver", "retrieve", "bounty"],
    services: ["barter", "training"],
    hall: "manor",
  },
  telvanni: {
    name: "House Telvanni",
    color: "#7a4aa0",
    ranks: ["Hireling", "Retainer", "Oathman", "Lawman", "Mouth", "Spellwright", "Wizard", "Master", "Magister", "Archmagister"],
    skills: ["mysticism", "alteration", "illusion", "destruction", "conjuration", "restoration"],
    questTypes: ["retrieve", "clear", "deliver"],
    services: ["spells"],
    hall: "manor",
  },
  moragTong: {
    name: "Morag Tong",
    color: "#6a1a1a",
    ranks: ["Associate", "Brother", "Operator", "Contractor", "Executioner", "Assassin", "Calm Hand", "Exalted", "Master", "Grandmaster"],
    skills: ["shortBlade", "sneak", "acrobatics", "lightArmor", "marksman", "illusion"],
    questTypes: ["bounty"],
    services: ["training"],
    hall: "guild",
  },
}

export const FACTION_IDS = Object.keys(FACTIONS)

// Reputation needed for each rank.
export const RANK_REP = [0, 5, 12, 20, 30, 42, 56, 72, 90, 110]

export const HOUSE_STYLE = {
  redoran: "redoran",
  hlaalu: "hlaalu",
  telvanni: "telvanni",
  imperial: "imperial",
  ashlander: "ashlander",
}
