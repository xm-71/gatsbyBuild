// Game-side combat plumbing shared by melee, arrows, bolts and thrown weapons:
// damage, weapon wear, poison coatings, artifact effects, stagger and feedback.
import { getAttr, getSkill, maxHealth, maxMagicka, maxFatigue, unequip, removeItem } from "../logic/character.js"
import { wear, weaponWear, armorWear, isBroken, repairWithTool, poisonText, hasCondition } from "../logic/items.js"
import { weaponClass } from "../audio/sfx.js"

// Apply one hit on an enemy. opts:
//   weapon   the item that struck (or null for fists)
//   dmg      physical damage before armour
//   charge   0..1 swing or draw strength
//   ranged   true for projectiles
//   enchant  element/absorb enchant to add (weapon's, or the ammo's)
//   silver   hurts ghosts fully
//   sneak    sneak-attack crit already applied to dmg
//   heavy    counts as a heavy blow (may stagger)
// Returns the physical damage dealt.
export function strikeEnemy(game, enemy, opts) {
  const c = game.char
  const w = opts.weapon
  const dealt = enemy.takeDamage(opts.dmg, { physical: true, silver: opts.silver })
  const k = 0.6 + (opts.charge ?? 1) * 0.4
  const ench = opts.enchant
  if (ench?.element && !enemy.dead) enemy.takeDamage(ench.amount * k, { element: ench.element })
  if (ench?.absorb) {
    const a = ench.amount * k
    enemy.takeDamage(a, {})
    c.health = Math.min(maxHealth(c), c.health + a)
  }
  // artifact effects
  const u = w?.unique
  if (u && !enemy.dead) {
    if (u.type === "banish" && !enemy.boss && Math.random() < u.chance) {
      enemy.takeDamage(1e6, {})
      game.msg(`${w.name} banishes ${enemy.name}!`, "#ff8060")
    } else if (u.type === "paralyze" && Math.random() < u.chance && !(enemy.boss && Math.random() < 0.5)) {
      enemy.paralyzed = Math.max(enemy.paralyzed, 2)
      game.msg(`${enemy.name} is frozen stiff!`, "#a0e0ff")
    } else if (u.type === "absorbMagicka") c.magicka = Math.min(maxMagicka(c), c.magicka + u.amount)
    else if (u.type === "absorbFatigue") c.fatigue = Math.min(maxFatigue(c), c.fatigue + u.amount)
  }
  // poison coating on the weapon
  if (c.coating && !opts.noCoat && dealt > 0) applyCoating(game, enemy)
  // stagger on heavy blows; bosses shrug most of them off
  if (!enemy.dead && dealt > 0) {
    const heavy = opts.heavy || u?.type === "stagger"
    if (heavy && (!enemy.boss || Math.random() < 0.3 || u?.type === "stagger")) enemy.stagger(enemy.boss ? 0.3 : 0.55, game.pc.pos)
  }
  // feedback
  const at = enemy.center
  game.particles?.burst(at, enemy.material, dealt > 0 ? Math.min(28, 8 + dealt) : 5)
  game.audio.hit(enemy.material, opts.ranged ? "arrow" : weaponClass(w), at, 0.7 + (opts.charge ?? 1) * 0.5)
  // wear
  if (w && dealt > 0 && !opts.ranged && !w.bound) wearWeapon(game, w, dealt)
  return dealt
}

export function wearWeapon(game, w, dealt) {
  if (!hasCondition(w)) return
  if (wear(w, weaponWear(dealt))) {
    unequip(game.char, w)
    game.audio.play("break")
    game.msg(`Your ${w.name} has broken! Repair it before using it again.`, "#ff7a5a")
  }
}

// A blow landed on the player: the struck armour piece (if any) wears.
export function wearArmor(game, piece, taken) {
  if (!piece || !hasCondition(piece)) return
  if (wear(piece, armorWear(taken))) {
    unequip(game.char, piece)
    game.audio.play("break")
    game.msg(`Your ${piece.name} has broken!`, "#ff7a5a")
  }
}

// ---------- poisons ----------

export function coatWeapon(game, poison) {
  const c = game.char
  const w = c.equipment.weapon
  if (!w) return game.msg("Equip a weapon to coat it with poison.", "#ff9a7a")
  const { effect, element, amount, duration, hits, name } = poison
  c.coating = { effect, element, amount, duration, hits, name }
  removeItem(c, poison, 1)
  game.audio.play("poison")
  game.msg(`You coat your ${w.name} with ${name}. (${hits} strikes)`, "#9ae070")
}

function applyCoating(game, enemy) {
  const c = game.char
  const p = c.coating
  if (p.effect === "dot") {
    if ((enemy.def.resist?.[p.element] || 0) >= 1) game.msg(`${enemy.name} is immune to ${p.name}.`, "#a8a090")
    else enemy.dots.push({ element: p.element, dps: p.amount, t: p.duration })
  } else if (p.effect === "paralyze") {
    if (enemy.boss && Math.random() < 0.5) game.msg(`${enemy.name} resists the ${p.name}.`, "#a8a090")
    else enemy.paralyzed = Math.max(enemy.paralyzed, p.duration)
  } else if (p.effect === "weaken") {
    enemy.weakenT = p.duration
    enemy.weakenAmt = p.amount
  }
  p.hits--
  if (p.hits <= 0) {
    c.coating = null
    game.msg(`The ${p.name} has worn off your blade.`, "#a8a090")
  }
}

export function coatingText(c) {
  return c.coating ? `${c.coating.name}: ${poisonText(c.coating)} (${c.coating.hits} strikes left)` : ""
}

// ---------- repair ----------

export function useRepairTool(game, tool, item) {
  const c = game.char
  if (!hasCondition(item) || item.cond >= item.maxCond) return game.msg(`${item.name} doesn't need repair.`, "#a8a090")
  const wasBroken = isBroken(item)
  const r = repairWithTool(getSkill(c, "armorer"), getAttr(c, "strength"), getAttr(c, "luck"), tool, item)
  if (r.success) {
    game.audio.play("repair")
    game.exercise("armorer", 1)
    game.msg(`You repair ${item.name} (+${r.amount}). ${Math.ceil(item.cond)}/${item.maxCond}${wasBroken ? " — usable again" : ""}`, "#c9e0a0")
  } else {
    game.audio.play("block", { wood: true })
    game.msg("You fumble the repair.", "#ff9a7a")
  }
  if (r.toolBroke) {
    removeItem(c, tool, 1)
    game.msg(`Your ${tool.name} is worn out.`, "#a8a090")
  }
  return r
}
