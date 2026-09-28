import * as THREE from "three"

const matCache = new Map()
function mat(color, opts = {}) {
  const key = `${color}:${opts.transparent ? 1 : 0}:${opts.emissive || 0}`
  if (!matCache.has(key)) {
    matCache.set(
      key,
      new THREE.MeshLambertMaterial({
        color,
        transparent: !!opts.transparent,
        opacity: opts.transparent ? 0.55 : 1,
        emissive: opts.emissive || 0,
        depthWrite: !opts.transparent,
      })
    )
  }
  return matCache.get(key)
}

const shade = (color, f) => new THREE.Color(color).multiplyScalar(f).getHex()

function mesh(geo, color, opts) {
  const m = new THREE.Mesh(geo, mat(color, opts))
  m.castShadow = true
  return m
}

function ellipsoid(rx, ry, rz, color, opts) {
  const m = mesh(new THREE.SphereGeometry(1, 10, 8), color, opts)
  m.scale.set(rx, ry, rz)
  return m
}

// A limb that pivots at its top.
function limb(len, r, color, opts) {
  const pivot = new THREE.Group()
  const m = mesh(new THREE.CylinderGeometry(r, r * 0.8, len, 6), color, opts)
  m.position.y = -len / 2
  pivot.add(m)
  pivot.userData.len = len
  return pivot
}

function quadruped(def, o) {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const c = def.color
  const legLen = o.legLen
  body.position.y = legLen
  body.add(ellipsoid(o.bodyW, o.bodyH, o.bodyL, c))
  const head = new THREE.Group()
  head.position.set(0, o.headY, o.bodyL * 0.95)
  head.add(ellipsoid(o.headW, o.headW * 0.8, o.headL, shade(c, 0.9)))
  if (o.tusks) {
    for (const sx of [-1, 1]) {
      const t = mesh(new THREE.ConeGeometry(0.05, 0.4, 4), 0xe8e0c8)
      t.rotation.x = Math.PI / 2 + 0.6
      t.position.set(sx * o.headW * 0.6, -0.05, o.headL * 0.8)
      head.add(t)
    }
  }
  if (o.mouth) {
    const jaw = mesh(new THREE.BoxGeometry(o.headW * 1.6, 0.08, o.headL * 1.2), 0x3a0a0a)
    jaw.position.set(0, -0.05, o.headL * 0.3)
    head.add(jaw)
  }
  const eye = mat(0x111111)
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), eye)
    e.position.set(sx * o.headW * 0.55, o.headW * 0.3, o.headL * 0.6)
    head.add(e)
  }
  body.add(head)
  const legs = []
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const l = limb(legLen, o.legR, shade(c, 0.8))
    l.position.set(sx * o.bodyW * 0.7, 0, sz * o.bodyL * 0.6)
    body.add(l)
    legs.push({ l, phase: sx * sz > 0 ? 0 : Math.PI })
  }
  if (o.tail) {
    const tail = limb(o.tail, 0.07, shade(c, 0.85))
    tail.rotation.x = -2.1
    tail.position.set(0, 0, -o.bodyL * 0.9)
    body.add(tail)
  }
  return {
    root,
    anim(t, move, attack) {
      const s = Math.sin(t * 10) * 0.6 * move
      for (const { l, phase } of legs) l.rotation.x = Math.sin(t * 10 + phase) * 0.6 * move
      body.position.y = legLen + Math.abs(s) * 0.05
      head.rotation.x = -attack * 0.6
    },
  }
}

function biped(def, o) {
  // guar, clannfear, daedroth: two big legs, leaning body, small arms
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const c = def.color
  body.position.y = 1.3
  const torso = ellipsoid(0.55, 0.6, 0.9, c)
  torso.rotation.x = -0.4
  body.add(torso)
  const head = new THREE.Group()
  head.position.set(0, 0.6, 1.0)
  head.add(ellipsoid(0.35, 0.3, 0.6, shade(c, 0.9)))
  if (o.frill) {
    const frill = mesh(new THREE.ConeGeometry(0.7, 0.5, 8, 1, true), shade(c, 0.7))
    frill.rotation.x = -Math.PI / 2
    frill.position.set(0, 0.1, -0.1)
    head.add(frill)
  }
  body.add(head)
  const legs = []
  for (const sx of [-1, 1]) {
    const l = limb(1.3, 0.16, shade(c, 0.8))
    l.position.set(sx * 0.4, 0, -0.1)
    body.add(l)
    legs.push({ l, phase: sx > 0 ? 0 : Math.PI })
  }
  const tail = limb(1.4, 0.12, shade(c, 0.85))
  tail.rotation.x = -2.2
  tail.position.set(0, 0, -0.8)
  body.add(tail)
  const arms = []
  for (const sx of [-1, 1]) {
    const a = limb(0.5, 0.07, shade(c, 0.8))
    a.position.set(sx * 0.4, 0.2, 0.7)
    a.rotation.x = -0.8
    body.add(a)
    arms.push(a)
  }
  return {
    root,
    anim(t, move, attack) {
      for (const { l, phase } of legs) l.rotation.x = Math.sin(t * 8 + phase) * 0.7 * move
      body.position.y = 1.3 + Math.abs(Math.sin(t * 8)) * 0.08 * move
      head.rotation.x = -attack * 0.7
      for (const a of arms) a.rotation.x = -0.8 - attack * 0.8
    },
  }
}

function humanoid(def, o = {}) {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const skin = o.skin ?? def.color
  const cloth = o.cloth ?? shade(def.color, 0.7)
  const tr = o.transparent ? { transparent: true } : undefined
  const thin = o.thin ? 0.55 : 1
  const bulk = o.bulk || 1
  body.position.y = 1.0
  const torso = mesh(new THREE.BoxGeometry(0.55 * bulk * thin + 0.1, 0.75, 0.3 * bulk), cloth, tr)
  torso.position.y = 0.42
  body.add(torso)
  const headG = new THREE.Group()
  headG.position.y = 1.02
  const headSize = o.bigHead ? 0.28 : 0.17
  headG.add(ellipsoid(headSize, headSize * 1.15, headSize, skin, tr))
  if (o.hair !== undefined) {
    const hair = ellipsoid(headSize * 1.05, headSize * 0.7, headSize * 1.05, o.hair)
    hair.position.y = headSize * 0.45
    headG.add(hair)
  }
  if (o.horns) {
    for (const sx of [-1, 1]) {
      const h = mesh(new THREE.ConeGeometry(0.05, 0.35, 5), 0x1a1010)
      h.position.set(sx * 0.12, 0.2, 0)
      h.rotation.z = -sx * 0.4
      headG.add(h)
    }
  }
  if (o.mask) {
    const m = mesh(new THREE.BoxGeometry(0.3, 0.34, 0.08), 0xd8b040, { emissive: 0x3a2a00 })
    m.position.set(0, 0, 0.16)
    headG.add(m)
  }
  if (o.tentacles) {
    for (let i = 0; i < 5; i++) {
      const t = limb(0.35, 0.03, shade(skin, 0.7))
      t.position.set((i - 2) * 0.05, -0.08, 0.14)
      t.rotation.x = 0.3
      headG.add(t)
    }
  }
  if (o.glowEyes) {
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshBasicMaterial({ color: o.glowEyes }))
      e.position.set(sx * 0.06, 0.03, headSize * 0.92)
      headG.add(e)
    }
  }
  if (o.helm) {
    const helm = ellipsoid(headSize * 1.15, headSize * 0.9, headSize * 1.15, o.helm)
    helm.position.y = headSize * 0.3
    headG.add(helm)
  }
  body.add(headG)
  const arms = []
  for (const sx of [-1, 1]) {
    const a = limb(0.7, 0.07 * bulk * thin, sx > 0 ? cloth : cloth, tr)
    a.position.set(sx * (0.33 * bulk * thin + 0.05), 0.78, 0)
    body.add(a)
    arms.push(a)
    const hand = ellipsoid(0.06, 0.07, 0.06, skin, tr)
    hand.position.y = -0.72
    a.add(hand)
  }
  if (o.weapon) {
    const blade = mesh(new THREE.BoxGeometry(0.05, 0.9, 0.1), o.weapon)
    blade.position.set(0, -0.95, 0.35)
    blade.rotation.x = Math.PI / 2 + 0.2
    arms[1].add(blade)
  }
  const legs = []
  if (o.robe || o.float) {
    const robe = mesh(new THREE.ConeGeometry(0.38, 1.05, 8, 1, true), cloth, tr)
    robe.position.y = -0.5
    body.add(robe)
  } else if (o.wheel) {
    const wheel = mesh(new THREE.TorusGeometry(0.45, 0.12, 6, 14), shade(cloth, 0.8))
    wheel.position.y = -0.5
    body.add(wheel)
  } else {
    for (const sx of [-1, 1]) {
      const l = limb(0.95, 0.09 * bulk * thin, o.legs ?? shade(cloth, 0.8), tr)
      l.position.set(sx * 0.14 * bulk, 0.05, 0)
      body.add(l)
      legs.push({ l, phase: sx > 0 ? 0 : Math.PI })
    }
  }
  const baseY = o.float ? 1.4 : 1.0
  return {
    root,
    head: headG,
    anim(t, move, attack) {
      for (const { l, phase } of legs) l.rotation.x = Math.sin(t * 8 + phase) * 0.6 * move
      arms[0].rotation.x = Math.sin(t * 8) * 0.5 * move
      arms[1].rotation.x = -Math.sin(t * 8) * 0.5 * move - attack * 1.8
      body.position.y = baseY + (o.float ? Math.sin(t * 2) * 0.12 : Math.abs(Math.sin(t * 8)) * 0.04 * move)
    },
  }
}

function crab(def) {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  body.position.y = 0.45
  body.add(ellipsoid(0.8, 0.35, 0.65, def.color))
  const legs = []
  for (let i = 0; i < 6; i++) {
    const sx = i < 3 ? -1 : 1
    const l = limb(0.6, 0.05, shade(def.color, 0.8))
    l.position.set(sx * 0.6, 0, ((i % 3) - 1) * 0.35)
    l.rotation.z = sx * 0.9
    body.add(l)
    legs.push(l)
  }
  const claws = []
  for (const sx of [-1, 1]) {
    const cl = new THREE.Group()
    cl.position.set(sx * 0.45, 0.05, 0.6)
    cl.add(ellipsoid(0.2, 0.12, 0.3, shade(def.color, 1.1)))
    body.add(cl)
    claws.push(cl)
  }
  return {
    root,
    anim(t, move, attack) {
      legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 14 + i) * 0.4 * move))
      claws.forEach((c, i) => (c.rotation.x = -attack * 0.8 + Math.sin(t * 3 + i) * 0.1))
    },
  }
}

function spider(def) {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  body.position.y = 0.55
  body.add(ellipsoid(0.5, 0.35, 0.6, def.color))
  const head = ellipsoid(0.25, 0.2, 0.25, shade(def.color, 0.8))
  head.position.set(0, 0.05, 0.6)
  body.add(head)
  const legs = []
  for (let i = 0; i < 8; i++) {
    const sx = i < 4 ? -1 : 1
    const l = limb(0.8, 0.04, shade(def.color, 0.7))
    l.position.set(sx * 0.35, 0.1, ((i % 4) - 1.5) * 0.25)
    l.rotation.z = sx * 1.1
    body.add(l)
    legs.push(l)
  }
  return {
    root,
    anim(t, move, attack) {
      legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 16 + i * 1.3) * 0.5 * move))
      head.rotation.x = -attack * 0.5
      body.position.y = 0.55 + Math.sin(t * 16) * 0.03 * move
    },
  }
}

function worm(def) {
  const root = new THREE.Group()
  const segs = []
  for (let i = 0; i < 5; i++) {
    const s = ellipsoid(0.32 - i * 0.03, 0.28 - i * 0.03, 0.32, i === 0 ? shade(def.color, 0.9) : def.color)
    s.position.set(0, 0.3, 0.5 - i * 0.4)
    root.add(s)
    segs.push(s)
  }
  return {
    root,
    anim(t, move, attack) {
      segs.forEach((s, i) => (s.position.y = 0.3 + Math.max(0, Math.sin(t * 8 - i)) * 0.12 * move + (i === 0 ? attack * 0.3 : 0)))
    },
  }
}

function flier(def) {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  body.add(ellipsoid(0.3, 0.25, 0.8, def.color))
  const head = ellipsoid(0.18, 0.15, 0.35, shade(def.color, 0.9))
  head.position.set(0, 0.1, 0.9)
  body.add(head)
  const beak = mesh(new THREE.ConeGeometry(0.06, 0.5, 5), 0x3a2a1a)
  beak.rotation.x = Math.PI / 2
  beak.position.set(0, 0.05, 1.35)
  body.add(beak)
  const tail = limb(1.6, 0.06, shade(def.color, 0.8))
  tail.rotation.x = -1.7
  tail.position.set(0, 0, -0.6)
  body.add(tail)
  const wingGeo = new THREE.BufferGeometry()
  wingGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0.4, 0, 0, -0.4, 1.8, 0, -0.1]), 3))
  wingGeo.computeVertexNormals()
  const wingMat = new THREE.MeshLambertMaterial({ color: shade(def.color, 1.15), side: THREE.DoubleSide })
  const wings = []
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(wingGeo, wingMat)
    w.scale.x = sx
    w.position.set(sx * 0.15, 0.1, 0)
    body.add(w)
    wings.push(w)
  }
  body.scale.setScalar(1.1)
  return {
    root,
    anim(t, move, attack) {
      const f = Math.sin(t * 12) * 0.7
      wings[0].rotation.z = f
      wings[1].rotation.z = -f
      body.rotation.x = attack * 0.6
    },
  }
}

function netch(def) {
  const root = new THREE.Group()
  const sac = ellipsoid(1.2, 1, 1.5, def.color)
  root.add(sac)
  const tents = []
  for (let i = 0; i < 6; i++) {
    const t = limb(2.2, 0.05, shade(def.color, 0.7))
    const a = (i / 6) * Math.PI * 2
    t.position.set(Math.cos(a) * 0.6, -0.5, Math.sin(a) * 0.6)
    root.add(t)
    tents.push(t)
  }
  return {
    root,
    anim(t, move, attack) {
      sac.scale.y = 1 + Math.sin(t * 2) * 0.05
      tents.forEach((tt, i) => (tt.rotation.x = Math.sin(t * 2 + i) * 0.25 + attack * 0.5))
    },
  }
}

function sphereBot(def) {
  const root = new THREE.Group()
  const ball = ellipsoid(0.6, 0.6, 0.6, def.color)
  ball.position.y = 0.6
  root.add(ball)
  const torso = new THREE.Group()
  torso.position.y = 1.2
  torso.add(ellipsoid(0.35, 0.45, 0.3, shade(def.color, 0.9)))
  const arm = limb(0.8, 0.07, shade(def.color, 0.8))
  arm.position.set(0.4, 0.2, 0)
  const blade = mesh(new THREE.BoxGeometry(0.05, 0.7, 0.2), 0xc8c0a0)
  blade.position.y = -1
  arm.add(blade)
  torso.add(arm)
  root.add(torso)
  return {
    root,
    anim(t, move, attack) {
      ball.rotation.x += 0.1 * move
      arm.rotation.x = -attack * 1.8
      torso.position.y = 1.2 + Math.sin(t * 3) * 0.04
    },
  }
}

export function buildCreatureMesh(def) {
  let built
  switch (def.body) {
    case "quad":
      built = quadruped(def, { legLen: 0.35, legR: 0.06, bodyW: 0.35, bodyH: 0.28, bodyL: 0.6, headW: 0.18, headL: 0.28, headY: 0.1, tail: 0.7 })
      break
    case "hound":
      built = quadruped(def, { legLen: 1.0, legR: 0.07, bodyW: 0.35, bodyH: 0.35, bodyL: 0.9, headW: 0.25, headL: 0.5, headY: 0.35, tail: 0.6 })
      break
    case "kagouti":
      built = quadruped(def, { legLen: 0.6, legR: 0.14, bodyW: 0.65, bodyH: 0.55, bodyL: 1.0, headW: 0.45, headL: 0.5, headY: 0.1, tusks: true, tail: 0.4 })
      break
    case "alit":
      built = quadruped(def, { legLen: 0.55, legR: 0.12, bodyW: 0.6, bodyH: 0.6, bodyL: 0.8, headW: 0.55, headL: 0.4, headY: 0.1, mouth: true, tail: 0.8 })
      break
    case "guar":
      built = biped(def, {})
      break
    case "clannfear":
      built = biped(def, { frill: true })
      break
    case "crab":
      built = crab(def)
      break
    case "spider":
      built = spider(def)
      break
    case "worm":
      built = worm(def)
      break
    case "flier":
      built = flier(def)
      break
    case "netch":
      built = netch(def)
      break
    case "sphere":
      built = sphereBot(def)
      break
    case "skeleton":
      built = humanoid(def, { thin: true, cloth: def.color, skin: def.color, weapon: 0x8a8a8a, glowEyes: 0xff6a20 })
      break
    case "ghost":
      built = humanoid(def, { float: true, transparent: true, cloth: def.color, skin: def.color, glowEyes: 0xa0f0ff })
      break
    case "scamp":
      built = humanoid(def, { bigHead: true, skin: def.color, cloth: def.color, legs: shade(def.color, 0.7), horns: true })
      break
    case "ash":
      built = humanoid(def, { bigHead: true, skin: def.color, cloth: shade(def.color, 0.6), glowEyes: 0xff3010 })
      break
    case "sleeper":
      built = humanoid(def, { bigHead: true, tentacles: true, skin: def.color, cloth: 0x3a1a14, glowEyes: 0xff3010 })
      break
    case "dagoth":
      built = humanoid(def, { mask: true, skin: 0x6a4a3a, cloth: 0x6a1a10, robe: true, weapon: 0xd8b040 })
      break
    case "centurion":
      built = humanoid(def, { bulk: 1.5, skin: def.color, cloth: def.color, wheel: true, weapon: 0x9a9a9a, glowEyes: 0xffc040 })
      break
    case "humanoid":
    default:
      built = humanoid(def, {
        skin: def.daedra ? 0x8a3a2a : 0xb08a6a,
        cloth: def.color,
        hair: def.daedra ? undefined : 0x2a1a10,
        horns: def.daedra,
        robe: !!def.caster,
        weapon: 0x9a9a9a,
        helm: def.daedra ? 0x2a0a0a : undefined,
      })
  }
  const holder = new THREE.Group()
  holder.add(built.root)
  holder.scale.setScalar(def.scale || 1)
  return { group: holder, anim: built.anim, head: built.head }
}

const ROLE_CLOTH = {
  trader: 0x6a5a3a,
  smith: 0x4a3a2a,
  priest: 0xc8a040,
  guildmaster: 0x3a4a6a,
  caravaner: 0x7a6a4a,
  commoner: 0x7a6040,
  guard: 0x8a5a2a,
  blade: 0x2a2a3a,
}

export function buildNpcMesh(npc, race, factionColor) {
  let cloth = ROLE_CLOTH[npc.role] || 0x6a5a4a
  if (factionColor && npc.role === "guildmaster") cloth = new THREE.Color(factionColor).getHex()
  const def = { color: cloth }
  const built = humanoid(def, {
    skin: race.skin,
    hair: race.hair,
    cloth,
    robe: npc.role === "priest" || npc.faction === "magesGuild" || npc.faction === "telvanni",
    helm: npc.role === "guard" ? 0x8a6030 : undefined,
    weapon: npc.role === "guard" ? 0x9a9a9a : undefined,
  })
  const holder = new THREE.Group()
  holder.add(built.root)
  return { group: holder, anim: built.anim, head: built.head }
}
