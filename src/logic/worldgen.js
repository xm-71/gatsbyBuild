import { ARTIFACT_IDS } from "../data/artifacts.js"
import { planRoads, planSignposts, planDock, roadIndex } from "./roads.js"
import { RNG } from "../core/rng.js"
import { createNoise2D } from "../core/noise.js"
import { placeName, dungeonName, npcName, artifactName, dagothName } from "./names.js"

// The map is 1800 m across: Vvardenfell fills the middle 1400 m, and a frozen
// isle lies across a narrow strait to the north.
export const WORLD_SIZE = 1800
export const WORLD_RES = 330
export const MAIN_HALF = 700
export const SEA_LEVEL = 0

export const REGIONS = {
  ashlands: { name: "Ashlands", base: 14, rough: 10, ridge: 14, low: [0x55, 0x4e, 0x46], high: [0x6e, 0x64, 0x5a], fog: 0x8a7a6a, ash: 0.35, flora: { deadTree: 0.5, boulder: 1.2, rock: 1.5 } },
  redMountain: { name: "Red Mountain", base: 20, rough: 10, ridge: 16, low: [0x4a, 0x38, 0x30], high: [0x6a, 0x46, 0x38], fog: 0x9a5a40, ash: 0.7, flora: { boulder: 1.5, rock: 1 } },
  westGash: { name: "West Gash", base: 12, rough: 9, ridge: 18, low: [0x62, 0x6a, 0x42], high: [0x7c, 0x78, 0x62], fog: 0xa0a490, ash: 0, flora: { gashTree: 1.3, rock: 1.4, boulder: 0.8, shrub: 1 } },
  bitterCoast: { name: "Bitter Coast", base: 2.5, rough: 3, ridge: 0, low: [0x48, 0x52, 0x34], high: [0x5a, 0x5c, 0x40], fog: 0x7a8a6a, ash: 0, flora: { swampTree: 2.2, parasol: 0.4, shrub: 1.8 } },
  ascadian: { name: "Ascadian Isles", base: 5, rough: 5, ridge: 2, low: [0x5c, 0x80, 0x34], high: [0x78, 0x96, 0x46], fog: 0xb0c4b0, ash: 0, flora: { parasol: 1.6, shrub: 2, grass: 2, rock: 0.4 } },
  grazelands: { name: "Grazelands", base: 9, rough: 5, ridge: 3, low: [0x92, 0x92, 0x52], high: [0xa8, 0xa0, 0x62], fog: 0xc8c0a0, ash: 0, flora: { grass: 3.5, trama: 1.2, rock: 0.4 } },
  azurasCoast: { name: "Azura's Coast", base: 5, rough: 7, ridge: 10, low: [0x74, 0x72, 0x62], high: [0x8c, 0x84, 0x72], fog: 0xb8b0c8, ash: 0, flora: { rock: 2, boulder: 1, shrub: 0.8, parasol: 0.4 } },
  molagAmur: { name: "Molag Amur", base: 12, rough: 11, ridge: 12, low: [0x3a, 0x28, 0x24], high: [0x56, 0x3a, 0x2c], fog: 0x7a4a3a, ash: 0.5, lava: true, flora: { boulder: 1.5, deadTree: 0.3, rock: 1 } },
  frostholm: { name: "Frostholm", base: 9, rough: 7, ridge: 12, low: [0xc8, 0xcc, 0xd4], high: [0xe8, 0xec, 0xf2], fog: 0xc0ccd8, ash: 0, snow: true, flora: { pine: 4, rock: 0.9, boulder: 0.6 } },
}

const RING = ["ashlands", "grazelands", "azurasCoast", "molagAmur", "ascadian", "bitterCoast", "westGash"]

const STYLE_BY_REGION = {
  ashlands: "redoran",
  westGash: "redoran",
  bitterCoast: "hlaalu",
  ascadian: "hlaalu",
  grazelands: "ashlander",
  azurasCoast: "telvanni",
  molagAmur: "imperial",
}

const DUNGEON_TYPES_BY_REGION = {
  ashlands: ["cave", "dwemer", "daedric", "cave"],
  westGash: ["cave", "tomb", "dwemer", "tomb"],
  bitterCoast: ["cave", "tomb", "cave"],
  ascadian: ["tomb", "cave", "tomb"],
  grazelands: ["cave", "daedric", "tomb"],
  azurasCoast: ["daedric", "cave", "dwemer"],
  molagAmur: ["daedric", "dwemer", "cave"],
  redMountain: ["dwemer", "cave"],
  frostholm: ["barrow", "cave"],
}

const smooth = t => t * t * (3 - 2 * t)
const smoothstep = (a, b, x) => smooth(Math.max(0, Math.min(1, (x - a) / (b - a))))

export function generateWorld(seed) {
  const rng = new RNG(`world:${seed}`)
  const noise = createNoise2D(`terrain:${seed}`)
  const half = WORLD_SIZE / 2
  const MAIN = MAIN_HALF

  // Red Mountain sits roughly central, with the regions arranged around it.
  const rm = { x: rng.range(-90, 90), z: rng.range(-90, 90) }
  const rot = rng.range(0, Math.PI * 2)
  const ring = [...RING]
  if (rng.chance(0.5)) ring.reverse()
  const seeds = [{ id: "redMountain", x: rm.x, z: rm.z }]
  ring.forEach((id, i) => {
    const a = rot + (i / ring.length) * Math.PI * 2 + rng.range(-0.2, 0.2)
    const d = rng.range(290, 380)
    seeds.push({ id, x: rm.x + Math.cos(a) * d, z: rm.z + Math.sin(a) * d })
  })
  const regionIds = [...seeds.map(s => s.id), "frostholm"]
  const ISLE = regionIds.length - 1

  // The frozen isle: a noisy oval across the northern strait, with a peak.
  const isleRng = rng.fork("isle")
  const isle = { x: isleRng.range(-220, 220), z: -772, r: 112 }
  const islePeak = { x: isle.x + isleRng.range(-40, 40), z: isle.z + isleRng.range(-25, 25) }
  function isleLand(x, z) {
    const e = Math.hypot((x - isle.x) / (isle.r * 1.3), (z - isle.z) / isle.r) + noise.fbm(x * 0.006 + 71, z * 0.006 - 33, 4) * 0.3
    return 1 - smoothstep(0.6, 1.0, e)
  }
  function isleHeight(x, z, land) {
    let h = 7 + noise.fbm(x * 0.014 + 5, z * 0.014, 4) * 6 + noise.ridged(x * 0.01 + 91, z * 0.01 - 17, 4) * 14
    h += 26 * Math.exp(-((Math.hypot(x - islePeak.x, z - islePeak.z) / 38) ** 2))
    return h * land - (1 - land) * 14
  }

  function regionWeights(x, z) {
    // domain-warp so borders wiggle
    const wx = x + noise.fbm(x * 0.004, z * 0.004, 3) * 90
    const wz = z + noise.fbm(x * 0.004 + 40, z * 0.004 + 40, 3) * 90
    const out = new Float32Array(seeds.length)
    let sum = 0
    for (let i = 0; i < seeds.length; i++) {
      let d = Math.hypot(wx - seeds[i].x, wz - seeds[i].z)
      if (i === 0) d *= 1.9 // red mountain region is compact
      const w = Math.exp(-(d * d) / (2 * 110 * 110)) + 1e-9
      out[i] = w
      sum += w
    }
    for (let i = 0; i < seeds.length; i++) out[i] /= sum
    return out
  }

  function rawHeight(x, z, weights) {
    const dx = x - rm.x
    const dz = z - rm.z
    const nx = x / MAIN
    const nz = z / MAIN
    const edge = Math.hypot(nx * 1.02, nz) + noise.fbm(x * 0.003 + 11, z * 0.003 - 7, 4) * 0.28
    // the mainland stops short of the northern strait
    const land = (1 - smoothstep(0.62, 0.95, edge)) * smoothstep(-690, -615, z)
    let h = 0
    for (let i = 0; i < seeds.length; i++) {
      const w = weights[i]
      if (w < 0.01) continue
      const R = REGIONS[regionIds[i]]
      const f = noise.fbm(x * 0.012, z * 0.012, 4) * R.rough
      const r = R.ridge ? noise.ridged(x * 0.008 + i * 17, z * 0.008 - i * 13, 4) * R.ridge : 0
      h += w * (R.base + f + r)
    }
    h += noise.fbm(x * 0.05, z * 0.05, 2) * 1.2
    // Red Mountain cone and crater
    const r = Math.hypot(dx, dz)
    h += 120 * Math.exp(-((r / 125) ** 2)) + 30 * Math.exp(-((r / 240) ** 2))
    h -= 42 * Math.exp(-((r / 30) ** 2))
    // coastline falloff into the Inner Sea
    return h * land - (1 - land) * 14
  }

  const N = WORLD_RES + 1
  const cell = WORLD_SIZE / WORLD_RES
  const heights = new Float32Array(N * N)
  const flatMask = new Float32Array(N * N).fill(1)
  const regions = new Uint8Array(N * N)
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = -half + i * cell
      const z = -half + j * cell
      const w = regionWeights(x, z)
      const hMain = rawHeight(x, z, w)
      const il = z < -560 ? isleLand(x, z) : 0
      const hIsle = il > 0 ? isleHeight(x, z, il) : -14
      heights[j * N + i] = Math.max(hMain, hIsle)
      let best = 0
      for (let k = 1; k < w.length; k++) if (w[k] > w[best]) best = k
      regions[j * N + i] = il > 0.3 && hIsle >= hMain ? ISLE : best
    }
  }

  const { heightAt, regionAt, lavaAt, slopeAt } = samplers({ seed, heights, flatMask, regions, regionIds, redMountain: rm })

  function flatten(cx, cz, radius, targetH) {
    const r2 = radius * 1.8
    for (let j = 0; j < N; j++) {
      const z = -half + j * cell
      if (Math.abs(z - cz) > r2) continue
      for (let i = 0; i < N; i++) {
        const x = -half + i * cell
        const d = Math.hypot(x - cx, z - cz)
        if (d > r2) continue
        const t = d < radius ? 1 : 1 - smoothstep(radius, r2, d)
        heights[j * N + i] = heights[j * N + i] * (1 - t) + targetH * t
        flatMask[j * N + i] *= 1 - t
      }
    }
  }

  // ---------- towns ----------
  const usedNames = new Set()
  const towns = []
  const farFromTowns = (x, z, d) => towns.every(t => Math.hypot(t.x - x, t.z - z) > d)
  const distToRM = (x, z) => Math.hypot(x - rm.x, z - rm.z)

  function findSpot(pred, tries = 4000) {
    for (let t = 0; t < tries; t++) {
      const x = rng.range(-MAIN * 0.85, MAIN * 0.85)
      const z = rng.range(-MAIN * 0.85, MAIN * 0.85)
      if (pred(x, z)) return { x, z }
    }
    return null
  }

  // starting town: a coastal village in the Bitter Coast / Ascadian south-west
  const startSpot =
    findSpot((x, z) => {
      const h = heightAt(x, z)
      const reg = regionAt(x, z)
      return (reg === "bitterCoast" || reg === "ascadian") && h > 1.2 && h < 5 && slopeAt(x, z) < 0.4
    }) || findSpot((x, z) => heightAt(x, z) > 1.5 && heightAt(x, z) < 8 && distToRM(x, z) > 250)

  const townPlan = [{ ...startSpot, start: true }]
  for (const regionId of ring) {
    const spot = findSpot((x, z) => {
      const h = heightAt(x, z)
      return regionAt(x, z) === regionId && !lavaAt(x, z) && h > 2.5 && h < 40 && slopeAt(x, z) < 0.35 && distToRM(x, z) > 190 && townPlan.every(t => Math.hypot(t.x - x, t.z - z) > 190)
    })
    if (spot) townPlan.push(spot)
  }

  townPlan.forEach((spot, idx) => {
    const region = regionAt(spot.x, spot.z)
    let style = STYLE_BY_REGION[region] || "hlaalu"
    if (spot.start) style = "imperial"
    const name = spot.start ? placeName(rng, usedNames) : placeName(rng, usedNames)
    const y = Math.max(2.2, heightAt(spot.x, spot.z))
    const radius = style === "ashlander" ? 22 : 34
    flatten(spot.x, spot.z, radius, y)
    towns.push(buildTown(rng.fork(`town:${idx}`), { id: idx, name, x: spot.x, z: spot.z, y, style, region, radius, start: !!spot.start }))
  })

  // A Nord village on the frozen isle.
  const vRng = rng.fork("isle-village")
  let vSpot = null
  for (let t = 0; t < 3000 && !vSpot; t++) {
    const x = isle.x + vRng.range(-isle.r * 1.1, isle.r * 1.1)
    const z = isle.z + vRng.range(-isle.r * 0.8, isle.r * 0.8)
    const h = heightAt(x, z)
    if (regionAt(x, z) === "frostholm" && h > 3 && h < 22 && slopeAt(x, z) < 0.3 && Math.hypot(x - islePeak.x, z - islePeak.z) > 45) vSpot = { x, z }
  }
  if (vSpot) {
    const y = heightAt(vSpot.x, vSpot.z)
    flatten(vSpot.x, vSpot.z, 26, y)
    towns.push(buildTown(vRng.fork("town"), { id: towns.length, name: placeName(vRng, usedNames, "nord"), x: vSpot.x, z: vSpot.z, y, style: "nord", region: "frostholm", radius: 26, isle: true }))
  }

  // ---------- roads, harbours and guides ----------
  const roads = planRoads(towns, { heightAt, lavaAt, rm, half: MAIN })
  const signposts = planSignposts(roads, towns)
  // packed road beds: smooth away the small bumps along each road
  const smoothed = new Set()
  for (const r of roads)
    for (const [x, z] of r.pts) {
      const ci = Math.round((x + half) / cell)
      const cj = Math.round((z + half) / cell)
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const k = (cj + dj) * N + ci + di
          if (k < 0 || k >= N * N || smoothed.has(k)) continue
          smoothed.add(k)
          flatMask[k] *= 0.3
        }
    }
  const extraNpc = (t, role, props) => {
    const race = props.race || (t.style === "nord" ? "nord" : rng.pick(["dunmer", "imperial", "dunmer", "breton"]))
    t.npcs.push({ id: `${t.id}:${t.npcs.length}`, townId: t.id, name: npcName(rng, race), race, role, faction: null, disposition: rng.int(40, 60), seed: rng.int(1, 1e9), ...props })
  }
  for (const t of towns) {
    const dock = planDock(t, heightAt, t.isle ? 170 : 95)
    if (dock) {
      t.dock = dock
      extraNpc(t, "shipmaster", { x: dock.x - Math.cos(dock.angle) * 2, z: dock.z - Math.sin(dock.angle) * 2, building: "Harbour", title: "Shipmaster" })
    }
    const mg = t.buildings.find(b => b.label === "Mages Guild")
    if (mg) extraNpc(t, "guide", { faction: "magesGuild", x: mg.x - Math.cos(mg.angle) * (mg.d / 2 + 2.5) + Math.sin(mg.angle) * 2, z: mg.z - Math.sin(mg.angle) * (mg.d / 2 + 2.5) - Math.cos(mg.angle) * 2, building: "Mages Guild", title: "Guild Guide" })
  }

  // ---------- dungeons ----------
  const startTown = towns[0]
  const dungeons = []
  const usedDungeonNames = new Set()
  const maxDist = MAIN * 2 * 0.8
  let tries = 0
  while (dungeons.length < 20 && tries++ < 6000) {
    const x = rng.range(-MAIN * 0.88, MAIN * 0.88)
    const z = rng.range(-MAIN * 0.88, MAIN * 0.88)
    const h = heightAt(x, z)
    if (h < 3 || slopeAt(x, z) > 0.8 || lavaAt(x, z)) continue
    if (!farFromTowns(x, z, 70)) continue
    if (!dungeons.every(d => Math.hypot(d.x - x, d.z - z) > 80)) continue
    if (distToRM(x, z) < 70) continue
    const region = regionAt(x, z)
    if (region === "frostholm") continue
    const type = rng.pick(DUNGEON_TYPES_BY_REGION[region] || ["cave"])
    const dist = Math.hypot(x - startTown.x, z - startTown.z)
    let tier = 1 + Math.floor((dist / maxDist) * 5 + rng.range(-0.4, 0.8))
    if (region === "redMountain" || region === "molagAmur") tier += 1
    tier = Math.max(1, Math.min(6, tier))
    const levels = Math.max(1, Math.min(3, 1 + Math.floor((tier - 1) / 2) + (rng.chance(0.3) ? 1 : 0)))
    flatten(x, z, 6, h)
    dungeons.push({ id: dungeons.length, name: dungeonName(rng, type, usedDungeonNames), type, x, z, y: h, tier, levels, region, seed: rng.int(1, 1e9), discovered: false, cleared: false })
  }

  // Main quest: three relics in three strongholds, then the Citadel under Red Mountain.
  const relicNames = ["Sunder", "Keening", "Wraithguard"]
  const relicTypes = ["dwemer", "daedric", "tomb"]
  const mainQuest = { dagoth: dagothName(rng), relics: [] }
  relicTypes.forEach((type, i) => {
    const candidates = dungeons.filter(d => !d.relic && d.type === type).sort((a, b) => b.tier - a.tier)
    const target = candidates[0] || dungeons.filter(d => !d.relic).sort((a, b) => b.tier - a.tier)[0]
    target.relic = relicNames[i]
    target.tier = Math.max(target.tier, 3 + i)
    target.levels = Math.max(target.levels, 2)
    mainQuest.relics.push({ name: relicNames[i], dungeonId: target.id })
  })
  // Legendary artifacts: every Daedric shrine's master carries one, and a few
  // other strong dungeon bosses guard the rest. Forked RNG keeps worlds stable.
  const artRng = rng.fork("artifacts")
  const pool = artRng.shuffle([...ARTIFACT_IDS])
  const holders = [...dungeons.filter(d => d.type === "daedric"), ...artRng.shuffle(dungeons.filter(d => d.type !== "daedric" && d.tier >= 3))]
  for (const d of holders.slice(0, Math.min(pool.length, dungeons.filter(d => d.type === "daedric").length + 4))) d.artifact = pool.pop()
  const cr = { x: rm.x + 6, z: rm.z + 6 }
  const citadel = { id: dungeons.length, name: "Dagoth Ur Citadel", type: "citadel", x: cr.x, z: cr.z, y: heightAt(cr.x, cr.z), tier: 7, levels: 3, region: "redMountain", seed: rng.int(1, 1e9), discovered: true, cleared: false, sealed: true, citadel: true }
  flatten(cr.x, cr.z, 8, citadel.y)
  dungeons.push(citadel)
  mainQuest.citadelId = citadel.id

  // Barrows and ice caves on the isle; the first barrow holds the isle's story.
  const bRng = rng.fork("isle-dungeons")
  let isleCount = 0
  for (let t = 0; t < 4000 && isleCount < 4; t++) {
    const x = isle.x + bRng.range(-isle.r * 1.2, isle.r * 1.2)
    const z = isle.z + bRng.range(-isle.r * 0.9, isle.r * 0.9)
    const h = heightAt(x, z)
    if (regionAt(x, z) !== "frostholm" || h < 3 || slopeAt(x, z) > 0.7) continue
    if (!farFromTowns(x, z, 45) || !dungeons.every(d => Math.hypot(d.x - x, d.z - z) > 55)) continue
    const type = isleCount === 3 ? "cave" : "barrow"
    flatten(x, z, 6, h)
    const d = { id: dungeons.length, name: dungeonName(bRng, type, usedDungeonNames), type, x, z, y: h, tier: 4 + (isleCount % 2), levels: 2, region: "frostholm", seed: bRng.int(1, 1e9), discovered: false, cleared: false }
    if (isleCount === 0) d.isleStory = true
    dungeons.push(d)
    isleCount++
  }

  // ---------- landmarks ----------
  const landmarks = []
  const lRng = rng.fork("landmarks")
  const clearOf = (x, z, d) => farFromTowns(x, z, d) && dungeons.every(o => Math.hypot(o.x - x, o.z - z) > 50) && landmarks.every(o => Math.hypot(o.x - x, o.z - z) > d)
  const names = list => lRng.shuffle([...list])
  const shipNames = names(["Grey Gull", "Saint Olms", "Morning Star", "Emperor's Tithe", "Sea Netch", "Tribute", "Ald Skar", "Silver Kagouti"])
  const fortNames = names(["Darius", "Moonmoth", "Hawkmoth", "Buckmoth", "Falensarano", "Ebonheart", "Pelagiad", "Firemoth"])
  const propNames = names(["Valenvaryon", "Rotheran", "Hlormaren", "Falasmaryon", "Marandus", "Telasero", "Berandas", "Indoranyon", "Andasreth"])
  const place = (pred, tries = 12000) => {
    for (let t = 0; t < tries; t++) {
      const x = lRng.range(-MAIN * 0.9, MAIN * 0.9)
      const z = lRng.range(-MAIN * 0.9, MAIN * 0.9)
      if (pred(x, z)) return { x, z }
    }
    return null
  }
  // Velothi towers: some ancestral tombs are old Dunmer watchtowers instead
  lRng.shuffle(dungeons.filter(d => d.type === "tomb" && !d.relic)).slice(0, 3).forEach(d => {
    d.tower = true
    d.name = d.name.replace("Ancestral Tomb", "Tower")
  })
  // shipwrecks on the beaches
  for (let i = 0; i < 3; i++) {
    const s = place((x, z) => {
      const h = heightAt(x, z)
      if (h < 0.3 || h > 1.4 || regionAt(x, z) === "frostholm" || !clearOf(x, z, 120)) return false
      for (let a = 0; a < 8; a++) if (heightAt(x + Math.cos(a * 0.785) * 12, z + Math.sin(a * 0.785) * 12) < -1.5) return true
      return false
    })
    if (s) landmarks.push({ id: landmarks.length, type: "wreck", name: `Wreck of the ${shipNames.pop()}`, x: s.x, z: s.z, y: heightAt(s.x, s.z), rot: lRng.range(0, 6.28), seed: lRng.int(1, 1e9), tier: 2 })
  }
  // abandoned Imperial strongholds, held by bandits
  for (let i = 0; i < 2; i++) {
    const s = place((x, z) => {
      const h = heightAt(x, z)
      return h > 5 && h < 40 && slopeAt(x, z) < 0.22 && !lavaAt(x, z) && regionAt(x, z) !== "frostholm" && distToRM(x, z) > 220 && clearOf(x, z, 140)
    })
    if (!s) continue
    const y = heightAt(s.x, s.z)
    flatten(s.x, s.z, 16, y)
    landmarks.push({ id: landmarks.length, type: "stronghold", name: `Fort ${fortNames.pop()}`, x: s.x, z: s.z, y, rot: lRng.range(0, 6.28), seed: lRng.int(1, 1e9), tier: 3 })
  }
  // Propylon chambers: an ancient Dunmer teleport network
  for (let i = 0; i < 4; i++) {
    const s = place((x, z) => {
      const h = heightAt(x, z)
      return h > 3 && h < 45 && slopeAt(x, z) < 0.4 && !lavaAt(x, z) && regionAt(x, z) !== "frostholm" && distToRM(x, z) > 170 && farFromTowns(x, z, 60) && dungeons.every(o => Math.hypot(o.x - x, o.z - z) > 30) && landmarks.every(o => Math.hypot(o.x - x, o.z - z) > (o.type === "propylon" ? 280 : 60))
    })
    if (!s) continue
    const y = heightAt(s.x, s.z)
    flatten(s.x, s.z, 9, y)
    landmarks.push({ id: landmarks.length, type: "propylon", name: `${propNames.pop()} Propylon`, x: s.x, z: s.z, y, rot: lRng.range(0, 6.28), seed: lRng.int(1, 1e9) })
  }
  // sunken wrecks on the sea floor, and clam beds along the coasts
  for (let i = 0; i < 2; i++) {
    const s = place((x, z) => {
      const h = heightAt(x, z)
      return h < -5 && h > -12 && landmarks.every(o => Math.hypot(o.x - x, o.z - z) > 150)
    })
    if (s) landmarks.push({ id: landmarks.length, type: "sunken", name: `Sunken ${shipNames.pop() || "Galleon"}`, x: s.x, z: s.z, y: heightAt(s.x, s.z), rot: lRng.range(0, 6.28), seed: lRng.int(1, 1e9), tier: 4 })
  }
  const clams = []
  for (let t = 0; t < 30000 && clams.length < 90; t++) {
    const x = lRng.range(-half * 0.95, half * 0.95)
    const z = lRng.range(-half * 0.95, half * 0.95)
    const h = heightAt(x, z)
    if (h > -1.8 || h < -9) continue
    clams.push({ id: clams.length, x, z, y: h, rot: lRng.range(0, 6.28), seed: lRng.int(1, 1e9) })
  }

  // the Ghostfence rings Red Mountain; the Ghostgate faces the nearest town
  const nearest = [...towns].filter(t => !t.isle).sort((a, b) => distToRM(a.x, a.z) - distToRM(b.x, b.z))[0]
  const gateAngle = Math.atan2(nearest.z - rm.z, nearest.x - rm.x)
  const fenceR = 150
  const gx = rm.x + Math.cos(gateAngle) * fenceR
  const gz = rm.z + Math.sin(gateAngle) * fenceR
  landmarks.push({ id: landmarks.length, type: "ghostfence", name: "Ghostgate", x: gx, z: gz, y: heightAt(gx, gz), cx: rm.x, cz: rm.z, r: fenceR, gateAngle })
  flatten(gx, gz, 10, heightAt(gx, gz))

  // ---------- flora ----------
  const flora = []
  const floraRng = rng.fork("flora")
  const roadIndexLocal = roadIndex(roads)
  const inClearing = (x, z) =>
    towns.some(t => Math.hypot(t.x - x, t.z - z) < t.radius + 8) ||
    dungeons.some(d => Math.hypot(d.x - x, d.z - z) < 9) ||
    landmarks.some(l => (l.type === "ghostfence" ? Math.abs(Math.hypot(x - l.cx, z - l.cz) - l.r) < 5 || Math.hypot(l.x - x, l.z - z) < 14 : Math.hypot(l.x - x, l.z - z) < (l.type === "stronghold" ? 22 : 12))) ||
    roadIndexLocal(x, z) > 0.1
  const attempts = Math.round(26000 * (WORLD_SIZE / 1400) ** 2)
  for (let n = 0; n < attempts; n++) {
    const x = floraRng.range(-half, half)
    const z = floraRng.range(-half, half)
    const h = heightAt(x, z)
    if (h < 0.6) continue
    const R = REGIONS[regionAt(x, z)]
    const entries = Object.entries(R.flora)
    const total = entries.reduce((s, [, v]) => s + v, 0)
    if (!floraRng.chance(total / 9)) continue
    const [type] = floraRng.weighted(entries, e => e[1])
    if (type !== "rock" && type !== "boulder" && slopeAt(x, z) > 0.9) continue
    if (inClearing(x, z) || (type !== "boulder" && type !== "rock" && lavaAt(x, z))) continue
    flora.push({ type, x, z, y: heightAt(x, z), scale: floraRng.range(0.7, 1.35), rot: floraRng.range(0, Math.PI * 2) })
  }

  return hydrateWorld({
    seed,
    size: WORLD_SIZE,
    res: WORLD_RES,
    heights,
    flatMask,
    regionIds,
    regions,
    redMountain: rm,
    towns,
    dungeons,
    flora,
    roads,
    signposts,
    landmarks,
    clams,
    mainQuest,
  })
}

// Lookup functions over the generated grids. Rebuilt from plain data so a world
// generated in a worker (or restored from a save) behaves identically.
export function samplers({ seed, heights, flatMask, regions, regionIds, redMountain: rm, roads = [] }) {
  const half = WORLD_SIZE / 2
  const N = WORLD_RES + 1
  const cell = WORLD_SIZE / WORLD_RES
  const noise = createNoise2D(`terrain:${seed}`)
  const dnoise = createNoise2D(`detail:${seed}`)
  const sample = (arr, x, z) => {
    const fx = Math.max(0, Math.min(WORLD_RES - 1e-4, (x + half) / cell))
    const fz = Math.max(0, Math.min(WORLD_RES - 1e-4, (z + half) / cell))
    const i = Math.floor(fx)
    const j = Math.floor(fz)
    const tx = fx - i
    const tz = fz - j
    const a = arr[j * N + i]
    const b = arr[j * N + i + 1]
    const c = arr[(j + 1) * N + i]
    const d = arr[(j + 1) * N + i + 1]
    // match the terrain mesh triangulation (diagonal from (i,j+1) to (i+1,j))
    if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz
    return d + (c - d) * (1 - tx) + (b - d) * (1 - tz)
  }
  // Fine surface detail (bumps, hummocks) layered on the coarse grid; faded out in towns.
  const detailAt = (x, z) => dnoise.fbm(x * 0.07, z * 0.07, 3) * 1.1 + dnoise.noise(x * 0.31, z * 0.31) * 0.18
  const heightAt = (x, z) => sample(heights, x, z) + detailAt(x, z) * sample(flatMask, x, z)
  const regionAt = (x, z) => {
    const i = Math.round(Math.max(0, Math.min(WORLD_RES, (x + half) / cell)))
    const j = Math.round(Math.max(0, Math.min(WORLD_RES, (z + half) / cell)))
    return regionIds[regions[j * N + i]]
  }
  const lavaAt = (x, z) => {
    const reg = regionAt(x, z)
    if (Math.hypot(x - rm.x, z - rm.z) < 16) return true
    if (reg !== "molagAmur") return false
    return noise.fbm(x * 0.018 + 300, z * 0.018 - 300, 3) > 0.32
  }
  const slopeAt = (x, z) => {
    const e = 2
    return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e)
  }
  const roadAt = roadIndex(roads)
  return { heightAt, regionAt, lavaAt, slopeAt, roadAt }
}

// Plain data (typed arrays + objects) -> a world with lookup functions.
export function hydrateWorld(data) {
  return { ...data, ...samplers(data), startTown: data.towns[0] }
}

// The transferable part of a world, for posting between threads.
export function worldData(w) {
  const { heightAt, regionAt, lavaAt, slopeAt, roadAt, startTown, ...data } = w
  return data
}

// ---------- town layout ----------

const STYLE_RACES = {
  redoran: [["dunmer", 8], ["imperial", 1], ["nord", 1], ["orc", 1]],
  hlaalu: [["dunmer", 6], ["imperial", 2], ["khajiit", 1], ["argonian", 1], ["breton", 1], ["redguard", 1]],
  telvanni: [["dunmer", 8], ["argonian", 2], ["altmer", 1]],
  imperial: [["imperial", 4], ["dunmer", 3], ["nord", 2], ["breton", 2], ["redguard", 1], ["khajiit", 1], ["argonian", 1], ["bosmer", 1], ["orc", 1]],
  ashlander: [["dunmer", 1]],
  nord: [["nord", 8], ["imperial", 1], ["breton", 1]],
}

const HOUSE_OF_STYLE = { redoran: "redoran", hlaalu: "hlaalu", telvanni: "telvanni" }

// How far the door sits from a building's centre, for each style.
function doorOffset(style, b) {
  const big = b.type === "manor" || b.type === "hall"
  if (style === "redoran") return b.d / 2 + 2.3
  if (style === "telvanni") return b.w * 0.26 * 1.05 + 0.5
  if (style === "ashlander") return b.w / 2 + 0.4
  if (style === "nord") return (big ? b.d * 0.75 : b.d / 2) + 0.6
  if (b.type === "fort") return b.d / 2 + 1.5
  return b.d / 2 + 0.6
}

function buildTown(rng, town) {
  const buildings = []
  const npcs = []
  const pickRace = () => rng.weighted(STYLE_RACES[town.style], e => e[1])[0]
  let npcId = 0
  const addNpc = (role, props = {}) => {
    const race = props.race || pickRace()
    npcs.push({
      id: `${town.id}:${npcId++}`,
      townId: town.id,
      name: npcName(rng, race),
      race,
      role,
      faction: null,
      disposition: rng.int(35, 60),
      seed: rng.int(1, 1e9),
      ...props,
    })
    return npcs[npcs.length - 1]
  }

  // Which institutions does this town have?
  const plan = []
  const isAsh = town.style === "ashlander"
  const isNord = town.style === "nord"
  plan.push({ type: "shop", label: "Trader", role: "trader" })
  if (isNord) {
    // a small Nord village: trader, smith, shaman and the elder's longhouse
    plan.push({ type: "smithy", label: "Smith", role: "smith" })
    plan.push({ type: "hall", label: "Shaman's Lodge", role: "priest", faction: null })
    plan.push({ type: "manor", label: "Elder's Longhouse", role: "elder", faction: null })
    for (let i = 0; i < rng.int(3, 4); i++) plan.push({ type: "house", label: null, role: null })
  }
  if (isNord) {
    /* no guilds, temples or forts out here */
  } else {
  if (!isAsh) plan.push({ type: "smithy", label: "Smith", role: "smith" })
  if (!isAsh) plan.push({ type: "temple", label: "Temple", role: "priest", faction: "temple" })
  if (town.style === "imperial" || town.start) plan.push({ type: "fort", label: "Imperial Legion", role: "guildmaster", faction: "legion" })
  if (!isAsh) plan.push({ type: "guild", label: "Fighters Guild", role: "guildmaster", faction: "fightersGuild" })
  if (!isAsh && (town.style !== "redoran" || rng.chance(0.5))) plan.push({ type: "guild", label: "Mages Guild", role: "guildmaster", faction: "magesGuild" })
  if (town.style === "hlaalu" || town.style === "imperial" || rng.chance(0.3)) plan.push({ type: "house", label: "Cornerclub", role: "guildmaster", faction: "thievesGuild" })
  if (HOUSE_OF_STYLE[town.style]) plan.push({ type: "manor", label: `${town.style[0].toUpperCase()}${town.style.slice(1)} Council`, role: "guildmaster", faction: HOUSE_OF_STYLE[town.style] })
  if (rng.chance(0.25)) plan.push({ type: "house", label: "Morag Tong Guildhall", role: "guildmaster", faction: "moragTong" })
  if (isAsh) plan.push({ type: "yurt", label: "Wise Woman's Yurt", role: "priest", faction: null })
  const houses = isAsh ? rng.int(3, 5) : rng.int(3, 6)
  for (let i = 0; i < houses; i++) plan.push({ type: isAsh ? "yurt" : "house", label: null, role: null })
  }
  rng.shuffle(plan)

  const n = plan.length
  plan.forEach((b, i) => {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.12, 0.12)
    const dist = (isAsh ? 12 : isNord ? 14 : 17) + rng.range(0, isAsh ? 6 : isNord ? 6 : 12)
    const x = town.x + Math.cos(a) * dist
    const z = town.z + Math.sin(a) * dist
    const big = b.type === "temple" || b.type === "fort" || b.type === "manor"
    const w = isAsh ? 5 : big ? 11 : b.type === "guild" ? 9 : 7
    const d = isAsh ? 5 : big ? 11 : b.type === "guild" ? 8 : 6
    const bld = { idx: buildings.length, type: b.type, label: b.label, faction: b.faction, x, z, rot: -a + Math.PI / 2, w, d, h: big ? 9 : 6, angle: a }
    // every building has a door on its plaza side; the interior loads from it
    const doorOff = doorOffset(town.style, bld)
    bld.door = { x: x - Math.cos(a) * doorOff, z: z - Math.sin(a) * doorOff }
    buildings.push(bld)
    if (!b.role) {
      // homes have one or two residents inside
      for (let k = 0; k < rng.int(1, 2); k++) addNpc("commoner", { x: bld.door.x, z: bld.door.z, indoor: bld.idx, building: "Home" })
    }
    if (b.role) {
      // stand in front of the door, facing the plaza
      const doorDist = dist - Math.max(w, d) / 2 - 1.6
      const npc = addNpc(b.role, {
        faction: b.faction,
        x: town.x + Math.cos(a) * doorDist,
        z: town.z + Math.sin(a) * doorDist,
        building: b.label,
      })
      if (b.faction) npc.title = b.label
      // shopkeepers, smiths, priests and guild masters work inside; their
      // map position is the door
      npc.indoor = bld.idx
      npc.x = bld.door.x
      npc.z = bld.door.z
      if (b.role === "smith") npc.work = "hammer"
    }
  })

  // Silt strider port outside town
  const portAngle = rng.range(0, Math.PI * 2)
  town.port = { x: town.x + Math.cos(portAngle) * (town.radius + 6), z: town.z + Math.sin(portAngle) * (town.radius + 6), angle: portAngle }
  if (!isNord) addNpc("caravaner", { x: town.port.x - Math.cos(portAngle) * 4, z: town.port.z - Math.sin(portAngle) * 4, building: "Silt Strider" })

  // Main quest contact lives in the starting town.
  if (town.start) addNpc("blade", { race: "imperial", x: town.x + 3, z: town.z - 2, building: "Blades Safehouse" })

  // Commoners and guards wander the plaza
  for (let i = 0; i < rng.int(3, 6); i++) addNpc("commoner", { x: town.x + rng.range(-8, 8), z: town.z + rng.range(-8, 8), wander: true })
  if (!isAsh) for (let i = 0; i < 2; i++) addNpc("guard", { race: town.style === "imperial" ? "imperial" : isNord ? "nord" : "dunmer", x: town.x + rng.range(-12, 12), z: town.z + rng.range(-12, 12), wander: true })

  return { ...town, buildings, npcs, hasTemple: plan.some(p => p.type === "temple"), hasFort: plan.some(p => p.type === "fort") }
}

export function relicDescription(name) {
  return {
    Sunder: "the hammer Sunder, forged by Kagrenac to strike the Heart",
    Keening: "the blade Keening, which flays power from the Heart",
    Wraithguard: "the gauntlet Wraithguard, which shields its bearer from the tools' fury",
  }[name]
}

export { artifactName }
