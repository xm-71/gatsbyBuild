import { settings } from "../core/settings.js"
import { AudioEngine } from "../audio/engine.js"
import { Music } from "../audio/music.js"
import { Ambience } from "../audio/ambience.js"
import { impact, spellCast, spellImpact, footstep, misc, creatureVoice } from "../audio/sfx.js"
import { SEA_LEVEL } from "../logic/worldgen.js"
import { speakGreeting } from "../audio/voice.js"

// Everything the game hears: adaptive music, ambience and 3D sound effects,
// all synthesized with WebAudio (no audio files).
export class Audio {
  constructor() {
    this.e = new AudioEngine()
    this.music = new Music(this.e)
    this.ambience = new Ambience(this.e)
    this.envT = 0
    this.env = { kind: "overworld", region: "ascadian", weather: "clear", night: false, inTown: false, coast: 0, lava: false, theme: "cave", title: true }
    this.combat = 0
  }

  get ctx() {
    return this.e.ctx
  }

  ensure() {
    if (!this.e.init()) return
    if (this.e.ctx.state === "suspended") this.e.ctx.resume()
    this.music.start()
    this.ambience.start()
  }

  applyVolumes() {
    this.e.applyVolumes()
  }

  // Named one-shot. opts.pos makes it positional.
  play(name, opts = {}) {
    if (!this.e.ctx) return
    const out = this.e.out(opts.pos, { bus: opts.ui ? this.e.uiBus : this.e.sfxBus })
    if (!out) return
    if (name === "hit") return impact(this.e, out, opts.material || "flesh", opts.wclass || "blade", opts.strength ?? 1)
    if (name === "spell") return spellCast(this.e, out, opts.element)
    if (name === "explode") return spellImpact(this.e, out, opts.element, opts.size)
    if (name === "levelup") {
      misc(this.e, out, "skillup")
      return this.music.sting("levelup")
    }
    misc(this.e, out, name, opts)
  }

  hit(material, wclass, pos, strength = 1) {
    this.play("hit", { material, wclass, pos, strength })
  }

  step(surface, heavy, pos = null, loud = 1) {
    if (!this.e.ctx) return
    const out = this.e.out(pos, { send: !!pos })
    if (out) footstep(this.e, out, surface, heavy, loud)
  }

  creature(enemy, event) {
    if (!this.e.ctx) return
    const pos = enemy.center
    const out = this.e.out(pos, { ref: 2.5 * (enemy.def.scale || 1), max: 50 })
    if (out) creatureVoice(this.e, out, enemy.def, event, (enemy.def.scale || 1) * (enemy.boss ? 1.4 : 1))
  }

  sting(name) {
    this.music.sting(name)
  }

  greet(npcSpec, raceId, text) {
    if (settings.npcVoice) speakGreeting(text, raceId, npcSpec)
  }

  setUnderwater(on) {
    if (!this.e.ctx || on === this.under) return
    this.under = on
    this.e.muffle.frequency.setTargetAtTime(on ? 500 : 20000, this.e.now, 0.08)
    if (on) this.play("splash")
  }

  enterArea(area) {
    if (!this.e.ctx) return
    this.e.setSpace(area.kind === "overworld" ? "overworld" : area.kind === "interior" ? "town" : "dungeon")
    this.ambience.setEmitters(area.kind !== "overworld" ? area.lightPositions?.() || [] : [])
  }

  // Called every frame with the game: listener, music mood and ambience mix.
  update(dt, g) {
    if (!this.e.ctx) return
    this.e.setListener(g.camera)
    this.envT -= dt
    if (this.envT <= 0) {
      this.envT = 0.4
      this.env = this.readEnv(g)
      this.music.set(this.musicState(g))
    }
    this.ambience.update(dt, this.env)
  }

  readEnv(g) {
    const title = g.mode === "title" || g.mode === "chargen"
    const w = g.world
    const area = g.area
    const p = title ? g.camera.position : g.pc.pos
    const env = { underwater: !!g.pc?.underwater && !title, kind: area.kind, title, interior: area.kind === "interior", weather: title ? "clear" : g.weather, night: !title && g.isNight?.(), region: w.regionAt(p.x, p.z), inTown: false, coast: 0, lava: false, theme: area.dungeon?.type || "cave" }
    if (area.kind === "interior") {
      env.inTown = true
      env.region = area.town.region
    }
    if (area.kind === "overworld") {
      env.inTown = !!area.townAt?.(p.x, p.z, 10)
      let water = 0
      let lava = 0
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        for (const r of [12, 30]) {
          const x = p.x + Math.cos(a) * r
          const z = p.z + Math.sin(a) * r
          if (w.heightAt(x, z) < SEA_LEVEL) water++
          if (w.lavaAt(x, z)) lava++
        }
      }
      env.coast = Math.min(1, water / 8)
      env.lava = lava > 0
    }
    return env
  }

  musicState(g) {
    const title = g.mode === "title" || g.mode === "chargen"
    if (title) return { mode: "title" }
    // combat: aware enemies nearby raise the intensity; it decays slowly after
    let threat = 0
    let boss = false
    if (g.mode === "play" && g.area?.enemies) {
      for (const e of g.area.enemies) {
        if (e.dead || !e.aware) continue
        const d = e.pos.distanceTo(g.pc.pos)
        if (d > 35) continue
        threat += e.boss ? 1 : 0.45
        if (e.boss) boss = true
      }
    }
    const target = Math.min(1, threat)
    this.combat = target > this.combat ? target : Math.max(target, this.combat - 0.06)
    return { mode: "play", area: this.env.kind, region: this.env.region, theme: this.env.theme, inTown: this.env.inTown, night: this.env.night, combat: this.combat, boss }
  }
}
