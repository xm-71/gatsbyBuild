import { test } from "node:test"
import assert from "node:assert/strict"
import { RNG } from "../src/core/rng.js"
import { generateWorld, SEA_LEVEL } from "../src/logic/worldgen.js"
import { generateDungeonLevel, bfsDistances, FLOOR } from "../src/logic/dungeongen.js"
import { createCharacter, exerciseSkill, levelUp, canLevelUp, maxHealth, attrMultiplier } from "../src/logic/character.js"
import { RACES, CLASSES, BIRTHSIGNS } from "../src/data/stats.js"
import { randomLoot, makeItemFromSpec } from "../src/logic/items.js"
import { generateQuest, canPromote } from "../src/logic/quests.js"
import { hitChance, applyArmor } from "../src/logic/combat.js"

test("rng is deterministic per seed", () => {
  const a = new RNG("seed")
  const b = new RNG("seed")
  for (let i = 0; i < 10; i++) assert.equal(a.next(), b.next())
})

test("world generation is deterministic and populated", () => {
  const w1 = generateWorld("test-1")
  const w2 = generateWorld("test-1")
  assert.equal(w1.towns.length, w2.towns.length)
  assert.deepEqual(w1.towns.map(t => t.name), w2.towns.map(t => t.name))
  assert.ok(w1.towns.length >= 4, `expected several towns, got ${w1.towns.length}`)
  assert.ok(w1.dungeons.length >= 10, `expected many dungeons, got ${w1.dungeons.length}`)
  assert.ok(w1.startTown.start)
  for (const t of w1.towns) assert.ok(w1.heightAt(t.x, t.z) > SEA_LEVEL, `${t.name} is underwater`)
  assert.equal(w1.mainQuest.relics.length, 3)
  assert.ok(w1.dungeons.find(d => d.citadel))
  assert.ok(w1.flora.length > 500)
})

test("different seeds give different worlds", () => {
  const a = generateWorld("alpha")
  const b = generateWorld("beta")
  assert.notDeepEqual(a.towns.map(t => t.name), b.towns.map(t => t.name))
})

for (const type of ["cave", "tomb", "dwemer", "daedric", "citadel"]) {
  test(`dungeon ${type} levels are connected`, () => {
    for (let level = 0; level < 3; level++) {
      const lvl = generateDungeonLevel({ seed: 42 + level, type, tier: 3, level, levels: 3, citadel: type === "citadel" })
      const dist = bfsDistances(lvl.grid, lvl.w, lvl.h, lvl.entry)
      assert.equal(lvl.grid[lvl.entry.y * lvl.w + lvl.entry.x], FLOOR)
      if (lvl.stairsDown) assert.ok(dist[lvl.stairsDown.y * lvl.w + lvl.stairsDown.x] > 0, "stairs reachable")
      for (const s of lvl.spawns) assert.ok(dist[s.y * lvl.w + s.x] >= 0, "spawn reachable")
      if (lvl.isBottom) assert.ok(lvl.spawns.some(s => s.boss))
    }
  })
}

test("every race/class/sign combination creates a valid character", () => {
  for (const race of Object.keys(RACES))
    for (const cls of Object.keys(CLASSES))
      for (const sign of Object.keys(BIRTHSIGNS)) {
        const c = createCharacter({ name: "T", race, cls, sign })
        assert.ok(c.health > 0 && c.magicka >= 0 && c.fatigue > 0)
        assert.ok(Object.values(c.skills).every(v => v >= 5 && v <= 100))
      }
})

test("skills level by use and grant levels", () => {
  const c = createCharacter({ name: "T", race: "nord", cls: "warrior", sign: "warrior" })
  const before = c.skills.longBlade
  let ready = false
  for (let i = 0; i < 4000 && !ready; i++) {
    const ev = exerciseSkill(c, "longBlade", 1)
    if (ev.some(e => e.type === "levelReady")) ready = true
  }
  assert.ok(c.skills.longBlade >= before + 10)
  assert.ok(canLevelUp(c))
  assert.equal(attrMultiplier(c, "strength"), 5)
  const hp = maxHealth(c)
  const str = c.attrs.strength
  assert.ok(levelUp(c, ["strength", "endurance", "agility"]))
  assert.equal(c.level, 2)
  assert.equal(c.attrs.strength, Math.min(100, str + 5))
  assert.ok(maxHealth(c) > hp)
})

test("loot and item specs", () => {
  const rng = new RNG(5)
  for (let tier = 1; tier <= 7; tier++) {
    const loot = randomLoot(rng, tier, "tomb", 6)
    assert.equal(loot.length, 6)
    for (const it of loot) assert.ok(it.name && it.value >= 0)
  }
  for (const cls of Object.values(CLASSES)) for (const spec of cls.kit) assert.ok(makeItemFromSpec(spec))
})

test("quests target real places", () => {
  const world = generateWorld("quests")
  const rng = new RNG(9)
  const npc = world.startTown.npcs[0]
  for (let i = 0; i < 20; i++) {
    const q = generateQuest(rng, world, npc, "fightersGuild", 3)
    assert.ok(q.title && q.desc)
    if (q.dungeonId !== undefined) assert.ok(world.dungeons[q.dungeonId])
  }
  const c = createCharacter({ name: "T", race: "dunmer", cls: "mage", sign: "mage" })
  assert.equal(canPromote(c, "magesGuild").ok, false)
})

test("combat formulas stay in range", () => {
  assert.ok(hitChance({ skill: 5, agility: 10, luck: 10, fatigue: 0 }, 100) >= 0.08)
  assert.ok(hitChance({ skill: 100, agility: 100, luck: 100, fatigue: 1 }, 0) <= 0.98)
  assert.ok(applyArmor(10, 1000) >= 2.5)
})
