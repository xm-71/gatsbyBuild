import { RACES, CLASSES, BIRTHSIGNS, SKILLS, SKILL_IDS, ATTRIBUTES, ATTR_LABEL } from "../data/stats.js"
import { FACTIONS, RANK_REP } from "../data/factions.js"
import { getSpell } from "../data/spells.js"
import { REGIONS, SEA_LEVEL } from "../logic/worldgen.js"
import { CELL } from "../logic/dungeongen.js"
import { createCharacter, getAttr, getSkill, maxHealth, maxMagicka, maxFatigue, armorRating, encumbrance, carryCapacity, equip, unequip, isEquipped, skillType, skillRequirement, canLevelUp, levelUp, attrMultiplier, fatigueRatio, addItem } from "../logic/character.js"
import { describeItem } from "../logic/items.js"
import { spellChance, buyPrice, sellPrice } from "../logic/combat.js"
import { randomSeed } from "../core/rng.js"
import { hideLoading } from "./loading.js"
import { settings, updateSettings, bindKey, resetKeys, ACTIONS, keyLabel } from "../core/settings.js"
import { readSave, describeSave } from "../game/save.js"
import { PRESETS, qualityName, setQuality } from "../core/quality.js"
import * as D from "../game/dialogue.js"
import { usePotion, eatItem, doRest } from "../game/player.js"

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
const pct = (a, b) => `${Math.max(0, Math.min(100, (a / Math.max(1, b)) * 100))}%`

function el(tag, cls, html) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html !== undefined) e.innerHTML = html
  return e
}

function bind(root, handlers) {
  root.querySelectorAll("[data-act]").forEach(node => {
    node.addEventListener("click", ev => {
      ev.stopPropagation()
      handlers[node.dataset.act]?.(node.dataset.arg, node)
    })
  })
}

export class UI {
  constructor(game) {
    this.game = game
    this.root = el("div", "ui-root")
    document.body.appendChild(this.root)
    this.hud = el("div", "hud hidden")
    this.root.appendChild(this.hud)
    this.screen = el("div", "screen hidden")
    this.root.appendChild(this.screen)
    this.win = el("div", "modal-layer hidden")
    this.root.appendChild(this.win)
    this.pause = el("div", "pause-hint hidden", `<div class="panel small"><b>Paused</b><br>Click to continue<br><span class="dim">Tab — menu · T — rest · Esc — release mouse</span></div>`)
    this.root.appendChild(this.pause)
    this.modal = null
    this.target = null
    this.dialogueNpc = null
    this.menuTab = "inventory"
    this.messages = []
    this.buildHud()
    window.addEventListener("keydown", e => this.onKey(e))
    // Recording a new key binding: grab the key before the game sees it.
    window.addEventListener(
      "keydown",
      e => {
        if (!this.captureKey) return
        e.preventDefault()
        e.stopImmediatePropagation()
        const action = this.captureKey
        this.captureKey = null
        if (e.code !== "Escape") {
          const swapped = bindKey(action, e.code)
          this.settingsNote = swapped ? `${keyLabel(e.code)} was used by “${ACTIONS.find(a => a[0] === swapped)[1]}”; the two keys were swapped.` : ""
        }
        this.settingsRender?.()
      },
      true
    )
  }

  onKey(e) {
    if (!this.modal) return
    if (e.target instanceof HTMLInputElement) return
    if (this.captureKey) return // a key binding is being recorded
    const k = settings.keys
    const menuKeys = [k.inventory, "KeyI", k.journal, k.map, k.character]
    if (e.code === "Escape" || (menuKeys.includes(e.code) && this.modal === "menu")) {
      e.preventDefault()
      if (this.modal === "levelup") return
      this.closeModal()
    } else if (e.code === k.activate && this.modal === "container") {
      this.takeAll?.()
    }
  }

  // ---------------- screens ----------------

  hideScreens() {
    this.screen.classList.add("hidden")
    this.screen.innerHTML = ""
  }

  showTitle() {
    this.game.mode = "title"
    const runs = this.game.pastRuns()
    const save = readSave()
    const sv = save && describeSave(save)
    this.screen.classList.remove("hidden")
    this.screen.innerHTML = `
      <div class="title-wrap">
        <div class="logo"><div class="logo-sub">A procedural roguelike of Vvardenfell</div><h1>ASHFALL</h1><div class="logo-sub">Every run a new island · one life · no saves</div></div>
        <div class="panel title-panel">
          <label>World seed</label>
          <div class="row"><input id="seed" value="${esc(this.game.seed)}" spellcheck="false"><button data-act="reroll" title="Random seed">⟳</button></div>
          ${sv ? `<button class="big continue" data-act="continue">Continue</button><div class="dim small-note center">${esc(sv.name)} · level ${sv.level} ${esc(RACES[sv.race]?.name || sv.race)} ${esc(CLASSES[sv.cls]?.name || sv.cls)} · day ${sv.day} · seed ${esc(sv.seed)}</div>` : ""}
          <button class="big" data-act="new">New Run</button>
          <button data-act="settings">Settings</button>
          ${sv ? `<div class="dim small-note center">Starting a new run ends your saved run.</div>` : ""}
          <details><summary>How to play</summary>
            <p>Create a character, then survive a freshly generated Vvardenfell. Talk to the Blades contact in your starting town to learn the main quest: recover Kagrenac's three tools from the strongholds that hold them, then descend into the Citadel under Red Mountain and slay the Dagoth lord. Death is permanent.</p>
            <p>Skills improve as you use them. Every ten increases in major or minor skills lets you level up when you rest. Join guilds and Great Houses, take their duties, and rise through the ranks.</p>
            <table class="keys">
              <tr><td>WASD / mouse</td><td>move / look</td></tr>
              <tr><td>Left mouse (hold)</td><td>attack — hold longer for a stronger swing or bow draw</td></tr>
              <tr><td>F or right mouse</td><td>cast selected spell (wheel / 1-9 to select)</td></tr>
              <tr><td>E</td><td>talk, open, loot, use doors</td></tr>
              <tr><td>Shift / Space / C</td><td>sprint / jump / toggle sneak</td></tr>
              <tr><td>Q</td><td>quaff a healing potion</td></tr>
              <tr><td>T</td><td>rest (and level up)</td></tr>
              <tr><td>Tab · K · M · J</td><td>inventory · character · map · journal</td></tr>
            </table>
          </details>
          ${runs.length ? `<details open><summary>Past runs</summary><table class="runs">${runs.slice(0, 8).map(r => `<tr class="${r.victory ? "win" : ""}"><td>${esc(r.name)}</td><td>${esc(r.race)} ${esc(CLASSES[r.cls]?.name || r.cls)} L${r.level}</td><td>${r.days}d</td><td>${r.score}</td><td class="dim">${esc(r.cause)}</td></tr>`).join("")}</table></details>` : ""}
        </div>
      </div>`
    bind(this.screen, {
      quality: q => {
        if (q === qualityName) return
        setQuality(q)
        try {
          sessionStorage.setItem("ashfall-seed", this.screen.querySelector("#seed").value)
        } catch {
          /* ignore */
        }
        location.reload()
      },
      reroll: async () => {
        const s = randomSeed()
        this.screen.querySelector("#seed").value = s
        await this.game.prepareWorld(s)
        hideLoading()
      },
      settings: () => this.openSettings(),
      continue: async () => {
        this.screen.classList.add("hidden")
        this.game.input.lock()
        await this.game.resumeRun(save)
      },
      new: async () => {
        const s = this.screen.querySelector("#seed").value.trim() || randomSeed()
        await this.game.prepareWorld(s)
        hideLoading()
        this.showChargen(s)
      },
    })
  }

  showChargen(seed) {
    this.game.mode = "chargen"
    const state = { name: "", race: "dunmer", cls: "warrior", sign: "warrior" }
    const render = () => {
      const c = createCharacter({ name: state.name || "Outlander", ...state })
      const C = CLASSES[state.cls]
      const list = (obj, key) =>
        Object.entries(obj)
          .map(([id, v]) => `<button class="opt ${state[key] === id ? "sel" : ""}" data-act="${key}" data-arg="${id}">${esc(v.name)}</button>`)
          .join("")
      this.screen.innerHTML = `
        <div class="chargen panel">
          <h2>Who are you, outlander?</h2>
          <div class="row"><label>Name</label><input id="cname" maxlength="24" value="${esc(state.name)}" placeholder="Nerevar"></div>
          <div class="cg-cols">
            <div><h3>Race</h3><div class="opts">${list(RACES, "race")}</div><p class="desc">${esc(RACES[state.race].desc)}</p></div>
            <div><h3>Class</h3><div class="opts">${list(CLASSES, "cls")}</div><p class="desc">Specialization: ${C.spec}. Favored: ${C.attrs.map(a => ATTR_LABEL[a]).join(", ")}.<br>Major: ${C.major.map(s => SKILLS[s].name).join(", ")}.<br>Minor: ${C.minor.map(s => SKILLS[s].name).join(", ")}.</p></div>
            <div><h3>Birthsign</h3><div class="opts">${list(BIRTHSIGNS, "sign")}</div><p class="desc">${esc(BIRTHSIGNS[state.sign].desc)}</p></div>
            <div class="cg-preview"><h3>Attributes</h3>
              ${ATTRIBUTES.map(a => `<div class="kv"><span>${ATTR_LABEL[a]}</span><b>${c.attrs[a]}</b></div>`).join("")}
              <div class="kv hp"><span>Health</span><b>${maxHealth(c)}</b></div>
              <div class="kv mp"><span>Magicka</span><b>${maxMagicka(c)}</b></div>
              <div class="kv fp"><span>Fatigue</span><b>${maxFatigue(c)}</b></div>
              <h3>Starting spells</h3><p class="desc">${[...c.spells, ...c.powers].map(s => getSpell(s).name).join(", ") || "none"}</p>
            </div>
          </div>
          <div class="row end"><span class="dim">Seed: ${esc(seed)}</span><button data-act="back">Back</button><button class="big" data-act="go">Begin</button></div>
        </div>`
      const nameInput = this.screen.querySelector("#cname")
      nameInput.addEventListener("input", () => (state.name = nameInput.value))
      bind(this.screen, {
        race: v => ((state.race = v), render()),
        cls: v => ((state.cls = v), render()),
        sign: v => ((state.sign = v), render()),
        back: () => this.showTitle(),
        go: async () => {
          this.game.input.lock()
          await this.game.startRun({ name: state.name.trim() || "Outlander", race: state.race, cls: state.cls, sign: state.sign, seed })
        },
      })
    }
    render()
  }

  showDeath() {
    this.hud.classList.add("hidden")
    this.closeModal(true)
    const g = this.game
    const c = g.char
    this.screen.classList.remove("hidden")
    this.screen.innerHTML = `<div class="end panel"><h1 class="red">You have died.</h1>
      <p>${esc(c.name)} the ${RACES[c.race].name} ${CLASSES[c.cls].name} ${esc(g.deathCause)} on day ${Math.floor(g.time / 24) + 1}.</p>
      ${this.statsTable()}
      <div class="row end"><button class="big" data-act="again">New Run</button></div></div>`
    bind(this.screen, { again: () => location.reload() })
  }

  showVictory() {
    this.hud.classList.add("hidden")
    this.closeModal(true)
    const g = this.game
    const c = g.char
    this.screen.classList.remove("hidden")
    this.screen.innerHTML = `<div class="end panel"><h1 class="gold">The Heart is Severed</h1>
      <p>With Sunder and Keening, ${esc(c.name)} cut ${esc(g.world.mainQuest.dagoth)} from the Heart of Lorkhan. The ash storms quiet over Vvardenfell. Nerevar is returned.</p>
      ${this.statsTable()}
      <div class="row end"><button class="big" data-act="again">New Run</button></div></div>`
    bind(this.screen, { again: () => location.reload() })
  }

  statsTable() {
    const g = this.game
    const s = g.char.stats
    return `<table class="stats">
      <tr><td>Level</td><td>${g.char.level}</td><td>Kills</td><td>${s.kills}</td></tr>
      <tr><td>Dungeons cleared</td><td>${s.dungeonsCleared}</td><td>Quests completed</td><td>${s.questsDone}</td></tr>
      <tr><td>Relics</td><td>${g.relicsHeld().length}/3</td><td>Skill increases</td><td>${s.skillUps}</td></tr>
      <tr><td>Gold</td><td>${g.char.gold}</td><td>Days survived</td><td>${Math.floor(g.time / 24) + 1}</td></tr>
      <tr><td colspan="3"><b>Score</b></td><td><b>${g.score()}</b></td></tr></table>`
  }

  showPauseHint(on) {
    this.pause.classList.toggle("hidden", !on || !!this.modal || this.game.mode !== "play")
  }

  // ---------------- HUD ----------------

  buildHud() {
    this.hud.innerHTML = `
      <div class="vignette"></div>
      <div class="crosshair">+</div>
      <div class="prompt"></div>
      <div class="target hidden"><div class="tname"></div><div class="bar"><div class="fill hp"></div></div></div>
      <div class="msgs"></div>
      <div class="bars">
        <div class="bar vbar"><div class="fill hp"></div></div>
        <div class="bar vbar"><div class="fill mp"></div></div>
        <div class="bar vbar"><div class="fill fp"></div></div>
      </div>
      <div class="equip"><div class="slot weapon"></div><div class="slot spell"></div><div class="slot effects"></div></div>
      <div class="mapbox"><div class="status"></div><canvas width="170" height="170"></canvas><div class="compass">N</div></div>
      <div class="sneak hidden">◉ Sneaking</div>`
    this.h = {
      prompt: this.hud.querySelector(".prompt"),
      target: this.hud.querySelector(".target"),
      tname: this.hud.querySelector(".tname"),
      tfill: this.hud.querySelector(".target .fill"),
      msgs: this.hud.querySelector(".msgs"),
      fills: this.hud.querySelectorAll(".bars .fill"),
      bars: this.hud.querySelector(".bars"),
      weapon: this.hud.querySelector(".slot.weapon"),
      spell: this.hud.querySelector(".slot.spell"),
      effects: this.hud.querySelector(".slot.effects"),
      status: this.hud.querySelector(".status"),
      map: this.hud.querySelector(".mapbox canvas"),
      vignette: this.hud.querySelector(".vignette"),
      sneak: this.hud.querySelector(".sneak"),
    }
  }

  showHud() {
    this.hud.classList.remove("hidden")
    this.worldMap = null
  }

  message(text, color = "#c9b88f") {
    const m = el("div", "msg", esc(text))
    m.style.color = color
    this.h.msgs.appendChild(m)
    while (this.h.msgs.children.length > 7) this.h.msgs.firstChild.remove()
    setTimeout(() => m.classList.add("fade"), 6000)
    setTimeout(() => m.remove(), 7000)
  }

  updateHud() {
    const g = this.game
    const c = g.char
    if (!c) return
    const [hp, mp, fp] = this.h.fills
    hp.style.height = pct(c.health, maxHealth(c))
    mp.style.height = pct(c.magicka, maxMagicka(c))
    fp.style.height = pct(c.fatigue, maxFatigue(c))
    this.h.bars.title = `Health ${Math.ceil(c.health)}/${maxHealth(c)} · Magicka ${Math.floor(c.magicka)}/${maxMagicka(c)} · Fatigue ${Math.floor(c.fatigue)}/${maxFatigue(c)}`
    const w = c.equipment.weapon
    this.h.weapon.innerHTML = `<span class="ic">⚔</span>${esc(w ? w.name : "Hand-to-hand")}${w?.ranged ? ` <span class="dim">(${c.inventory.filter(i => i.kind === "ammo").reduce((s, i) => s + i.qty, 0)})</span>` : ""}`
    const sp = c.selectedSpell ? getSpell(c.selectedSpell) : null
    this.h.spell.innerHTML = sp ? `<span class="ic">✦</span>${esc(sp.name)} <span class="dim">${sp.power ? (c.powersUsed[sp.id] ? "used" : "power") : sp.cost}</span>` : `<span class="ic">✦</span><span class="dim">no spell</span>`
    this.h.effects.innerHTML = c.effects.filter(e => e.type !== "bound" || true).map(e => `<span class="eff">${esc(e.label || e.type)} ${Math.ceil(e.remaining)}s</span>`).join("") + (c.poison > 0 ? `<span class="eff bad">Poisoned</span>` : "")
    const t = this.target
    this.h.prompt.textContent = t && !this.modal ? `E — ${t.type === "npc" ? "Talk to" : t.type === "door" ? "Enter" : t.type === "corpse" ? "Search" : t.type === "chest" ? "Open" : t.type === "sack" ? "Search" : "Use"} ${t.name}` : ""
    const tg = g.lastTarget
    if (tg && g.lastTargetT > 0 && !tg.dead) {
      this.h.target.classList.remove("hidden")
      this.h.tname.textContent = tg.name
      this.h.tfill.style.width = pct(tg.hp, tg.maxHp)
    } else this.h.target.classList.add("hidden")
    this.h.vignette.style.opacity = g.pc.hurtFlash
    this.h.sneak.classList.toggle("hidden", !g.pc.sneaking)
    const hour = g.hourOfDay()
    const hh = String(Math.floor(hour)).padStart(2, "0")
    const mm = String(Math.floor((hour % 1) * 60)).padStart(2, "0")
    const place = g.area.kind === "overworld" ? REGIONS[g.world.regionAt(g.pc.pos.x, g.pc.pos.z)].name + (g.area.townAt(g.pc.pos.x, g.pc.pos.z, 10) ? ` · ${g.area.townAt(g.pc.pos.x, g.pc.pos.z, 10).name}` : "") : `${g.area.dungeon.name} ${g.area.levelIndex + 1}/${g.area.dungeon.levels}`
    this.h.status.textContent = `Day ${Math.floor(g.time / 24) + 1} ${hh}:${mm} · ${place}${g.area.kind === "overworld" && g.weather !== "clear" ? " · " + g.weather : ""}`
    this.drawMinimap()
  }

  // ---------------- maps ----------------

  buildWorldMap() {
    const g = this.game
    const world = g.world
    const S = 512
    const cv = document.createElement("canvas")
    cv.width = cv.height = S
    const ctx = cv.getContext("2d")
    const img = ctx.createImageData(S, S)
    const half = world.size / 2
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const wx = -half + (x / S) * world.size
        const wz = -half + (y / S) * world.size
        const h = world.heightAt(wx, wz)
        let r, gg, b
        if (h < SEA_LEVEL) {
          const d = Math.min(1, -h / 14)
          r = 40 - d * 20; gg = 70 - d * 25; b = 80 - d * 20
        } else if (world.lavaAt(wx, wz)) {
          r = 200; gg = 70; b = 20
        } else {
          const R = REGIONS[world.regionAt(wx, wz)]
          const shade = Math.max(0.55, Math.min(1.3, 1 + (world.heightAt(wx - 3, wz - 3) - h) * 0.12))
          const k = Math.min(1, h / 60)
          r = (R.low[0] * (1 - k) + R.high[0] * k) * shade
          gg = (R.low[1] * (1 - k) + R.high[1] * k) * shade
          b = (R.low[2] * (1 - k) + R.high[2] * k) * shade
          if (h < 1.6) { r = 168; gg = 152; b = 112 }
        }
        const i = (y * S + x) * 4
        img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255
      }
    ctx.putImageData(img, 0, 0)
    this.worldMap = cv
    this.worldMapSeed = world.seed
  }

  toMap(x, z, S) {
    const world = this.game.world
    return [((x + world.size / 2) / world.size) * S, ((z + world.size / 2) / world.size) * S]
  }

  drawMarkers(ctx, S, scale, ox = 0, oy = 0, big = false) {
    const g = this.game
    const world = g.world
    const questDungeons = new Set(g.quests.filter(q => q.status === "active" && q.dungeonId !== undefined).map(q => q.dungeonId))
    if (g.main.stage >= 1) for (const r of world.mainQuest.relics) if (!g.relicsHeld().includes(r.name)) questDungeons.add(r.dungeonId)
    if (g.main.stage >= 2) questDungeons.add(world.mainQuest.citadelId)
    ctx.font = `${big ? 12 : 9}px Georgia`
    for (const d of world.dungeons) {
      if (!d.discovered) continue
      const [x, y] = this.toMap(d.x, d.z, S)
      const px = x * scale + ox
      const py = y * scale + oy
      ctx.fillStyle = d.cleared ? "#777" : d.citadel ? "#ff3a1a" : questDungeons.has(d.id) ? "#ffd040" : "#e8c890"
      ctx.beginPath()
      ctx.arc(px, py, big ? 4 : 2.5, 0, Math.PI * 2)
      ctx.fill()
      if (questDungeons.has(d.id)) {
        ctx.strokeStyle = "#ffd040"
        ctx.beginPath()
        ctx.arc(px, py, big ? 8 : 5, 0, Math.PI * 2)
        ctx.stroke()
      }
      if (big) {
        ctx.fillStyle = "#e8dcc0"
        ctx.fillText(d.name, px + 6, py + 4)
      }
    }
    for (const t of world.towns) {
      if (!g.knownTowns.has(t.id)) continue
      const [x, y] = this.toMap(t.x, t.z, S)
      const px = x * scale + ox
      const py = y * scale + oy
      ctx.fillStyle = "#fff4c8"
      ctx.fillRect(px - (big ? 4 : 3), py - (big ? 4 : 3), big ? 8 : 6, big ? 8 : 6)
      ctx.strokeStyle = "#3a2a10"
      ctx.strokeRect(px - (big ? 4 : 3), py - (big ? 4 : 3), big ? 8 : 6, big ? 8 : 6)
      if (big) {
        ctx.fillStyle = "#fff4c8"
        ctx.font = "bold 13px Georgia"
        ctx.fillText(t.name, px + 7, py - 5)
        ctx.font = "12px Georgia"
      }
    }
  }

  drawArrow(ctx, x, y, yaw, size = 7) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(-yaw)
    ctx.fillStyle = "#ff4030"
    ctx.strokeStyle = "#000"
    ctx.beginPath()
    ctx.moveTo(0, -size)
    ctx.lineTo(size * 0.6, size * 0.7)
    ctx.lineTo(0, size * 0.3)
    ctx.lineTo(-size * 0.6, size * 0.7)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  drawMinimap() {
    const g = this.game
    const cv = this.h.map
    const ctx = cv.getContext("2d")
    const W = cv.width
    ctx.fillStyle = "#0a0806"
    ctx.fillRect(0, 0, W, W)
    const detect = g.char.effects.some(e => e.type === "detect")
    if (g.area.kind === "overworld") {
      if (!this.worldMap || this.worldMapSeed !== g.world.seed) this.buildWorldMap()
      const S = 512
      const view = 90 // pixels of world map shown (~245m)
      const [px, py] = this.toMap(g.pc.pos.x, g.pc.pos.z, S)
      const scale = W / view
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(this.worldMap, px - view / 2, py - view / 2, view, view, 0, 0, W, W)
      this.drawMarkers(ctx, S, scale, W / 2 - px * scale, W / 2 - py * scale)
      if (detect) {
        ctx.fillStyle = "#ff6060"
        for (const e of g.area.enemies) {
          if (e.dead) continue
          const [ex, ey] = this.toMap(e.pos.x, e.pos.z, S)
          ctx.fillRect((ex - px) * scale + W / 2 - 2, (ey - py) * scale + W / 2 - 2, 4, 4)
        }
      }
    } else {
      const a = g.area
      const lvl = a.lvl
      const cs = 5
      const c = a.cellOf(g.pc.pos)
      for (let y = 0; y < lvl.h; y++)
        for (let x = 0; x < lvl.w; x++) {
          if (!a.explored[y * lvl.w + x] || !a.isFloorCell(x, y)) continue
          ctx.fillStyle = "#6a5a44"
          ctx.fillRect((x - c.x) * cs + W / 2, (y - c.y) * cs + W / 2, cs, cs)
        }
      const mark = (cell, color) => {
        if (!cell || !a.explored[cell.y * lvl.w + cell.x]) return
        ctx.fillStyle = color
        ctx.fillRect((cell.x - c.x) * cs + W / 2, (cell.y - c.y) * cs + W / 2, cs, cs)
      }
      mark(lvl.entry, "#e0e0a0")
      mark(lvl.stairsDown, "#40a0ff")
      for (const ch of a.chests) if (!ch.state.opened) mark(ch.def, "#d0a040")
      if (detect) {
        ctx.fillStyle = "#ff6060"
        for (const e of a.enemies) if (!e.dead) ctx.fillRect(((e.pos.x / CELL) - c.x) * cs + W / 2 - 2, ((e.pos.z / CELL) - c.y) * cs + W / 2 - 2, 4, 4)
      }
    }
    this.drawArrow(ctx, W / 2, W / 2, g.pc.yaw)
  }

  // ---------------- modal plumbing ----------------

  openModal(kind) {
    this.modal = kind
    this.game.input.unlock()
    this.win.classList.remove("hidden")
    this.pause.classList.add("hidden")
  }

  closeModal(silent = false) {
    this.modal = null
    this.dialogueNpc = null
    this.takeAll = null
    this.win.classList.add("hidden")
    this.win.innerHTML = ""
    this.game.input.pressed.clear()
    this.game.autosave?.()
    if (!silent && this.game.mode === "play") this.game.input.lock()
  }

  // ---------------- main menu ----------------

  openMenu(tab) {
    this.menuTab = tab || this.menuTab
    this.selectedItem = null
    this.openModal("menu")
    this.renderMenu()
  }

  renderMenu() {
    const tabs = ["inventory", "character", "magic", "map", "journal", "settings"]
    this.win.innerHTML = `<div class="panel menu">
      <div class="tabs">${tabs.map(t => `<button class="tab ${t === this.menuTab ? "sel" : ""}" data-act="tab" data-arg="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}<button class="close" data-act="close">✕</button></div>
      <div class="menu-body"></div></div>`
    const body = this.win.querySelector(".menu-body")
    this[`render_${this.menuTab}`](body)
    bind(this.win.querySelector(".tabs"), {
      tab: t => {
        this.menuTab = t
        this.renderMenu()
      },
      close: () => this.closeModal(),
    })
  }

  render_inventory(body) {
    const g = this.game
    const c = g.char
    const filter = this.invFilter || "all"
    const kinds = { all: () => true, weapons: i => i.kind === "weapon" || i.kind === "ammo", apparel: i => i.kind === "armor", magic: i => i.kind === "potion", misc: i => ["misc", "lockpick", "quest"].includes(i.kind) }
    const items = c.inventory.filter(kinds[filter])
    const sel = this.selectedItem && c.inventory.includes(this.selectedItem) ? this.selectedItem : null
    const eq = Object.entries(c.equipment)
    body.innerHTML = `<div class="inv">
      <div class="inv-list">
        <div class="filters">${Object.keys(kinds).map(k => `<button class="${k === filter ? "sel" : ""}" data-act="filter" data-arg="${k}">${k}</button>`).join("")}</div>
        <div class="list">${items.map((i, idx) => `<div class="item ${isEquipped(c, i) ? "eq" : ""} ${i === sel ? "sel" : ""}" data-act="select" data-arg="${c.inventory.indexOf(i)}"><span>${esc(i.name)}${i.qty > 1 ? ` (${i.qty})` : ""}</span><span class="dim">${i.relic ? "relic" : i.value}</span></div>`).join("") || `<div class="dim">Nothing here.</div>`}</div>
      </div>
      <div class="inv-side">
        <div class="kv"><span>Gold</span><b>${c.gold}</b></div>
        <div class="kv"><span>Armor Rating</span><b>${armorRating(c)}</b></div>
        <div class="kv"><span>Encumbrance</span><b class="${encumbrance(c) > carryCapacity(c) ? "red" : ""}">${Math.round(encumbrance(c))}/${carryCapacity(c)}</b></div>
        <h3>Equipped</h3>${eq.map(([s, i]) => `<div class="kv small"><span>${s}</span><span>${esc(i.name)}</span></div>`).join("") || `<div class="dim">nothing</div>`}
        ${sel ? `<div class="detail"><h3>${esc(sel.name)}</h3>${describeItem(sel).map(l => `<div>${esc(l)}</div>`).join("")}
          <div class="row">${this.itemActions(sel)}</div></div>` : `<p class="dim">Select an item.</p>`}
      </div></div>`
    bind(body, {
      filter: k => ((this.invFilter = k), this.render_inventory(body)),
      select: i => ((this.selectedItem = c.inventory[Number(i)]), this.render_inventory(body)),
      equip: () => (equip(c, sel), this.render_inventory(body)),
      unequip: () => (unequip(c, sel), this.render_inventory(body)),
      drink: () => (usePotion(g, sel), this.render_inventory(body)),
      eat: () => (eatItem(g, sel), this.render_inventory(body)),
      drop: () => (g.dropItem(sel, 1), (this.selectedItem = null), this.render_inventory(body)),
    })
  }

  itemActions(i) {
    const c = this.game.char
    const a = []
    if (i.kind === "weapon" || i.kind === "armor" || i.kind === "ammo") a.push(isEquipped(c, i) ? `<button data-act="unequip">Unequip</button>` : `<button data-act="equip">Equip</button>`)
    if (i.kind === "potion") a.push(`<button data-act="drink">Drink</button>`)
    if (i.eat) a.push(`<button data-act="eat">Eat</button>`)
    if (i.kind !== "quest" && !i.relic && !i.bound) a.push(`<button data-act="drop">Drop</button>`)
    return a.join("")
  }

  render_character(body) {
    const g = this.game
    const c = g.char
    const group = type => SKILL_IDS.filter(s => skillType(c, s) === type).map(s => `<div class="skill"><span>${SKILLS[s].name}</span><b>${c.skills[s]}</b><div class="prog"><div style="width:${pct(c.skillProgress[s], skillRequirement(c, s))}"></div></div></div>`).join("")
    body.innerHTML = `<div class="charsheet">
      <div>
        <h2>${esc(c.name)}</h2>
        <div class="dim">${RACES[c.race].name} ${CLASSES[c.cls].name} · ${BIRTHSIGNS[c.sign].name}</div>
        <div class="kv"><span>Level ${c.level}</span><b>${c.levelProgress}/10</b></div>
        <div class="kv hp"><span>Health</span><b>${Math.ceil(c.health)}/${maxHealth(c)}</b></div>
        <div class="kv mp"><span>Magicka</span><b>${Math.floor(c.magicka)}/${maxMagicka(c)}</b></div>
        <div class="kv fp"><span>Fatigue</span><b>${Math.floor(c.fatigue)}/${maxFatigue(c)}</b></div>
        <h3>Attributes</h3>${ATTRIBUTES.map(a => `<div class="kv"><span>${ATTR_LABEL[a]}</span><b>${getAttr(c, a)}${getAttr(c, a) !== c.attrs[a] ? `<span class="dim"> (${c.attrs[a]})</span>` : ""}</b></div>`).join("")}
        <h3>Factions</h3>${Object.entries(c.factions).map(([id, m]) => `<div class="kv small"><span>${FACTIONS[id].name}</span><span>${FACTIONS[id].ranks[m.rank]} · rep ${m.rep}/${RANK_REP[m.rank + 1] ?? "max"}</span></div>`).join("") || `<div class="dim">none</div>`}
        <h3>Record</h3><div class="kv small"><span>Kills</span><span>${c.stats.kills}</span></div><div class="kv small"><span>Dungeons cleared</span><span>${c.stats.dungeonsCleared}</span></div><div class="kv small"><span>Quests</span><span>${c.stats.questsDone}</span></div><div class="kv small"><span>Score</span><span>${g.score()}</span></div>
      </div>
      <div><h3>Major Skills</h3>${group("major")}<h3>Minor Skills</h3>${group("minor")}</div>
      <div><h3>Misc Skills</h3>${group("misc")}</div></div>`
  }

  render_magic(body) {
    const g = this.game
    const c = g.char
    const row = id => {
      const s = getSpell(id)
      const chance = s.power ? 100 : Math.round(spellChance({ skill: getSkill(c, s.school), willpower: getAttr(c, "willpower"), luck: getAttr(c, "luck"), fatigue: fatigueRatio(c) }, s.cost) * 100)
      return `<div class="item ${c.selectedSpell === id ? "sel" : ""}" data-act="pick" data-arg="${id}"><span>${esc(s.name)}</span><span class="dim">${s.power ? (c.powersUsed[id] ? "used today" : "power") : `${SKILLS[s.school].name} · ${s.cost} MP · ${chance}%`}</span></div>`
    }
    body.innerHTML = `<div class="magic"><h3>Powers</h3><div class="list">${c.powers.map(row).join("") || `<div class="dim">none</div>`}</div>
      <h3>Spells</h3><div class="list">${c.spells.map(row).join("") || `<div class="dim">none — buy spells from the Mages Guild, the Temple or Telvanni.</div>`}</div>
      <p class="dim">Click to select. Cast with F or right mouse. Numbers 1–9 and the mouse wheel also select.</p></div>`
    bind(body, { pick: id => ((c.selectedSpell = id), this.render_magic(body)) })
  }

  render_map(body) {
    const g = this.game
    if (g.area.kind === "dungeon") {
      body.innerHTML = `<div class="mapview"><canvas width="560" height="560"></canvas><p class="dim">${esc(g.area.dungeon.name)} — level ${g.area.levelIndex + 1}</p></div>`
      const cv = body.querySelector("canvas")
      const ctx = cv.getContext("2d")
      const a = g.area
      const cs = 560 / Math.max(a.lvl.w, a.lvl.h)
      ctx.fillStyle = "#0a0806"
      ctx.fillRect(0, 0, 560, 560)
      for (let y = 0; y < a.lvl.h; y++)
        for (let x = 0; x < a.lvl.w; x++)
          if (a.explored[y * a.lvl.w + x] && a.isFloorCell(x, y)) {
            ctx.fillStyle = "#6a5a44"
            ctx.fillRect(x * cs, y * cs, cs, cs)
          }
      this.drawArrow(ctx, (g.pc.pos.x / CELL) * cs, (g.pc.pos.z / CELL) * cs, g.pc.yaw, 9)
      return
    }
    if (!this.worldMap) this.buildWorldMap()
    body.innerHTML = `<div class="mapview"><canvas width="640" height="640"></canvas><p class="dim">■ towns · ● places · ◎ quest targets · red: the Citadel</p></div>`
    const cv = body.querySelector("canvas")
    const ctx = cv.getContext("2d")
    ctx.drawImage(this.worldMap, 0, 0, 640, 640)
    this.drawMarkers(ctx, 512, 640 / 512, 0, 0, true)
    const [px, py] = this.toMap(g.pc.pos.x, g.pc.pos.z, 640)
    this.drawArrow(ctx, px, py, g.pc.yaw, 10)
  }

  render_journal(body) {
    const g = this.game
    const q = g.quests
    const qrow = x => `<div class="quest ${x.status}"><b>${esc(x.title)}</b> <span class="dim">${x.status === "ready" ? "— return for reward" : x.status === "done" ? "— done" : ""}</span><div>${esc(x.desc)}</div>${x.type === "cull" && x.status === "active" ? `<div class="dim">${x.killed}/${x.count}</div>` : ""}</div>`
    body.innerHTML = `<div class="journal"><div><h3>Active</h3>${q.filter(x => x.status !== "done").map(qrow).join("") || `<div class="dim">No active tasks. Talk to guildmasters about duties.</div>`}
      <h3>Completed</h3>${q.filter(x => x.status === "done").map(qrow).join("") || `<div class="dim">—</div>`}</div>
      <div><h3>Journal</h3>${[...g.journal].reverse().map(j => `<p><span class="dim">Day ${j.day}:</span> ${esc(j.text)}</p>`).join("")}</div></div>`
  }

  openSettings() {
    this.openModal("settings")
    this.win.innerHTML = `<div class="panel menu settings-win"><div class="tabs"><h2>Settings</h2><button class="close" data-act="close">✕</button></div><div class="menu-body"></div></div>`
    bind(this.win.querySelector(".tabs"), { close: () => this.closeModal() })
    this.render_settings(this.win.querySelector(".menu-body"))
  }

  render_settings(body) {
    this.settingsRender = () => this.render_settings(body)
    const s = settings
    const inRun = this.game.mode === "play"
    const range = (id, label, min, max, step, value, fmt) =>
      `<label class="set-row" for="${id}"><span>${label}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"><output>${fmt(value)}</output></label>`
    body.innerHTML = `<div class="settings">
      <section><h3>Controls</h3>
        ${range("set-sens", "Mouse sensitivity", 0.2, 3, 0.05, s.sensitivity, v => `${Number(v).toFixed(2)}×`)}
        <label class="set-row" for="set-invert"><span>Invert mouse Y</span><input type="checkbox" id="set-invert" ${s.invertY ? "checked" : ""}></label>
        ${range("set-fov", "Field of view", 55, 100, 1, s.fov, v => `${v}°`)}
      </section>
      <section><h3>Audio</h3>
        ${range("set-music", "Music volume", 0, 1, 0.05, s.musicVolume, v => `${Math.round(v * 100)}%`)}
        ${range("set-sfx", "Effects volume", 0, 1, 0.05, s.sfxVolume, v => `${Math.round(v * 100)}%`)}
      </section>
      <section><h3>Interface</h3>
        <label class="set-row" for="set-compass"><span>Show compass with quest markers</span><input type="checkbox" id="set-compass" ${s.compass ? "checked" : ""}></label>
      </section>
      <section><h3>Graphics</h3>
        <div class="row wrap">${Object.entries(PRESETS).map(([k, p]) => `<button class="${k === qualityName ? "sel" : ""}" data-act="quality" data-arg="${k}">${p.name}</button>`).join("")}</div>
        <p class="dim small">Changing quality reloads the game${inRun ? ". Your run is saved and you can continue it from the title screen" : ""}.</p>
      </section>
      <section class="keys-sec"><h3>Keys</h3>
        <div class="keylist">${ACTIONS.map(([id, label]) => `<div class="set-row"><span>${label}</span><button class="keybtn ${this.captureKey === id ? "sel" : ""}" data-act="bind" data-arg="${id}">${this.captureKey === id ? "Press a key…" : esc(keyLabel(s.keys[id]))}</button></div>`).join("")}</div>
        <p class="dim small">${esc(this.settingsNote || "Click a key, then press the new key. Escape cancels. Arrow keys also move; 1–9 are quick-slots.")}</p>
        <button data-act="resetkeys">Reset keys</button>
      </section>
    </div>`
    const hook = (id, key, parse = Number) =>
      body.querySelector("#" + id).addEventListener("input", e => {
        updateSettings({ [key]: parse(e.target.value) })
        const out = e.target.parentElement.querySelector("output")
        if (out) out.textContent = { sensitivity: v => `${v.toFixed(2)}×`, fov: v => `${v}°`, musicVolume: v => `${Math.round(v * 100)}%`, sfxVolume: v => `${Math.round(v * 100)}%` }[key](settings[key])
      })
    hook("set-sens", "sensitivity")
    hook("set-fov", "fov")
    hook("set-music", "musicVolume")
    hook("set-sfx", "sfxVolume")
    body.querySelector("#set-invert").addEventListener("change", e => updateSettings({ invertY: e.target.checked }))
    body.querySelector("#set-compass").addEventListener("change", e => updateSettings({ compass: e.target.checked }))
    bind(body, {
      bind: id => {
        this.captureKey = id
        this.settingsNote = ""
        this.render_settings(body)
      },
      resetkeys: () => {
        resetKeys()
        this.settingsNote = "Keys reset to the defaults."
        this.render_settings(body)
      },
      quality: q => {
        if (q === qualityName) return
        this.game.autosave()
        setQuality(q)
        try {
          sessionStorage.setItem("ashfall-seed", this.game.seed)
        } catch {
          /* ignore */
        }
        location.reload()
      },
    })
  }

  // ---------------- dialogue ----------------

  openDialogue(npc) {
    this.dialogueNpc = npc
    this.openModal("dialogue")
    this.dlgLog = [{ who: npc.name, text: D.greeting(this.game, npc.spec) }]
    this.dlgView = "talk"
    this.renderDialogue()
  }

  renderDialogue() {
    const g = this.game
    const npc = this.dialogueNpc
    if (!npc) return
    const spec = npc.spec
    const disp = D.disposition(g, spec)
    const topics = D.topics(g, spec)
    const services = D.services(g, spec)
    const title = spec.role === "guildmaster" && spec.faction ? `${FACTIONS[spec.faction].name}` : spec.role === "blade" ? "Blades" : spec.role
    this.win.innerHTML = `<div class="panel dialogue">
      <div class="dlg-head"><h2>${esc(spec.name)}</h2><span class="dim">${RACES[spec.race].name} · ${esc(title)}</span><span class="disp">Disposition <b>${disp}</b></span><button class="close" data-act="close">✕</button></div>
      <div class="dlg-body">
        <div class="dlg-main"></div>
        <div class="dlg-topics">${topics.map(t => `<button class="topic" data-act="topic" data-arg="${t.id}">${esc(t.label)}</button>`).join("")}
          <hr>${services.map(s => `<button class="svc" data-act="svc" data-arg="${s}">${s[0].toUpperCase() + s.slice(1)}</button>`).join("")}
          <button class="svc" data-act="svc" data-arg="persuade">Persuasion</button>
          <button class="svc" data-act="close">Goodbye</button></div>
      </div></div>`
    const main = this.win.querySelector(".dlg-main")
    this.renderDialogueMain(main)
    bind(this.win.querySelector(".dlg-head"), { close: () => this.closeModal() })
    bind(this.win.querySelector(".dlg-topics"), {
      topic: id => {
        const t = topics.find(x => x.id === id)
        this.dlgLog.push({ who: "You", text: t.label, me: true })
        this.dlgLog.push({ who: spec.name, text: D.handleTopic(g, spec, id) })
        this.dlgView = "talk"
        this.renderDialogue()
      },
      svc: s => {
        this.dlgView = s
        this.renderDialogue()
      },
      close: () => this.closeModal(),
    })
  }

  renderDialogueMain(main) {
    const g = this.game
    const c = g.char
    const npc = this.dialogueNpc.spec
    const say = text => {
      if (text) this.dlgLog.push({ who: npc.name, text })
      this.dlgView = "talk"
      this.renderDialogue()
    }
    const back = `<div class="row"><span class="dim">Gold: ${c.gold}</span><button data-act="back">Back to talk</button></div>`
    switch (this.dlgView) {
      case "talk":
        main.innerHTML = `<div class="log">${this.dlgLog.map(l => `<p class="${l.me ? "me" : ""}"><b>${esc(l.who)}:</b> ${esc(l.text)}</p>`).join("")}</div>`
        main.querySelector(".log").scrollTop = 1e6
        return
      case "barter": {
        const stock = D.merchantStock(g, npc)
        const ctx = D.priceContext(g, npc)
        const sellable = c.inventory.filter(i => !isEquipped(c, i) && i.kind !== "quest" && !i.relic && !i.bound)
        main.innerHTML = `<div class="barter"><div><h3>${esc(npc.name)} <span class="dim">(${stock.gold} gold)</span></h3><div class="list">${stock.items.map((i, k) => `<div class="item" data-act="buy" data-arg="${k}" title="${esc(describeItem(i).join(" · "))}"><span>${esc(i.name)}${i.qty > 1 ? ` (${i.qty})` : ""}</span><span class="gold">${buyPrice(i.value, ctx)}</span></div>`).join("")}</div></div>
          <div><h3>Your goods</h3><div class="list">${sellable.map(i => `<div class="item" data-act="sell" data-arg="${c.inventory.indexOf(i)}" title="${esc(describeItem(i).join(" · "))}"><span>${esc(i.name)}${i.qty > 1 ? ` (${i.qty})` : ""}</span><span class="gold">${sellPrice(i.value, ctx)}</span></div>`).join("")}</div></div></div>
          <p class="dim barter-msg">Click to buy or sell. Hover for details.</p>${back}`
        bind(main, {
          buy: k => {
            const r = D.buy(g, npc, stock.items[Number(k)])
            this.renderDialogueMain(main)
            if (r) main.querySelector(".barter-msg").textContent = r
          },
          sell: k => {
            const r = D.sell(g, npc, c.inventory[Number(k)])
            this.renderDialogueMain(main)
            if (r) main.querySelector(".barter-msg").textContent = r
          },
          back: () => say(),
        })
        return
      }
      case "spells": {
        const list = D.spellsForSale(g, npc)
        main.innerHTML = `<h3>Spells for sale</h3><div class="list">${list.map((s, k) => `<div class="item" data-act="buy" data-arg="${k}"><span>${esc(s.name)} <span class="dim">${SKILLS[s.school].name}, ${s.cost} MP</span></span><span class="gold">${s.price}</span></div>`).join("") || `<div class="dim">You know everything I can teach.</div>`}</div>${back}`
        bind(main, { buy: k => say(D.buySpell(g, npc, list[Number(k)])), back: () => say() })
        return
      }
      case "training": {
        const offers = D.trainingOffers(g, npc)
        main.innerHTML = `<h3>Training</h3><p class="dim">Up to 5 sessions per level (${g.trainedThisLevel}/5 used).</p><div class="list">${offers.map((o, k) => `<div class="item" data-act="train" data-arg="${k}"><span>${SKILLS[o.skill].name} <span class="dim">${getSkill(c, o.skill)} → max ${o.cap}</span></span><span class="gold">${o.price}</span></div>`).join("")}</div>${back}`
        bind(main, { train: k => say(D.train(g, offers[Number(k)])), back: () => say() })
        return
      }
      case "healing":
        main.innerHTML = `<h3>Healing</h3><p>Health ${Math.ceil(c.health)}/${maxHealth(c)}${c.poison > 0 ? ", poisoned" : ""}.</p><div class="row"><button data-act="heal">Heal me</button></div>${back}`
        bind(main, { heal: () => say(D.heal(g, npc)), back: () => say() })
        return
      case "travel": {
        const opts = D.travelOptions(g, npc)
        main.innerHTML = `<h3>Silt Strider destinations</h3><div class="list">${opts.map((o, k) => `<div class="item" data-act="go" data-arg="${k}"><span>${esc(o.town.name)} <span class="dim">${REGIONS[o.town.region].name}, ${o.hours}h</span></span><span class="gold">${o.price}</span></div>`).join("")}</div>${back}`
        bind(main, {
          go: k => {
            const r = D.travel(g, opts[Number(k)])
            if (r) say(r)
            else this.closeModal()
          },
          back: () => say(),
        })
        return
      }
      case "persuade":
        main.innerHTML = `<h3>Persuasion</h3><div class="row wrap"><button data-act="p" data-arg="admire">Admire</button><button data-act="p" data-arg="intimidate">Intimidate</button><button data-act="p" data-arg="bribe:10">Bribe 10</button><button data-act="p" data-arg="bribe:100">Bribe 100</button></div>${back}`
        bind(main, {
          p: kind => {
            const r = D.persuade(g, npc, kind)
            this.dlgLog.push({ who: "—", text: r })
            this.dlgView = "persuade"
            this.renderDialogue()
          },
          back: () => say(),
        })
        return
    }
  }

  // ---------------- containers ----------------

  openContainer(title, ref) {
    this.openModal("container")
    const g = this.game
    const c = g.char
    const render = () => {
      const items = ref.loot || ref.items || []
      this.win.innerHTML = `<div class="panel container"><div class="dlg-head"><h2>${esc(title)}</h2><button class="close" data-act="close">✕</button></div>
        <div class="list">${ref.gold ? `<div class="item" data-act="gold"><span>${ref.gold} gold</span><span class="dim">take</span></div>` : ""}${items.map((i, k) => `<div class="item" data-act="take" data-arg="${k}" title="${esc(describeItem(i).join(" · "))}"><span>${esc(i.name)}${i.qty > 1 ? ` (${i.qty})` : ""}</span><span class="dim">${i.value}</span></div>`).join("") || (ref.gold ? "" : `<div class="dim">Empty.</div>`)}</div>
        <div class="row end"><button data-act="all">Take All (E)</button><button data-act="close">Close</button></div></div>`
      bind(this.win, {
        close: () => this.closeModal(),
        gold: () => take(-1),
        take: k => take(Number(k)),
        all: () => this.takeAll(),
      })
    }
    const list = () => (ref.loot ? ref.loot : ref.items)
    const setList = v => (ref.loot !== undefined ? (ref.loot = v) : (ref.items = v))
    const take = k => {
      if (k === -1) {
        c.gold += ref.gold
        c.stats.goldEarned += ref.gold
        ref.gold = 0
        g.audio.play("gold")
      } else {
        const it = list()[k]
        setList(list().filter(x => x !== it))
        addItem(c, it)
        g.onItemTaken(it)
        g.audio.play("pickup")
      }
      this.afterTake(ref)
      render()
    }
    this.takeAll = () => {
      if (ref.gold) take(-1)
      while ((list() || []).length) take(0)
      this.closeModal()
    }
    render()
  }

  afterTake(ref) {
    const empty = !(ref.loot || ref.items || []).length && !ref.gold
    if (empty) {
      ref.looted = true
      const a = this.game.area
      if (a.sacks.includes(ref)) {
        a.scene.remove(ref.mesh)
        a.sacks = a.sacks.filter(s => s !== ref)
      }
    }
  }

  // ---------------- rest & level up ----------------

  openRest(ambush) {
    const g = this.game
    this.openModal("rest")
    this.win.innerHTML = `<div class="panel small-win"><h2>Rest</h2><p>${ambush ? `Resting here is dangerous (${Math.round(ambush * 100)}% chance of being disturbed).` : "You are safe here."}</p>
      <div class="row wrap"><button data-act="r" data-arg="1">1 hour</button><button data-act="r" data-arg="4">4 hours</button><button data-act="r" data-arg="8">8 hours</button><button data-act="heal">Until healed</button><button data-act="close">Cancel</button></div></div>`
    const go = hours => {
      const ok = doRest(g, hours, ambush)
      this.closeModal(true)
      if (ok) g.msg(`You rest for ${hours} hour${hours > 1 ? "s" : ""}.`, "#c9b88f")
      if (ok && canLevelUp(g.char)) this.openLevelUp()
      else if (g.mode === "play") g.input.lock()
    }
    bind(this.win, {
      r: h => go(Number(h)),
      heal: () => {
        const c = g.char
        const need = Math.max(1, Math.ceil((maxHealth(c) - c.health) / Math.max(1, getAttr(c, "endurance") * 0.15)))
        go(Math.min(24, need))
      },
      close: () => this.closeModal(),
    })
  }

  openLevelUp() {
    const g = this.game
    const c = g.char
    this.openModal("levelup")
    const chosen = new Set()
    g.audio.play("levelup")
    const render = () => {
      this.win.innerHTML = `<div class="panel small-win"><h2>Level ${c.level + 1}</h2><p class="dim">You have learned much. Choose three attributes to improve.</p>
        ${ATTRIBUTES.map(a => `<button class="attr ${chosen.has(a) ? "sel" : ""}" data-act="a" data-arg="${a}"><span>${ATTR_LABEL[a]} ${c.attrs[a]}</span><b>x${attrMultiplier(c, a)}</b></button>`).join("")}
        <div class="row end"><button class="big" data-act="ok" ${chosen.size === 3 ? "" : "disabled"}>Level up</button></div></div>`
      bind(this.win, {
        a: a => {
          if (chosen.has(a)) chosen.delete(a)
          else if (chosen.size < 3) chosen.add(a)
          render()
        },
        ok: () => {
          levelUp(c, [...chosen])
          g.trainedThisLevel = 0
          g.msg(`You are now level ${c.level}.`, "#ffe080")
          if (canLevelUp(c)) return this.openLevelUp()
          this.closeModal()
        },
      })
    }
    render()
  }
}
