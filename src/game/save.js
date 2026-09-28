import { reserveItemUids } from "../logic/items.js"
import { reserveQuestIds } from "../logic/quests.js"

// Roguelike-style suspend save: one slot, written continuously while you play
// and deleted when the run ends, so a death can't be undone by reloading.
export const SAVE_KEY = "ashfall-run"
export const SAVE_VERSION = 1

export function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const save = JSON.parse(raw)
    return save && save.v === SAVE_VERSION ? save : null
  } catch {
    return null
  }
}

export function deleteSave() {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    /* storage unavailable */
  }
}

export function writeSave(game) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serializeRun(game)))
    return true
  } catch {
    return false
  }
}

function serializeChar(c) {
  const equipment = {}
  for (const [slot, item] of Object.entries(c.equipment)) if (item) equipment[slot] = item.uid
  const effects = c.effects.map(e => ({ ...e, prev: e.prev ? e.prev.uid : null }))
  return { ...c, equipment, effects }
}

function restoreChar(data) {
  const c = { ...data }
  const byUid = new Map(c.inventory.map(i => [i.uid, i]))
  c.equipment = {}
  for (const [slot, uid] of Object.entries(data.equipment || {})) if (byUid.has(uid)) c.equipment[slot] = byUid.get(uid)
  c.effects = (data.effects || []).map(e => ({ ...e, prev: e.prev != null ? byUid.get(e.prev) || null : null }))
  c.dead = false
  return c
}

function serializeDungeonState(ds) {
  const out = {}
  for (const [id, st] of Object.entries(ds)) {
    out[id] = { levels: {} }
    for (const [n, lv] of Object.entries(st.levels)) {
      out[id].levels[n] = {
        dead: [...lv.dead],
        chests: lv.chests,
        explored: lv.explored ? Array.from(lv.explored).join("") : null,
      }
    }
  }
  return out
}

function restoreDungeonState(data) {
  const out = {}
  for (const [id, st] of Object.entries(data || {})) {
    out[id] = { levels: {} }
    for (const [n, lv] of Object.entries(st.levels)) {
      const level = { dead: new Set(lv.dead), chests: lv.chests || {} }
      if (lv.explored) level.explored = Uint8Array.from(lv.explored, ch => (ch === "1" ? 1 : 0))
      out[id].levels[n] = level
    }
  }
  return out
}

export function serializeRun(game) {
  const pc = game.pc
  const area =
    game.area.kind === "dungeon"
      ? { kind: "dungeon", id: game.area.dungeon.id, level: game.area.levelIndex, returnPos: game.returnPos }
      : { kind: "overworld" }
  return {
    v: SAVE_VERSION,
    savedAt: Date.now(),
    seed: game.seed,
    char: serializeChar(game.char),
    pc: { x: pc.pos.x, y: pc.pos.y, z: pc.pos.z, yaw: pc.yaw, pitch: pc.pitch, sneaking: pc.sneaking },
    area,
    time: game.time,
    weather: game.weather,
    weatherT: game.weatherT,
    quests: game.quests,
    journal: game.journal,
    main: game.main,
    knownTowns: [...game.knownTowns],
    trainedThisLevel: game.trainedThisLevel,
    merchantStock: [...game.merchantStock],
    dispositionMod: [...game.dispositionMod],
    dungeonState: serializeDungeonState(game.dungeonState),
    dungeons: game.world.dungeons.map(d => ({ discovered: d.discovered, cleared: d.cleared, sealed: !!d.sealed, questId: d.questId ?? null, questItem: d.questItem ?? null })),
  }
}

// Summary shown on the title screen's Continue button.
export function describeSave(save) {
  const c = save.char
  return { name: c.name, race: c.race, cls: c.cls, level: c.level, day: Math.floor(save.time / 24) + 1, seed: save.seed }
}

// Apply a save's state onto a game whose world was regenerated from the same seed.
export function restoreRun(game, save) {
  const c = restoreChar(save.char)
  let maxUid = 0
  const scan = items => items.forEach(i => (maxUid = Math.max(maxUid, i.uid || 0)))
  scan(c.inventory)
  for (const [, stock] of save.merchantStock) scan(stock.items)
  for (const st of Object.values(save.dungeonState || {})) for (const lv of Object.values(st.levels)) for (const ch of Object.values(lv.chests || {})) scan(ch.items || [])
  reserveItemUids(maxUid)
  reserveQuestIds(Math.max(0, ...save.quests.map(q => Number(String(q.id).replace(/\D/g, "")) || 0)))

  game.char = c
  game.time = save.time
  game.day = Math.floor(save.time / 24)
  game.weather = save.weather
  game.weatherT = save.weatherT
  game.quests = save.quests
  game.journal = save.journal
  game.main = save.main
  game.knownTowns = new Set(save.knownTowns)
  game.trainedThisLevel = save.trainedThisLevel
  game.merchantStock = new Map(save.merchantStock)
  game.dispositionMod = new Map(save.dispositionMod)
  game.dungeonState = restoreDungeonState(save.dungeonState)
  save.dungeons.forEach((d, i) => {
    const w = game.world.dungeons[i]
    if (!w) return
    w.discovered = d.discovered
    w.cleared = d.cleared
    w.sealed = d.sealed
    if (d.questId) w.questId = d.questId
    else delete w.questId
    if (d.questItem) w.questItem = d.questItem
    else delete w.questItem
  })
}
