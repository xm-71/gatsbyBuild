import { RNG } from "../core/rng.js"
import { FACTIONS } from "../data/factions.js"
import { RACES, SKILLS, SKILL_IDS } from "../data/stats.js"
import { SPELLS, spellPrice } from "../data/spells.js"
import { CREATURES } from "../data/creatures.js"
import { REGIONS } from "../logic/worldgen.js"
import { getAttr, getSkill, maxHealth, addItem, removeItem, raiseSkill } from "../logic/character.js"
import { buyPrice, sellPrice, persuadeChance } from "../logic/combat.js"
import { generateQuest, canPromote } from "../logic/quests.js"
import { randomPotion, randomMisc, randomWeapon, randomArmor, makeLockpick, makeArrows, makeBolts, makeQuestItem, makeWeapon, makeRepairTool, randomAmmo, randomPoison, repairCost, hasCondition, makeArtifact } from "../logic/items.js"
import { DUNGEON_THEMES } from "../logic/dungeongen.js"

const GREAT_HOUSES = ["redoran", "hlaalu", "telvanni"]

export function disposition(game, npc) {
  const c = game.char
  let d = npc.disposition + (game.dispositionMod.get(npc.id) || 0) + (getAttr(c, "personality") - 40) / 2
  if (npc.faction && c.factions[npc.faction]) d += 10 + c.factions[npc.faction].rank * 2
  if (npc.race === c.race) d += 5
  if (npc.race === "dunmer" && c.race !== "dunmer") d -= 5
  return Math.max(0, Math.min(100, Math.round(d)))
}

function compass(dx, dz) {
  const a = Math.atan2(dx, -dz) // 0 = north (-z)
  const dirs = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]
  return dirs[(Math.round(a / (Math.PI / 4)) + 8) % 8]
}

export function greeting(game, npc) {
  const c = game.char
  const d = disposition(game, npc)
  const race = RACES[c.race].name
  const rng = new RNG(`${npc.seed}:${Math.floor(game.time)}`)
  if (npc.role === "elder" && !(game.isle?.stage > 0)) return `A southerner, on our isle? The ancestors send strange visitors. Sit by the fire, ${c.name}.`
  if (npc.role === "pilgrim") return rng.pick([`Blessings of the Three upon you, ${c.name}. I walk to the shrines of the saints.`, "Walk with me a while, if you like. The road is long and the Ashlands are cruel.", "Almsivi keep you. Have you seen the shrine near here?"])
  if (npc.title === "Caravan Merchant") return "You came just in time. Those bandits meant to take everything."
  if (npc.role === "blade" && game.main.stage === 0) return `You're ${c.name}? Good. I was told to expect you. Sit — we have much to discuss about your future, and the dreams that trouble this island.`
  if (d < 30) return rng.pick([`What do you want, ${c.race === "dunmer" ? "sera" : "n'wah"}?`, `Hmph. An outlander. Make it quick.`, `S'wit. What?`])
  if (d < 55) return rng.pick([`Yes, ${race}?`, `Greetings, outlander. What do you need?`, `Something I can help you with?`, `Mm. Speak.`])
  return rng.pick([`Well met, friend ${c.name}!`, `Ah, ${c.name}. Always good to see you.`, `Welcome, welcome. How can I help?`])
}

export function topics(game, npc) {
  const c = game.char
  const list = []
  const town = game.world.towns[npc.townId]
  if (npc.role === "elder") {
    const st = game.isle?.stage || 0
    if (st === 0) list.push({ id: "isle:start", label: "The restless barrow" })
    else if (st === 1 && !c.inventory.some(i => i.questId === "isle")) list.push({ id: "isle:progress", label: "The barrow" })
    else if (st <= 2 && c.inventory.some(i => i.questId === "isle")) list.push({ id: "isle:finish", label: "The Horn of the Ancestors" })
  }
  if (npc.role === "blade") {
    if (game.main.stage === 0) list.push({ id: "main:start", label: "Dreams of the Sixth House" })
    else if (game.main.stage === 1) list.push({ id: "main:tools", label: "Kagrenac's Tools" })
    else list.push({ id: "main:mountain", label: "Red Mountain" })
  }
  for (const q of game.quests) {
    if (q.giver === npc.id && q.status === "ready") list.push({ id: `turnin:${q.id}`, label: `Report: ${q.title}` })
    if (q.giver === npc.id && q.status === "active" && q.type === "retrieve" && c.inventory.some(i => i.questId === q.id)) list.push({ id: `turnin:${q.id}`, label: `Report: ${q.title}` })
    if (q.type === "deliver" && q.status === "active" && q.recipient === npc.id) list.push({ id: `deliver:${q.id}`, label: `Deliver the ${q.item}` })
  }
  if (npc.faction && npc.role === "guildmaster") {
    const F = FACTIONS[npc.faction]
    if (!c.factions[npc.faction]) list.push({ id: "join", label: `Join the ${F.name}` })
    else {
      list.push({ id: "duties", label: "Duties" })
      list.push({ id: "advancement", label: "Advancement" })
    }
  }
  list.push({ id: "rumors", label: "Latest rumors" })
  list.push({ id: "advice", label: "Little advice" })
  list.push({ id: "town", label: town.name })
  list.push({ id: "sixth", label: "Sixth House" })
  return list
}

export function services(game, npc) {
  const s = []
  const role = npc.role
  const F = npc.faction ? FACTIONS[npc.faction] : null
  if (role === "trader" || role === "smith") s.push("barter")
  if (role === "smith" || (role === "guildmaster" && (npc.faction === "fightersGuild" || npc.faction === "legion"))) s.push("repair")
  if (role === "priest") s.push("healing", "spells")
  if (role === "caravaner") s.push("travel")
  if (role === "shipmaster") s.push("boat")
  if (role === "guide") s.push("guide")
  if (role === "guildmaster" && F) for (const x of F.services) if (!s.includes(x)) s.push(x)
  if (role === "trader" || role === "smith" || role === "priest") s.push("training")
  return [...new Set(s)]
}

export function persuade(game, npc, kind) {
  const c = game.char
  const d = disposition(game, npc)
  const mod = game.dispositionMod.get(npc.id) || 0
  if (kind.startsWith("bribe")) {
    const amount = Number(kind.split(":")[1])
    if (c.gold < amount) return "You don't have that much gold."
    c.gold -= amount
    const gain = Math.round(amount / 10 + getSkill(c, "mercantile") / 20)
    game.dispositionMod.set(npc.id, mod + gain)
    game.exercise("speechcraft", 0.5)
    return `${npc.name} pockets the ${amount} gold. (+${gain} disposition)`
  }
  const chance = persuadeChance(getSkill(c, "speechcraft"), getAttr(c, "personality"), getAttr(c, "luck"), d, kind === "intimidate" ? 10 : 0)
  if (Math.random() < chance) {
    const gain = 5 + Math.round(getSkill(c, "speechcraft") / 10)
    game.dispositionMod.set(npc.id, mod + gain)
    game.exercise("speechcraft", 1)
    return kind === "admire" ? `${npc.name} is flattered. (+${gain} disposition)` : `${npc.name} is cowed by your threats. (+${gain} disposition)`
  }
  game.dispositionMod.set(npc.id, mod - 4)
  return kind === "admire" ? `${npc.name} is unimpressed. (-4 disposition)` : `${npc.name} laughs at you. (-4 disposition)`
}

export function handleTopic(game, npc, id) {
  const c = game.char
  const world = game.world
  const town = world.towns[npc.townId]
  const rng = new RNG(`${npc.seed}:${id}:${Math.floor(game.time / 6)}`)
  const d = disposition(game, npc)

  if (id.startsWith("isle:")) return isleTopic(game, npc, id)

  if (id === "rumors") {
    const unknown = world.dungeons.filter(x => !x.discovered && !x.citadel)
    if (unknown.length && d >= 30 && rng.chance(0.75)) {
      const t = rng.pick(unknown)
      t.discovered = true
      const dist = Math.hypot(t.x - town.x, t.z - town.z)
      const far = dist < 200 ? "not far" : dist < 450 ? "a good walk" : "a long way"
      const flavor = {
        cave: "Smugglers and worse have been seen going in and out",
        tomb: "The family's dead don't rest easy there, they say",
        dwemer: "Old Dwemer ruins — full of clanking machines and treasure",
        daedric: "Worshippers of the Daedra gather there. Stay clear, if you're smart",
      }[t.type]
      return `Have you heard of ${t.name}? It's ${far} ${compass(t.x - town.x, t.z - town.z)} of here, in the ${REGIONS[t.region].name}. ${flavor}. (Marked on your map.)`
    }
    return rng.pick([
      "They say the Blight is spreading from Red Mountain. Ash storms more often every season.",
      "Cliff racers. Someone should do something about the cliff racers.",
      "The Sixth House cultists have been seen near the Ghostfence. Madmen, all of them.",
      "A silt strider driver told me the Grazelands tribes are restless.",
      "The Mages Guild pays well for Dwemer artifacts, if you can find any.",
      "Heard a Telvanni wizard turned his apprentice into a scrib. Just for talking back.",
    ])
  }
  if (id === "advice") {
    return rng.pick([
      "Hit something enough times and you'll get better at hitting things. That's how skill works around here.",
      "Rest when you're hurt — but not in the wilds unless you like waking up to a nix-hound.",
      "Get a lockpick. You'd be amazed what people leave in chests.",
      "Spells fail when you're tired. Keep your fatigue up.",
      "The silt striders can carry you between towns for a few drakes.",
      "If you get lost in a tomb, Almsivi Intervention will take you to the nearest Temple.",
      "Sneak up on something and strike — a blow from the shadows hits three times as hard.",
      "Dwemer machines don't care about poison, and ghosts shrug off plain steel.",
    ])
  }
  if (id === "town") {
    return `${town.name} is ${{ imperial: "an Imperial town", redoran: "a Redoran settlement", hlaalu: "a Hlaalu town", telvanni: "a Telvanni village", ashlander: "an Ashlander camp" }[town.style]} in the ${REGIONS[town.region].name}. ${town.hasTemple ? "The Temple here tends to the sick." : ""}`
  }
  if (id === "sixth") {
    return "The Sixth House. House Dagoth, betrayers of Nerevar. Their lord sleeps under Red Mountain and sends ash and nightmares to the rest of us. Only fools go looking for his Citadel."
  }

  // ---------- main quest ----------
  if (id === "main:start") {
    game.main.stage = 1
    const mq = world.mainQuest
    const places = mq.relics.map(r => {
      const dd = world.dungeons[r.dungeonId]
      dd.discovered = true
      return `${r.name} lies in ${dd.name}`
    })
    game.quests.push({ id: "main", type: "main", title: "The Tools of Kagrenac", desc: `Recover Sunder, Keening and Wraithguard, then descend into ${world.dungeons[mq.citadelId].name} and destroy ${mq.dagoth}.`, status: "active", giverName: npc.name, giverTown: town.name })
    game.addJournal(`${npc.name} of the Blades told me of ${mq.dagoth}, who draws power from the Heart of Lorkhan beneath Red Mountain. To reach him I need Kagrenac's tools: ${places.join("; ")}.`)
    return `You've had the dreams too, haven't you? ${mq.dagoth} stirs beneath Red Mountain, feeding on the Heart of Lorkhan. The Citadel is sealed by a ward only Kagrenac's tools can break. Our agents traced them: ${places.join("; ")}. They're marked on your map. Get stronger first — those places are guarded by terrible things.`
  }
  if (id === "main:tools") {
    const held = game.relicsHeld()
    const parts = world.mainQuest.relics.map(r => `${r.name}: ${held.includes(r.name) ? "recovered" : world.dungeons[r.dungeonId].name}`)
    return `How goes the hunt? ${parts.join(". ")}.`
  }
  if (id === "main:mountain") return `You have all three tools. The ward on the Citadel in Red Mountain's crater will yield to you. End this, ${c.name}.`

  // ---------- factions ----------
  if (id === "join") {
    const F = FACTIONS[npc.faction]
    if (GREAT_HOUSES.includes(npc.faction) && GREAT_HOUSES.some(h => c.factions[h])) return "You already serve another Great House. We don't share."
    if (d < 40) return "I don't know you well enough to vouch for you. (Disposition 40 required)"
    const best = Math.max(...F.skills.map(s => getSkill(c, s)))
    if (best < 15) return `We need people with some talent in ${F.skills.map(s => SKILLS[s].name).join(", ")}.`
    c.factions[npc.faction] = { rank: 0, rep: 0 }
    game.addJournal(`I joined the ${F.name} in ${town.name} as a ${F.ranks[0]}.`)
    return `Welcome to the ${F.name}, ${F.ranks[0]} ${c.name}. Ask me about duties when you're ready to work.`
  }
  if (id === "duties") {
    const active = game.quests.find(q => q.giver === npc.id && q.status !== "done")
    if (active) return active.status === "ready" ? "You've done it? Tell me about it." : `You already have a task from me: ${active.desc}`
    const rank = c.factions[npc.faction]?.rank || 0
    const q = generateQuest(rng, world, npc, npc.faction, c.level, rank)
    game.quests.push(q)
    game.addJournal(q.desc)
    if (q.type === "deliver") addItem(c, makeQuestItem(q.item, q.id))
    return `${q.desc} Reward: ${q.reward.gold} gold.`
  }
  if (id === "advancement") {
    const F = FACTIONS[npc.faction]
    const res = canPromote(c, npc.faction)
    if (!res.ok) return res.reason
    c.factions[npc.faction].rank = res.rank
    const gift = 100 * res.rank
    c.gold += gift
    game.addJournal(`I was promoted to ${F.ranks[res.rank]} of the ${F.name}.`)
    game.audio.play("levelup")
    return `You've earned it. You are now ${F.ranks[res.rank]} of the ${F.name}. Take these ${gift} drakes.`
  }
  if (id.startsWith("turnin:")) {
    const q = game.quests.find(x => x.id === id.slice(7))
    if (!q) return "..."
    if (q.type === "retrieve") {
      const it = c.inventory.find(i => i.questId === q.id)
      if (it) removeItem(c, it)
    }
    return completeQuest(game, q, npc)
  }
  if (id.startsWith("deliver:")) {
    const q = game.quests.find(x => x.id === id.slice(8))
    const it = c.inventory.find(i => i.questId === q.id)
    if (!it) return "You seem to have lost the package..."
    removeItem(c, it)
    return completeQuest(game, q, npc)
  }
  return "..."
}

function completeQuest(game, q, npc) {
  const c = game.char
  q.status = "done"
  c.gold += q.reward.gold
  c.stats.goldEarned += q.reward.gold
  c.stats.questsDone++
  let extra = ""
  if (q.faction && c.factions[q.faction]) {
    c.factions[q.faction].rep += q.reward.rep
    extra = ` Your reputation with the ${FACTIONS[q.faction].name} grows (+${q.reward.rep}).`
    if (canPromote(c, q.faction).ok) extra += " You may be ready for advancement."
  }
  game.addJournal(`Completed: ${q.title}. ${npc.name} paid me ${q.reward.gold} gold.`)
  game.audio.play("gold")
  return `Well done. Here are ${q.reward.gold} drakes as promised.${extra}`
}

// ---------- barter ----------

// The frozen isle's story: the village elder asks you to quiet a draugr lord
// and bring back the Horn of the Ancestors he was buried with.
function isleTopic(game, npc, id) {
  const w = game.world
  const barrow = w.dungeons.find(d => d.isleStory)
  const isle = (game.isle ||= { stage: 0 })
  if (id === "isle:start") {
    isle.stage = 1
    barrow.discovered = true
    game.addJournal(`${npc.name}, elder of the village on the frozen isle, told me the dead of ${barrow.name} have woken. A draugr lord walks there with the Horn of the Ancestors. If I bring the Horn back, the village will honour me.`)
    return `You came across the strait? Then you are stronger than you look. Listen: the dead in ${barrow.name} have woken. Their lord was buried with the Horn of the Ancestors, and while he holds it the draugr will not rest. Put him down and bring me the Horn. (${barrow.name} is marked on your map.)`
  }
  if (id === "isle:progress") return `The draugr lord still walks in ${barrow.name}. Kill him, and bring back the Horn.`
  if (id === "isle:finish") {
    const horn = game.char.inventory.find(i => i.questId === "isle")
    if (horn) removeItem(game.char, horn)
    isle.stage = 3
    const reward = makeArtifact("stalhrim")
    addItem(game.char, reward)
    game.onItemTaken?.(reward)
    game.char.gold += 300
    for (const n of w.towns.find(t => t.isle)?.npcs || []) game.dispositionMod.set(n.id, (game.dispositionMod.get(n.id) || 0) + 15)
    game.addJournal(`I returned the Horn of the Ancestors to ${npc.name}. The village gave me a blade of enchanted stalhrim ice and named me a friend of the isle.`)
    game.audio.sting("levelup")
    return `The Horn... and the barrow is quiet. The ancestors will sleep now. Take this blade — stalhrim, ice that never melts, forged for such a day. You are a friend of this village, now and always. (+300 gold)`
  }
  return ""
}

export function merchantStock(game, npc) {
  const week = Math.floor(game.time / (24 * 7))
  const key = `${npc.id}:${week}`
  if (game.merchantStock.has(key)) return game.merchantStock.get(key)
  const rng = new RNG(`stock:${npc.seed}:${week}`)
  const tier = Math.max(1, Math.min(6, 1 + Math.floor(game.char.level / 3) + rng.int(0, 1)))
  const items = []
  const role = npc.role === "guildmaster" ? (npc.faction === "fightersGuild" || npc.faction === "legion" ? "smith" : "trader") : npc.role
  if (role === "smith") {
    for (let i = 0; i < 6; i++) items.push(randomWeapon(rng, tier, 0.1))
    for (let i = 0; i < 6; i++) items.push(randomArmor(rng, tier, 0.1))
    items.push(makeArrows(40), makeArrows(20, "steel"), makeBolts(30), makeBolts(15, "steel"))
    items.push(makeWeapon(rng.pick(["iron", "steel"]), rng.pick(["dart", "throwing knife", "throwing star"]), null, rng.int(10, 25)))
    if (tier >= 2) items.push(makeWeapon(tier >= 4 ? "dwemer" : "steel", "crossbow"))
    items.push(makeRepairTool(1), makeRepairTool(1), makeRepairTool(Math.min(4, 1 + Math.floor(tier / 2))))
    if (tier >= 3) items.push(randomAmmo(rng, tier))
  } else {
    for (let i = 0; i < 7; i++) items.push(randomPotion(rng, tier))
    for (let i = 0; i < 4; i++) items.push(randomMisc(rng, "town"))
    items.push(makeLockpick(1, 3), makeLockpick(2, 1), makeArrows(30), makeBolts(20))
    items.push(randomPoison(rng, tier), randomPoison(rng, tier))
    items.push(randomWeapon(rng, tier), randomArmor(rng, tier))
  }
  const stock = { items, gold: 600 + tier * 300 }
  game.merchantStock.set(key, stock)
  return stock
}

// Smiths restore worn and broken gear for a fee.
export function repairPrice(game, npc, item) {
  const d = disposition(game, npc)
  return Math.max(1, Math.round(repairCost(item) * (1.2 - getSkill(game.char, "mercantile") / 400 - d / 500)))
}

export function repair(game, npc, item) {
  const c = game.char
  if (!hasCondition(item) || item.cond >= item.maxCond) return ""
  const price = repairPrice(game, npc, item)
  if (c.gold < price) return "You can't afford that."
  c.gold -= price
  item.cond = item.maxCond
  game.audio.play("repair")
  return `${item.name} is as good as new. (${price} gold)`
}

export function priceContext(game, npc) {
  const c = game.char
  return { mercantile: getSkill(c, "mercantile"), personality: getAttr(c, "personality"), disposition: disposition(game, npc) }
}

export function buy(game, npc, item) {
  const c = game.char
  const stock = merchantStock(game, npc)
  const price = buyPrice(item.value, priceContext(game, npc))
  if (c.gold < price) return "You can't afford that."
  c.gold -= price
  stock.gold += price
  const bought = item.stackKey && item.qty > 1 ? { ...item, qty: 1, uid: item.uid + 100000 + Math.floor(Math.random() * 1e6) } : item
  if (item.stackKey && item.qty > 1) item.qty--
  else stock.items = stock.items.filter(i => i !== item)
  addItem(c, bought)
  game.exercise("mercantile", 0.5)
  game.audio.play("gold")
  return null
}

export function sell(game, npc, item) {
  const c = game.char
  if (item.kind === "quest" || item.relic || item.bound) return "They won't buy that."
  const stock = merchantStock(game, npc)
  const price = sellPrice(item.value, priceContext(game, npc))
  if (stock.gold < price) return "The merchant doesn't have enough gold."
  stock.gold -= price
  c.gold += price
  c.stats.goldEarned += price
  const sold = item.stackKey && item.qty > 1 ? { ...item, qty: 1 } : item
  removeItem(c, item, 1)
  if (sold.stackKey) {
    const ex = stock.items.find(i => i.stackKey === sold.stackKey)
    if (ex) ex.qty++
    else stock.items.push(sold)
  } else stock.items.push(sold)
  game.exercise("mercantile", 0.5)
  game.audio.play("gold")
  return null
}

// ---------- spells, training, healing, travel ----------

export function spellsForSale(game, npc) {
  const c = game.char
  let schools = ["destruction", "alteration", "illusion", "conjuration", "mysticism", "restoration"]
  if (npc.role === "priest" || npc.faction === "temple") schools = ["restoration", "mysticism", "alteration"]
  return Object.entries(SPELLS)
    .filter(([id, s]) => schools.includes(s.school) && !c.spells.includes(id) && id !== "starCurse")
    .map(([id, s]) => ({ id, ...s, price: Math.round(spellPrice(id) * (npc.faction && c.factions[npc.faction] ? 0.8 : 1)) }))
}

export function buySpell(game, npc, spell) {
  const c = game.char
  if (c.gold < spell.price) return "You can't afford that."
  c.gold -= spell.price
  c.spells.push(spell.id)
  if (!c.selectedSpell) c.selectedSpell = spell.id
  game.audio.play("spell")
  return `You learned ${spell.name}.`
}

export function trainingOffers(game, npc) {
  const rng = new RNG(`train:${npc.seed}`)
  let pool
  if (npc.faction) pool = FACTIONS[npc.faction].skills
  else if (npc.role === "smith") pool = ["heavyArmor", "mediumArmor", "longBlade", "axe", "bluntWeapon", "block"]
  else if (npc.role === "priest") pool = ["restoration", "mysticism", "alteration", "unarmored"]
  else pool = ["mercantile", "speechcraft", "security", "sneak", "athletics", "acrobatics"]
  const skills = rng.shuffle([...pool]).slice(0, 3)
  const cap = 45 + (npc.seed % 30)
  return skills.map(s => ({ skill: s, cap, price: Math.round((getSkill(game.char, s) + 1) * 10 * (1.1 - getSkill(game.char, "mercantile") / 400)) }))
}

export function train(game, offer) {
  const c = game.char
  if (game.trainedThisLevel >= 5) return "You've trained enough for now. Gain a level first."
  if (getSkill(c, offer.skill) >= offer.cap) return "I can teach you nothing more in that."
  if (c.gold < offer.price) return "You can't afford the lesson."
  c.gold -= offer.price
  game.trainedThisLevel++
  game.skillEvents(raiseSkill(c, offer.skill))
  game.advanceTime(2)
  return `You train ${SKILLS[offer.skill].name} for two hours.`
}

export function heal(game, npc) {
  const c = game.char
  const member = c.factions.temple
  const price = member ? 0 : Math.max(10, Math.round((maxHealth(c) - c.health) * 0.6))
  if (c.gold < price) return "You can't afford the healing."
  c.gold -= price
  c.health = maxHealth(c)
  c.poison = 0
  game.audio.play("spell")
  return price ? `You are healed for ${price} gold.` : "The Temple heals its own freely."
}

// mode: "travel" (silt strider), "boat" (between harbours) or "guide"
// (Mages Guild teleport, instant).
export const TRAVEL_MODES = {
  travel: { title: "Silt Strider destinations", ok: t => !t.isle, per: 12, speed: 60, base: 10, arrive: "aboard the silt strider" },
  boat: { title: "Ports of call", ok: t => !!t.dock, per: 10, speed: 75, base: 12, arrive: "at sea" },
  guide: { title: "Guild Guide destinations", ok: t => t.buildings.some(b => b.label === "Mages Guild"), per: 0, speed: 0, base: 20, arrive: "" },
}

export function travelOptions(game, npc, mode = "travel") {
  const town = game.world.towns[npc.townId]
  const M = TRAVEL_MODES[mode]
  return game.world.towns
    .filter(t => t.id !== town.id && M.ok(t))
    .map(t => {
      const d = Math.hypot(t.x - town.x, t.z - town.z)
      return { town: t, mode, price: Math.round(M.per ? d / M.per : 0) + M.base, hours: M.speed ? Math.round(d / M.speed) + 1 : 0 }
    })
}

export function travel(game, opt) {
  const c = game.char
  if (c.gold < opt.price) return "You can't afford passage."
  c.gold -= opt.price
  game.advanceTime(opt.hours)
  const t = opt.town
  let x = t.port.x - Math.cos(t.port.angle) * 7
  let z = t.port.z - Math.sin(t.port.angle) * 7
  if (opt.mode === "boat" && t.dock) {
    x = t.dock.x - Math.cos(t.dock.angle) * 3
    z = t.dock.z - Math.sin(t.dock.angle) * 3
  } else if (opt.mode === "guide") {
    const g = t.buildings.find(b => b.label === "Mages Guild")
    x = g.x - Math.cos(g.angle) * (g.d / 2 + 4)
    z = g.z - Math.sin(g.angle) * (g.d / 2 + 4)
  }
  game.pc.pos.set(x, game.world.heightAt(x, z), z)
  game.pc.vel.set(0, 0, 0)
  game.knownTowns.add(t.id)
  if (opt.mode === "guide") {
    game.audio.play("spell", { element: "restore" })
    game.msg(`The guild guide's spell carries you to ${t.name} in an instant.`, "#a0c0ff")
  } else game.msg(`After ${opt.hours} hours ${TRAVEL_MODES[opt.mode].arrive}, you arrive in ${t.name}.`, "#f0d890")
  return null
}

export { SKILL_IDS, CREATURES, DUNGEON_THEMES }
