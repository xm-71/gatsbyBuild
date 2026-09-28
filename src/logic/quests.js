import { FACTIONS, RANK_REP } from "../data/factions.js"
import { CREATURES } from "../data/creatures.js"
import { artifactName } from "./names.js"

let questCounter = 1

export function reserveQuestIds(maxUsed) {
  questCounter = Math.max(questCounter, maxUsed + 1)
}

const REGION_CREATURES = ["nixHound", "kagouti", "alit", "cliffRacer", "mudcrab", "netch", "scamp", "ashZombie", "guar", "clannfear"]

// Build a faction (or freelance) quest appropriate to the player's level.
export function generateQuest(rng, world, npc, factionId, playerLevel, rank = 0) {
  const F = factionId ? FACTIONS[factionId] : null
  const types = F ? F.questTypes : ["clear", "retrieve", "cull", "deliver"]
  const type = rng.pick(types)
  const giverTown = world.towns[npc.townId]
  const tierCap = Math.max(1, Math.min(6, Math.round(1 + playerLevel / 3 + rank / 3)))
  const openDungeons = world.dungeons.filter(d => !d.cleared && !d.citadel && !d.questId && d.tier <= tierCap + 1)
  const repReward = 3 + Math.floor(rank / 2) + rng.int(0, 2)
  const goldReward = rng.int(40, 90) * Math.max(1, tierCap)

  const byDistance = list => [...list].sort((a, b) => Math.hypot(a.x - giverTown.x, a.z - giverTown.z) - Math.hypot(b.x - giverTown.x, b.z - giverTown.z))

  const q = { id: `q${questCounter++}`, giver: npc.id, giverName: npc.name, giverTown: giverTown.name, faction: factionId, type, status: "active", reward: { gold: goldReward, rep: repReward } }

  if ((type === "clear" || type === "bounty" || type === "retrieve") && openDungeons.length) {
    const target = rng.pick(byDistance(openDungeons).slice(0, 4))
    target.discovered = true
    target.questId = q.id
    q.dungeonId = target.id
    if (type === "retrieve") {
      q.item = artifactName(rng)
      target.questItem = { questId: q.id, name: q.item }
      q.title = `Recover the ${q.item}`
      q.desc = `${npc.name} of ${giverTown.name} wants the ${q.item} recovered from ${target.name}. Its guardian lurks in the deepest chamber.`
    } else {
      q.title = type === "bounty" ? `Bounty: ${target.name}` : `Clear ${target.name}`
      q.desc = `${npc.name} of ${giverTown.name} wants whatever rules ${target.name} put down for good. Slay the master of its deepest chamber, then return.`
    }
    return q
  }

  if (type === "deliver") {
    const others = world.towns.filter(t => t.id !== giverTown.id)
    const town = rng.pick(others)
    const recipient = rng.pick(town.npcs.filter(n => n.role !== "guard" && n.role !== "caravaner"))
    q.type = "deliver"
    q.recipient = recipient.id
    q.recipientName = recipient.name
    q.item = rng.pick(["Sealed Letter", "Package of Moon Sugar", "Ledger", "Crate of Scrolls", "Bundle of Kwama Eggs", "Sealed Writ"])
    q.title = `Deliver the ${q.item}`
    q.desc = `${npc.name} asked you to deliver a ${q.item} to ${recipient.name} in ${town.name}.`
    q.reward.gold = Math.round(q.reward.gold * 0.6)
    return q
  }

  // cull (and fallback)
  const creatureId = rng.pick(REGION_CREATURES.filter(id => CREATURES[id].level <= tierCap * 3 + 2))
  q.type = "cull"
  q.creature = creatureId
  q.count = rng.int(3, 6)
  q.killed = 0
  q.title = `Cull the ${CREATURES[creatureId].name}s`
  q.desc = `${npc.name} of ${giverTown.name} wants ${q.count} ${CREATURES[creatureId].name}s killed. They roam the wilds of Vvardenfell.`
  return q
}

export function rankFor(rep) {
  let r = 0
  for (let i = 0; i < RANK_REP.length; i++) if (rep >= RANK_REP[i]) r = i
  return r
}

// Promotion also requires favored-skill proficiency, as in Morrowind.
export function canPromote(character, factionId) {
  const m = character.factions[factionId]
  if (!m) return { ok: false, reason: "not a member" }
  const next = m.rank + 1
  if (next >= RANK_REP.length) return { ok: false, reason: "You have reached the highest rank." }
  if (m.rep < RANK_REP[next]) return { ok: false, reason: `You need more reputation (${m.rep}/${RANK_REP[next]}). Complete more duties.` }
  const need = 20 + next * 7
  const skills = FACTIONS[factionId].skills
  const best = Math.max(...skills.map(s => character.skills[s]))
  if (best < need) return { ok: false, reason: `You must reach ${need} in one of our favored skills first.` }
  return { ok: true, rank: next }
}
