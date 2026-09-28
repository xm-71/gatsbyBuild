// Where the player's goals are, for the compass and the map.
// Returns [{ x, z, label, kind }] in overworld coordinates.
export function questTargets(game) {
  const world = game.world
  const out = []
  const npcSpec = id => {
    for (const t of world.towns) for (const n of t.npcs) if (n.id === id) return n
    return null
  }
  const npcPos = id => {
    const live = game.overworld?.npcs.find(n => n.spec.id === id)
    if (live) return { x: live.pos.x, z: live.pos.z }
    const s = npcSpec(id)
    return s ? { x: s.x, z: s.z } : null
  }
  for (const q of game.quests) {
    if (q.status === "done" || q.type === "main") continue
    const hasItem = q.type === "retrieve" && game.char.inventory.some(i => i.questId === q.id)
    if (q.status === "ready" || hasItem) {
      const p = npcPos(q.giver)
      if (p) out.push({ ...p, label: `Return to ${q.giverName}`, kind: "quest" })
    } else if (q.type === "deliver") {
      const p = npcPos(q.recipient)
      if (p) out.push({ ...p, label: `Deliver to ${q.recipientName}`, kind: "quest" })
    } else if (q.dungeonId !== undefined) {
      const d = world.dungeons[q.dungeonId]
      if (d && !d.cleared) out.push({ x: d.x, z: d.z, label: d.name, kind: "quest" })
    }
  }
  const main = game.main?.stage ?? 0
  if (main === 0) {
    const blade = world.startTown.npcs.find(n => n.role === "blade")
    const p = blade && npcPos(blade.id)
    if (p) out.push({ ...p, label: "Blades contact", kind: "main" })
  } else if (main === 1) {
    const held = game.relicsHeld()
    for (const r of world.mainQuest.relics) {
      if (held.includes(r.name)) continue
      const d = world.dungeons[r.dungeonId]
      out.push({ x: d.x, z: d.z, label: `${r.name}: ${d.name}`, kind: "main" })
    }
  } else if (main === 2) {
    const d = world.dungeons[world.mainQuest.citadelId]
    out.push({ x: d.x, z: d.z, label: d.name, kind: "main" })
  }
  return out
}

// Discovered towns and places within range, for faint compass markers.
export function nearbyPlaces(game, x, z, range = 450) {
  const out = []
  for (const t of game.world.towns) if (game.knownTowns.has(t.id) && Math.hypot(t.x - x, t.z - z) < range * 1.6) out.push({ x: t.x, z: t.z, label: t.name, kind: "town" })
  for (const d of game.world.dungeons) if (d.discovered && Math.hypot(d.x - x, d.z - z) < range) out.push({ x: d.x, z: d.z, label: d.name, kind: d.cleared ? "cleared" : "place" })
  return out
}
