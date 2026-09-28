import { ARTIFACT_IDS } from "../data/artifacts.js"
import { RNG } from "../core/rng.js"
import { createNoise2D } from "../core/noise.js"
import { placeName, dungeonName, npcName, artifactName, dagothName } from "./names.js"

export const WORLD_SIZE = 1400
export const WORLD_RES = 256
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
}

const smooth = t => t * t * (3 - 2 * t)
const smoothstep = (a, b, x) => smooth(Math.max(0, Math.min(1, (x - a) / (b - a))))

export function generateWorld(seed) {
  const rng = new RNG(`world:${seed}`)
  const noise = createNoise2D(`terrain:${seed}`)
  const half = WORLD_SIZE / 2

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
  const regionIds = seeds.map(s => s.id)

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
    const nx = x / half
    const nz = z / half
    const edge = Math.hypot(nx * 1.02, nz) + noise.fbm(x * 0.003 + 11, z * 0.003 - 7, 4) * 0.28
    const land = 1 - smoothstep(0.62, 0.95, edge)
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
      heights[j * N + i] = rawHeight(x, z, w)
      let best = 0
      for (let k = 1; k < w.length; k++) if (w[k] > w[best]) best = k
      regions[j * N + i] = best
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
      const x = rng.range(-half * 0.85, half * 0.85)
      const z = rng.range(-half * 0.85, half * 0.85)
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

  // ---------- dungeons ----------
  const startTown = towns[0]
  const dungeons = []
  const usedDungeonNames = new Set()
  const maxDist = WORLD_SIZE * 0.8
  let tries = 0
  while (dungeons.length < 20 && tries++ < 6000) {
    const x = rng.range(-half * 0.88, half * 0.88)
    const z = rng.range(-half * 0.88, half * 0.88)
    const h = heightAt(x, z)
    if (h < 3 || slopeAt(x, z) > 0.8 || lavaAt(x, z)) continue
    if (!farFromTowns(x, z, 70)) continue
    if (!dungeons.every(d => Math.hypot(d.x - x, d.z - z) > 80)) continue
    if (distToRM(x, z) < 70) continue
    const region = regionAt(x, z)
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

  // ---------- flora ----------
  const flora = []
  const floraRng = rng.fork("flora")
  const inClearing = (x, z) => towns.some(t => Math.hypot(t.x - x, t.z - z) < t.radius + 8) || dungeons.some(d => Math.hypot(d.x - x, d.z - z) < 9)
  const attempts = 26000
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
    mainQuest,
  })
}

// Lookup functions over the generated grids. Rebuilt from plain data so a world
// generated in a worker (or restored from a save) behaves identically.
export function samplers({ seed, heights, flatMask, regions, regionIds, redMountain: rm }) {
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
  return { heightAt, regionAt, lavaAt, slopeAt }
}

// Plain data (typed arrays + objects) -> a world with lookup functions.
export function hydrateWorld(data) {
  return { ...data, ...samplers(data), startTown: data.towns[0] }
}

// The transferable part of a world, for posting between threads.
export function worldData(w) {
  const { heightAt, regionAt, lavaAt, slopeAt, startTown, ...data } = w
  return data
}

// ---------- town layout ----------

const STYLE_RACES = {
  redoran: [["dunmer", 8], ["imperial", 1], ["nord", 1], ["orc", 1]],
  hlaalu: [["dunmer", 6], ["imperial", 2], ["khajiit", 1], ["argonian", 1], ["breton", 1], ["redguard", 1]],
  telvanni: [["dunmer", 8], ["argonian", 2], ["altmer", 1]],
  imperial: [["imperial", 4], ["dunmer", 3], ["nord", 2], ["breton", 2], ["redguard", 1], ["khajiit", 1], ["argonian", 1], ["bosmer", 1], ["orc", 1]],
  ashlander: [["dunmer", 1]],
}

const HOUSE_OF_STYLE = { redoran: "redoran", hlaalu: "hlaalu", telvanni: "telvanni" }

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
  plan.push({ type: "shop", label: "Trader", role: "trader" })
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
  rng.shuffle(plan)

  const n = plan.length
  plan.forEach((b, i) => {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.12, 0.12)
    const dist = (isAsh ? 12 : 17) + rng.range(0, isAsh ? 6 : 12)
    const x = town.x + Math.cos(a) * dist
    const z = town.z + Math.sin(a) * dist
    const big = b.type === "temple" || b.type === "fort" || b.type === "manor"
    const w = isAsh ? 5 : big ? 11 : b.type === "guild" ? 9 : 7
    const d = isAsh ? 5 : big ? 11 : b.type === "guild" ? 8 : 6
    const bld = { type: b.type, label: b.label, faction: b.faction, x, z, rot: -a + Math.PI / 2, w, d, h: big ? 9 : 6, angle: a }
    buildings.push(bld)
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
    }
  })

  // Silt strider port outside town
  const portAngle = rng.range(0, Math.PI * 2)
  town.port = { x: town.x + Math.cos(portAngle) * (town.radius + 6), z: town.z + Math.sin(portAngle) * (town.radius + 6), angle: portAngle }
  addNpc("caravaner", { x: town.port.x - Math.cos(portAngle) * 4, z: town.port.z - Math.sin(portAngle) * 4, building: "Silt Strider" })

  // Main quest contact lives in the starting town.
  if (town.start) addNpc("blade", { race: "imperial", x: town.x + 3, z: town.z - 2, building: "Blades Safehouse" })

  // Commoners and guards wander the plaza
  for (let i = 0; i < rng.int(3, 6); i++) addNpc("commoner", { x: town.x + rng.range(-8, 8), z: town.z + rng.range(-8, 8), wander: true })
  if (!isAsh) for (let i = 0; i < 2; i++) addNpc("guard", { race: town.style === "imperial" ? "imperial" : "dunmer", x: town.x + rng.range(-12, 12), z: town.z + rng.range(-12, 12), wander: true })

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
