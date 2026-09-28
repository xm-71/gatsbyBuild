import * as THREE from "three"
import { SEA_LEVEL } from "../logic/worldgen.js"
import { settings } from "../core/settings.js"
import { getAttr, getSkill, maxHealth, maxMagicka, maxFatigue, fatigueRatio, moveSpeed, jumpVelocity, encumbrance, addEffect, addItem, equip, removeItem, canLevelUp, itemForSlot } from "../logic/character.js"
import { hitChance, meleeDamage, spellChance, lockpickChance } from "../logic/combat.js"
import { makeItemFromSpec } from "../logic/items.js"
import { getSpell } from "../data/spells.js"
import { BIRTHSIGNS } from "../data/stats.js"
import { Projectile, ELEMENT_COLOR } from "./actors.js"
import { RNG } from "../core/rng.js"
import { randomLoot } from "../logic/items.js"
import { DUNGEON_THEMES } from "../logic/dungeongen.js"
import { weaponClass } from "../audio/sfx.js"

const REGION_SURFACE = { ashlands: "ash", redMountain: "ash", molagAmur: "ash", bitterCoast: "mud", azurasCoast: "gravel", westGash: "grass", ascadian: "grass", grazelands: "grass" }
const DUNGEON_SURFACE = { cave: "gravel", tomb: "stone", dwemer: "metal", daedric: "stone", citadel: "flesh" }

// What the player is standing on, for footstep sounds.
export function surfaceUnder(game) {
  const pc = game.pc
  const area = game.area
  if (pc.swimming) return "water"
  if (area.kind === "dungeon") return DUNGEON_SURFACE[area.dungeon.type] || "stone"
  if (pc.pos.y < SEA_LEVEL + 0.15) return "water"
  const w = game.world
  if (pc.pos.y > w.heightAt(pc.pos.x, pc.pos.z) + 0.4) return "wood" // docks, stairs and floors
  const town = area.townAt(pc.pos.x, pc.pos.z)
  if (town) return Math.hypot(pc.pos.x - town.x, pc.pos.z - town.z) < town.radius * 0.45 ? "stone" : "gravel"
  return REGION_SURFACE[w.regionAt(pc.pos.x, pc.pos.z)] || "grass"
}

// 0 (cloth) .. 1 (full heavy armour): how weighty footsteps sound.
export function armorWeight(c) {
  const share = { cuirass: 0.4, greaves: 0.2, boots: 0.2, helm: 0.1, gauntlets: 0.1 }
  let w = 0
  for (const [slot, k] of Object.entries(share)) {
    const it = c.equipment[slot]
    if (it?.armorClass === "heavyArmor") w += k
    else if (it?.armorClass === "mediumArmor") w += k * 0.5
  }
  return w
}

const FIST = { damage: [1, 3], speed: 1.5, reach: 1.7, skill: "handToHand", weight: 0 }

export function updatePlayer(game, dt) {
  const c = game.char
  const pc = game.pc
  const inp = game.input
  const area = game.area

  // ---- look ----
  pc.yaw -= inp.mouseDX * inp.sensitivity
  pc.pitch = Math.max(-1.52, Math.min(1.52, pc.pitch - inp.mouseDY * inp.sensitivity * (settings.invertY ? -1 : 1)))

  // ---- toggles & hotkeys ----
  if (inp.actionPressed("sneak")) {
    pc.sneaking = !pc.sneaking
    game.msg(pc.sneaking ? "Sneaking" : "Standing", "#a8a090")
  }
  if (inp.actionPressed("inventory") || inp.wasPressed("KeyI")) return game.ui.openMenu("inventory")
  if (inp.actionPressed("journal")) return game.ui.openMenu("journal")
  if (inp.actionPressed("map")) return game.ui.openMenu("map")
  if (inp.actionPressed("character")) return game.ui.openMenu("character")
  if (inp.actionPressed("rest")) return tryRest(game)
  if (inp.actionPressed("quaff")) quickPotion(game)
  if (inp.wheel || inp.wasPressed("BracketRight") || inp.wasPressed("BracketLeft")) cycleSpell(game, inp.wheel || (inp.wasPressed("BracketLeft") ? -1 : 1))
  for (let i = 1; i <= 9; i++) if (inp.wasPressed(`Digit${i}`)) useQuickslot(game, i - 1)

  // ---- movement ----
  const fwd = new THREE.Vector3(-Math.sin(pc.yaw), 0, -Math.cos(pc.yaw))
  const right = new THREE.Vector3(Math.cos(pc.yaw), 0, -Math.sin(pc.yaw))
  const wish = new THREE.Vector3()
  if (inp.action("forward") || inp.down("ArrowUp")) wish.add(fwd)
  if (inp.action("back") || inp.down("ArrowDown")) wish.sub(fwd)
  if (inp.action("right") || inp.down("ArrowRight")) wish.add(right)
  if (inp.action("left") || inp.down("ArrowLeft")) wish.sub(right)
  const moving = wish.lengthSq() > 0
  if (moving) wish.normalize()
  const sprint = moving && (inp.action("sprint") || inp.down("ShiftRight")) && c.fatigue > 3 && !pc.sneaking
  pc.sprinting = sprint
  let speed = moveSpeed(c) * (sprint ? 1.65 : 1) * (pc.sneaking ? 0.5 : 1) * (pc.swimming ? 0.6 : 1) * (c.fatigue <= 0 ? 0.7 : 1)
  if (pc.charging) speed *= 0.7
  const accel = pc.onGround || pc.swimming ? 12 : 2.5
  pc.vel.x += (wish.x * speed - pc.vel.x) * Math.min(1, accel * dt)
  pc.vel.z += (wish.z * speed - pc.vel.z) * Math.min(1, accel * dt)
  if (sprint) c.fatigue = Math.max(0, c.fatigue - 7 * dt)

  if (inp.actionPressed("jump") && (pc.onGround || pc.swimming) && c.fatigue >= 3) {
    pc.vel.y = pc.swimming ? 4 : jumpVelocity(c)
    pc.onGround = false
    c.fatigue = Math.max(0, c.fatigue - (5 + encumbrance(c) / 25))
    if (!pc.swimming) game.exercise("acrobatics", 0.45)
  }
  if (!pc.swimming) pc.vel.y -= 18 * dt

  const prevY = pc.pos.y
  pc.pos.x += pc.vel.x * dt
  pc.pos.z += pc.vel.z * dt
  pc.pos.y += pc.vel.y * dt
  area.resolve(pc.pos, 0.4, pc.pos.y)
  if (area.kind === "overworld") {
    for (const n of area.npcs) {
      const dx = pc.pos.x - n.pos.x
      const dz = pc.pos.z - n.pos.z
      const d = Math.hypot(dx, dz)
      if (d < 0.75 && d > 1e-4) {
        pc.pos.x = n.pos.x + (dx / d) * 0.75
        pc.pos.z = n.pos.z + (dz / d) * 0.75
      }
    }
  }
  for (const e of area.enemies) {
    if (e.dead || e.def.flying) continue
    const dx = pc.pos.x - e.pos.x
    const dz = pc.pos.z - e.pos.z
    const d = Math.hypot(dx, dz)
    const min = e.radius + 0.4
    if (d < min && d > 1e-4) {
      pc.pos.x = e.pos.x + (dx / d) * min
      pc.pos.z = e.pos.z + (dz / d) * min
    }
  }

  const ground = area.groundHeight(pc.pos.x, pc.pos.z)
  const wasOnGround = pc.onGround
  pc.swimming = false
  if (area.kind === "overworld" && ground < SEA_LEVEL - 1.25) {
    // swim at the surface
    if (pc.pos.y <= SEA_LEVEL - 1.25) {
      pc.swimming = true
      pc.pos.y = SEA_LEVEL - 1.25
      pc.vel.y = Math.max(0, pc.vel.y)
      pc.onGround = false
      if (moving) game.exercise("athletics", 0.07 * dt * 10)
    }
  }
  if (!pc.swimming) {
    if (pc.pos.y <= ground) {
      if (!wasOnGround && pc.vel.y < -11) {
        const fall = (-pc.vel.y - 11) ** 2 * 0.9 * Math.max(0.2, 1 - getSkill(c, "acrobatics") / 130)
        if (fall > 1) {
          game.damagePlayer(fall, { quiet: false })
          game.exercise("acrobatics", 1)
          game.msg("Oof!", "#ff9a7a")
        }
      }
      pc.pos.y = ground
      pc.vel.y = 0
      pc.onGround = true
    } else if (wasOnGround && pc.vel.y <= 0 && pc.pos.y - ground < 0.7) {
      pc.pos.y = ground // walk down slopes
      pc.vel.y = 0
      pc.onGround = true
    } else pc.onGround = false
  }
  if (area.kind === "dungeon" && pc.pos.y + 1.7 > area.height) {
    pc.pos.y = area.height - 1.7
    pc.vel.y = Math.min(0, pc.vel.y)
  }

  if (moving && pc.onGround) {
    game.exercise("athletics", (sprint ? 0.1 : 0.04) * dt * 10 * 0.1)
    pc.stepT -= dt * (sprint ? 1.6 : 1)
    if (pc.stepT <= 0) {
      pc.stepT = 0.5
      game.audio.step(surfaceUnder(game), armorWeight(c), null, pc.sneaking ? 0.4 : sprint ? 1.3 : 1)
    }
    if (pc.sneaking && area.enemies.some(e => !e.dead && !e.aware && e.pos.distanceTo(pc.pos) < 20)) game.exercise("sneak", dt * 0.25)
  }
  void prevY

  // ---- camera ----
  const eye = pc.sneaking ? 1.15 : 1.62
  game.camera.position.set(pc.pos.x, pc.pos.y + eye, pc.pos.z)
  game.camera.rotation.set(pc.pitch, pc.yaw, 0)
  game.viewmodel.build(currentWeapon(c), c.equipment.shield, c.equipment.cuirass, c.equipment.gauntlets)
  game.viewmodel.update(dt, moving && pc.onGround, sprint)

  updateAttack(game, dt)
  pc.castCd -= dt
  if (inp.actionPressed("cast") || inp.wasPressed("Mouse2")) castSelected(game)
  updateInteraction(game)
}

export function currentWeapon(c) {
  return c.equipment.weapon || null
}

// ---------------- melee & ranged ----------------

function updateAttack(game, dt) {
  const c = game.char
  const pc = game.pc
  const inp = game.input
  const w = currentWeapon(c) || FIST
  pc.attackCd -= dt
  if (inp.mouseClicked && pc.attackCd <= 0 && !pc.charging) {
    if (w.ranged && !findAmmo(c)) {
      game.msg("You have no arrows.", "#ff9a7a")
    } else {
      pc.charging = true
      pc.chargeT = 0
    }
  }
  const fullDraw = 0.75 / w.speed
  if (pc.charging) {
    pc.chargeT += dt
    game.viewmodel.draw = Math.min(1, pc.chargeT / fullDraw)
    if (!inp.mouseDown) {
      const charge = Math.min(1, pc.chargeT / fullDraw)
      pc.charging = false
      game.viewmodel.draw = 0
      pc.attackCd = 0.35 / w.speed
      c.fatigue = Math.max(0, c.fatigue - (2 + (w.weight || 0) * 0.12))
      if (w.ranged) fireArrow(game, w, charge)
      else {
        game.viewmodel.swing = 1
        game.audio.play("swing", { weight: w.weight })
        pc.pendingHit = { t: 0.13, charge, weapon: w }
      }
    }
  }
  if (pc.pendingHit) {
    pc.pendingHit.t -= dt
    if (pc.pendingHit.t <= 0) {
      meleeHit(game, pc.pendingHit.weapon, pc.pendingHit.charge)
      pc.pendingHit = null
    }
  }
}

function attackStats(game, skill) {
  const c = game.char
  return {
    skill: getSkill(c, skill),
    agility: getAttr(c, "agility"),
    luck: getAttr(c, "luck"),
    fatigue: fatigueRatio(c),
    bonus: BIRTHSIGNS[c.sign].attack || 0,
  }
}

function meleeHit(game, w, charge) {
  const c = game.char
  const pc = game.pc
  const fx = -Math.sin(pc.yaw)
  const fz = -Math.cos(pc.yaw)
  let best = null
  let bestD = Infinity
  for (const e of game.area.enemies) {
    if (e.dead) continue
    const dx = e.pos.x - pc.pos.x
    const dz = e.pos.z - pc.pos.z
    const d = Math.hypot(dx, dz)
    if (d > w.reach + e.radius + 0.4) continue
    const dy = e.pos.y - pc.pos.y
    if (dy > 2.4 + (e.def.flying ? 1.5 : 0) || dy < -2.2) continue
    if (d > 0.8 && (dx * fx + dz * fz) / d < 0.55) continue
    if (d < bestD) {
      bestD = d
      best = e
    }
  }
  if (!best) return
  const chance = hitChance(attackStats(game, w.skill), best.evasion)
  game.setTarget(best)
  if (Math.random() > chance) return game.audio.play("whiff", { pos: best.center })
  let dmg = meleeDamage(w.damage, getAttr(c, "strength"), charge)
  if (w === FIST) dmg += getSkill(c, "handToHand") / 12
  const sneak = game.pc.sneaking && !best.aware
  if (sneak) dmg *= 3
  const dealt = best.takeDamage(dmg, { physical: true, silver: w.silver || w.bound || w.relic })
  if (w.enchant?.element) best.takeDamage(w.enchant.amount * (0.6 + charge * 0.4), { element: w.enchant.element })
  if (w.enchant?.absorb) {
    const a = w.enchant.amount * (0.6 + charge * 0.4)
    best.takeDamage(a, {})
    c.health = Math.min(maxHealth(c), c.health + a)
  }
  game.audio.hit(best.material, weaponClass(w), best.center, 0.7 + charge * 0.5)
  game.exercise(w.skill, 1)
  if (sneak && dealt > 0) game.msg("Sneak attack! Critical hit.", "#ffe080")
}

function findAmmo(c) {
  if (c.equipment.ammo && c.inventory.includes(c.equipment.ammo)) return c.equipment.ammo
  return c.inventory.find(i => i.kind === "ammo") || null
}

function fireArrow(game, w, charge) {
  const c = game.char
  const ammo = findAmmo(c)
  if (!ammo) return
  removeItem(c, ammo, 1)
  if (!c.inventory.includes(ammo) && c.equipment.ammo === ammo) delete c.equipment.ammo
  const cam = game.camera.getWorldPosition(new THREE.Vector3())
  const dir = game.camera.getWorldDirection(new THREE.Vector3())
  const pos = cam.clone().addScaledVector(dir, 0.6)
  const speed = 18 + 32 * charge
  // Marksman accuracy is rolled on release, like Morrowind.
  const hit = Math.random() < hitChance(attackStats(game, "marksman"), 0)
  if (!hit) {
    dir.x += (Math.random() - 0.5) * 0.12
    dir.y += (Math.random() - 0.5) * 0.08
    dir.normalize()
  }
  const dmg = (w.damage[0] + (w.damage[1] - w.damage[0]) * charge + ammo.bonus) * (0.5 + getAttr(c, "strength") / 200)
  const sneak = game.pc.sneaking
  game.projectiles.push(
    new Projectile(game, game.area, {
      pos,
      vel: dir.multiplyScalar(speed),
      owner: "player",
      arrow: { damage: sneak ? dmg * 2 : dmg, silver: w.silver, enchant: w.enchant, sneak },
      gravity: 6,
    })
  )
  game.audio.play("bow")
}

// ---------------- magic ----------------

function knownCastables(c) {
  return [...c.spells, ...c.powers]
}

function cycleSpell(game, delta) {
  const c = game.char
  const list = knownCastables(c)
  if (!list.length) return
  const i = list.indexOf(c.selectedSpell)
  c.selectedSpell = list[(i + delta + list.length) % list.length]
  game.msg(`Selected: ${getSpell(c.selectedSpell).name}`, "#a0c0ff")
}

// Use quick-slot i (0-based): equip gear, drink or eat consumables, or ready a spell.
export function useQuickslot(game, i) {
  const c = game.char
  const slot = c.quickslots?.[i]
  if (!slot) return game.msg(`Quick-slot ${i + 1} is empty. Assign it from the inventory or magic menu.`, "#a8a090")
  if (slot.type === "spell") {
    if (!c.spells.includes(slot.id) && !c.powers.includes(slot.id)) return game.msg("You no longer know that spell.", "#ff9a7a")
    c.selectedSpell = slot.id
    return game.msg(`Selected: ${getSpell(slot.id).name}`, "#a0c0ff")
  }
  const item = itemForSlot(c, slot)
  if (!item) return game.msg(`You have no ${slot.name} left.`, "#ff9a7a")
  if (item.kind === "potion") return usePotion(game, item)
  if (item.eat && item.kind === "misc") return eatItem(game, item)
  if (item.kind === "weapon" || item.kind === "armor" || item.kind === "ammo") {
    equip(c, item)
    game.audio.play("pickup")
    return game.msg(`Equipped: ${item.name}`, "#c9b88f")
  }
  game.msg(`${item.name} can't be used from a quick-slot.`, "#a8a090")
}

export function castSelected(game) {
  const c = game.char
  const pc = game.pc
  if (pc.castCd > 0 || !c.selectedSpell) {
    if (!c.selectedSpell) game.msg("You know no spells.", "#a8a090")
    return
  }
  const spell = getSpell(c.selectedSpell)
  pc.castCd = 0.9
  if (spell.power) {
    if (c.powersUsed[spell.id]) return game.msg(`You can only use ${spell.name} once a day.`, "#ff9a7a")
    c.powersUsed[spell.id] = true
  } else {
    if (c.magicka < spell.cost) return game.msg("You do not have enough Magicka to cast the spell.", "#ff9a7a")
    c.magicka -= spell.cost
    const chance = spellChance({ skill: getSkill(c, spell.school), willpower: getAttr(c, "willpower"), luck: getAttr(c, "luck"), fatigue: fatigueRatio(c) }, spell.cost)
    if (Math.random() > chance) {
      game.audio.play("fizzle")
      game.viewmodel.cast(0x666666)
      return game.msg("You failed casting the spell.", "#ff9a7a")
    }
    game.exercise(spell.school, 1)
  }
  c.stats.spellsCast++
  const el = spell.effects.find(e => e.element)?.element
  const color = el ? ELEMENT_COLOR[el] : spell.school === "restoration" ? 0x80ff90 : spell.school === "illusion" ? 0xe0a0ff : 0xa0c0ff
  game.viewmodel.cast(color)
  game.audio.play("spell", { element: el || (spell.school === "restoration" ? "restore" : null) })
  if (spell.delivery === "self") return applySelfSpell(game, spell)
  if (spell.delivery === "touch") return applyTouchSpell(game, spell)
  const cam = game.camera.getWorldPosition(new THREE.Vector3())
  const dir = game.camera.getWorldDirection(new THREE.Vector3())
  game.projectiles.push(new Projectile(game, game.area, { pos: cam.clone().addScaledVector(dir, 0.8).add(new THREE.Vector3(0, -0.15, 0)), vel: dir.multiplyScalar(24), owner: "player", spell, color }))
  for (const e of spell.effects) if (e.type === "selfDamage") game.damagePlayer(e.amount, { quiet: true })
}

function roll(a) {
  return a[0] + Math.random() * (a[1] - a[0])
}

function applySelfSpell(game, spell) {
  const c = game.char
  const skillMult = spell.power ? 1 : 0.8 + getSkill(c, spell.school) / 150
  for (const e of spell.effects) {
    switch (e.type) {
      case "heal":
        c.health = Math.min(maxHealth(c), c.health + roll(e.amount) * skillMult)
        c.poison = 0
        break
      case "restoreFatigue":
        c.fatigue = Math.min(maxFatigue(c), c.fatigue + roll(e.amount) * skillMult)
        break
      case "shield":
        addEffect(c, { type: "shield", amount: e.amount, remaining: e.duration, label: spell.name })
        break
      case "jump":
        addEffect(c, { type: "jump", amount: e.amount, remaining: e.duration, label: spell.name })
        break
      case "light":
        addEffect(c, { type: "light", amount: 1, remaining: e.duration, label: spell.name })
        break
      case "chameleon":
        addEffect(c, { type: "chameleon", amount: e.amount, remaining: e.duration, label: spell.name })
        break
      case "detect":
        addEffect(c, { type: "detect", amount: 1, remaining: e.duration, label: spell.name })
        break
      case "teleport": {
        const towns = game.world.towns.filter(t => (e.to === "temple" ? t.hasTemple : t.hasFort))
        const pool = towns.length ? towns : game.world.towns
        const from = game.area.kind === "dungeon" ? game.returnPos : game.pc.pos
        const nearest = [...pool].sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z))[0]
        game.teleportToTown(nearest)
        game.msg(`You are whisked away to ${nearest.name}.`, "#a0c0ff")
        break
      }
      case "bound": {
        const prev = c.equipment.weapon
        const existing = c.inventory.find(i => i.bound)
        if (existing) removeItem(c, existing)
        const item = makeItemFromSpec(e.item)
        item.name = `Bound ${item.base[0].toUpperCase()}${item.base.slice(1)}`
        item.bound = true
        item.weight = 0
        item.value = 0
        addItem(c, item)
        equip(c, item)
        c.effects = c.effects.filter(x => x.type !== "bound")
        addEffect(c, { type: "bound", key: item.uid, amount: 0, remaining: e.duration, prev: prev && !prev.bound ? prev : null })
        game.msg(`A ${item.name} materializes in your hand.`, "#a0c0ff")
        break
      }
    }
  }
}

function applyTouchSpell(game, spell) {
  const t = game.ui.target
  for (const e of spell.effects) {
    if (e.type === "open") {
      if (t?.type === "chest" && t.ref.state.locked) {
        const c = game.char
        const power = e.amount + getSkill(c, "alteration") / 2
        if (power >= t.ref.state.lockLevel) {
          t.ref.state.locked = false
          game.audio.play("unlock")
          game.msg("The lock clicks open.", "#c9b88f")
        } else game.msg("The lock is too strong for this spell.", "#ff9a7a")
      } else game.msg("There is nothing to open.", "#a8a090")
    }
  }
}

export function spellEffectsOnEnemy(game, spell, enemy) {
  const c = game.char
  const skillMult = spell.power ? 1 : 0.8 + getSkill(c, spell.school) / 150
  for (const e of spell.effects) {
    if (e.type === "damage") enemy.takeDamage(roll(e.amount) * skillMult, { element: e.element })
    else if (e.type === "calm") {
      if (enemy.boss || enemy.level > 6 + getSkill(c, "illusion") / 8) game.msg(`${enemy.name} resists.`, "#a8a090")
      else {
        enemy.calmed = e.duration
        enemy.aware = false
        game.msg(`${enemy.name} is calmed.`, "#e0a0ff")
      }
    } else if (e.type === "paralyze") {
      if (enemy.boss && Math.random() < 0.5) game.msg(`${enemy.name} resists.`, "#a8a090")
      else {
        enemy.paralyzed = e.duration
        enemy.aware = true
        game.msg(`${enemy.name} is paralyzed!`, "#e0a0ff")
      }
    }
  }
}

// ---------------- items ----------------

export function usePotion(game, item) {
  const c = game.char
  switch (item.effect) {
    case "heal":
      c.health = Math.min(maxHealth(c), c.health + item.amount)
      break
    case "magicka":
      c.magicka = Math.min(maxMagicka(c), c.magicka + item.amount)
      break
    case "fatigue":
      c.fatigue = Math.min(maxFatigue(c), c.fatigue + item.amount)
      break
    case "cure":
      c.poison = 0
      break
    case "fortify":
      addEffect(c, { type: "fortify", key: item.attr, amount: item.amount, remaining: item.duration, label: item.name })
      break
    case "resist":
      addEffect(c, { type: "resist", key: item.element, amount: item.amount, remaining: item.duration, label: item.name })
      break
  }
  removeItem(c, item, 1)
  game.audio.play("pickup")
  game.msg(`You drink the ${item.name}.`, "#c9b88f")
}

export function eatItem(game, item) {
  const c = game.char
  const e = item.eat || {}
  if (e.health) c.health = Math.max(1, Math.min(maxHealth(c), c.health + e.health))
  if (e.magicka) c.magicka = Math.min(maxMagicka(c), c.magicka + e.magicka)
  if (e.fatigue) c.fatigue = Math.min(maxFatigue(c), c.fatigue + e.fatigue)
  removeItem(c, item, 1)
  game.msg(`You eat the ${item.name}.`, "#c9b88f")
}

function quickPotion(game) {
  const c = game.char
  const potions = c.inventory.filter(i => i.kind === "potion" && i.effect === "heal").sort((a, b) => a.amount - b.amount)
  if (!potions.length) return game.msg("You have no healing potions.", "#ff9a7a")
  usePotion(game, potions[0])
}

// ---------------- interaction ----------------

function updateInteraction(game) {
  const cam = game.camera.getWorldPosition(new THREE.Vector3())
  const dir = game.camera.getWorldDirection(new THREE.Vector3())
  let best = null
  let bestScore = Infinity
  for (const it of game.area.interactables()) {
    const v = it.pos.clone().sub(cam)
    const d = v.length()
    if (d > it.range + 1.2) continue
    const ang = Math.acos(Math.max(-1, Math.min(1, v.divideScalar(d || 1).dot(dir))))
    const limit = Math.atan2(1.0, d) + 0.1
    if (ang < limit && ang < bestScore) {
      bestScore = ang
      best = it
    }
  }
  // enemy under crosshair for the health bar
  for (const e of game.area.enemies) {
    if (e.dead) continue
    const v = e.center.sub(cam)
    const d = v.length()
    if (d < 40 && v.normalize().dot(dir) > 0.985) game.setTarget(e)
  }
  game.ui.target = best
  if (best && game.input.actionPressed("activate")) activate(game, best)
}

function activate(game, it) {
  const c = game.char
  switch (it.type) {
    case "npc":
      return game.ui.openDialogue(it.ref)
    case "door":
      return game.enterDungeon(it.ref)
    case "stairsUp":
      if (game.area.levelIndex === 0) return game.exitDungeon()
      return game.loadDungeonLevel(game.area.dungeon, game.area.levelIndex - 1, true)
    case "stairsDown":
      return game.loadDungeonLevel(game.area.dungeon, game.area.levelIndex + 1, false)
    case "corpse":
      return game.ui.openContainer(it.ref.name, it.ref)
    case "sack":
      return game.ui.openContainer("Dropped Items", it.ref)
    case "chest": {
      const ch = it.ref
      if (ch.state.locked) {
        const pick = c.inventory.filter(i => i.kind === "lockpick").sort((a, b) => b.mult - a.mult)[0]
        if (!pick) return game.msg("This chest is locked. You need a lockpick or an Open spell.", "#ff9a7a")
        const chance = lockpickChance(getSkill(c, "security"), getAttr(c, "agility"), getAttr(c, "luck"), ch.state.lockLevel, pick.mult)
        game.exercise("security", 0.5)
        if (Math.random() < chance) {
          ch.state.locked = false
          game.audio.play("unlock")
          game.exercise("security", 1)
          game.msg("You picked the lock.", "#c9b88f")
        } else {
          if (Math.random() < 0.3) {
            removeItem(c, pick, 1)
            game.msg(`Your ${pick.name} broke. (chance ${Math.round(chance * 100)}%)`, "#ff9a7a")
          } else game.msg(`You failed to pick the lock. (chance ${Math.round(chance * 100)}%)`, "#ff9a7a")
        }
        return
      }
      if (!ch.state.opened) {
        ch.state.opened = true
        const rng = new RNG(ch.def.seed)
        const tag = DUNGEON_THEMES[game.area.dungeon.type].lootTag
        ch.state.items = randomLoot(rng, Math.min(7, ch.def.tier), tag)
        ch.state.gold = rng.int(5, 30) * ch.def.tier
        ch.mesh.userData.lid.rotation.x = -1.2
        game.audio.play("door")
      }
      return game.ui.openContainer("Chest", { get loot() { return ch.state.items }, set loot(v) { ch.state.items = v }, get gold() { return ch.state.gold }, set gold(v) { ch.state.gold = v } })
    }
  }
}

// ---------------- rest ----------------

function tryRest(game) {
  const c = game.char
  const near = game.area.enemies.some(e => !e.dead && e.aware && e.pos.distanceTo(game.pc.pos) < 40)
  if (near) return game.msg("You cannot rest with enemies nearby.", "#ff9a7a")
  const inTown = game.area.kind === "overworld" && game.area.townAt(game.pc.pos.x, game.pc.pos.z)
  game.ui.openRest(inTown ? 0 : game.area.kind === "dungeon" ? 0.35 : 0.25)
  void canLevelUp
}

export function doRest(game, hours, ambushChance) {
  const c = game.char
  let slept = 0
  for (let h = 0; h < hours; h++) {
    if (Math.random() < ambushChance / hours && h > 0) {
      game.advanceTime(slept)
      spawnAmbush(game)
      game.msg("Your rest is interrupted!", "#ff7a5a")
      return false
    }
    slept++
    c.health = Math.min(maxHealth(c), c.health + getAttr(c, "endurance") * 0.1 * 1.5)
    c.magicka = Math.min(maxMagicka(c), c.magicka + (BIRTHSIGNS[c.sign].noMagickaRegen ? 0 : getAttr(c, "intelligence") * 0.15))
    c.fatigue = maxFatigue(c)
  }
  game.advanceTime(slept)
  return true
}

function spawnAmbush(game) {
  const area = game.area
  const pc = game.pc
  if (area.kind === "overworld") {
    area.spawnNear(pc.pos.x, pc.pos.z, game.char.level)
    const e = area.enemies[area.enemies.length - 1]
    if (e) {
      const a = Math.random() * Math.PI * 2
      e.pos.set(pc.pos.x + Math.cos(a) * 8, pc.pos.y, pc.pos.z + Math.sin(a) * 8)
      e.aware = true
    }
  } else {
    // wake a sleeping creature on this level
    const e = area.enemies.filter(x => !x.dead).sort((a, b) => a.pos.distanceTo(pc.pos) - b.pos.distanceTo(pc.pos))[0]
    if (e) e.aware = true
  }
}
