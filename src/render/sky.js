import * as THREE from "three"

// Day/night sky colour, sun, the moons Masser and Secunda, stars, and weather particles.
export class Sky {
  constructor(scene) {
    this.scene = scene
    this.hemi = new THREE.HemisphereLight(0xbfcfe0, 0x5a4a3a, 1.2)
    scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.2)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    const c = this.sun.shadow.camera
    c.left = c.bottom = -60
    c.right = c.top = 60
    c.near = 1
    c.far = 400
    this.sun.shadow.bias = -0.0015
    scene.add(this.sun, this.sun.target)

    this.dome = new THREE.Group()
    scene.add(this.dome)
    const moonMat = (color, op = 1) => new THREE.MeshBasicMaterial({ color, fog: false, transparent: op < 1, opacity: op })
    this.masser = new THREE.Mesh(new THREE.SphereGeometry(28, 16, 12), moonMat(0xd8806a))
    this.secunda = new THREE.Mesh(new THREE.SphereGeometry(12, 12, 10), moonMat(0xe0e0e8))
    this.sunDisc = new THREE.Mesh(new THREE.SphereGeometry(20, 16, 12), moonMat(0xfff4c0))
    this.dome.add(this.masser, this.secunda, this.sunDisc)

    const starGeo = new THREE.BufferGeometry()
    const pts = []
    for (let i = 0; i < 900; i++) {
      const u = Math.random() * 2 - 1
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(1 - u * u)
      if (u < 0.05) continue
      pts.push(Math.cos(a) * r * 800, u * 800, Math.sin(a) * r * 800)
    }
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3))
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 }))
    this.dome.add(this.stars)

    // weather particles around the camera
    const n = 1400
    const pgeo = new THREE.BufferGeometry()
    this.particlePos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      this.particlePos[i * 3] = (Math.random() - 0.5) * 60
      this.particlePos[i * 3 + 1] = Math.random() * 30
      this.particlePos[i * 3 + 2] = (Math.random() - 0.5) * 60
    }
    pgeo.setAttribute("position", new THREE.BufferAttribute(this.particlePos, 3))
    this.particles = new THREE.Points(pgeo, new THREE.PointsMaterial({ color: 0x9a8a78, size: 0.18, transparent: true, opacity: 0.8 }))
    this.particles.frustumCulled = false
    this.particles.visible = false
    scene.add(this.particles)

    this.skyColor = new THREE.Color()
    this.weather = "clear"
  }

  // hour: 0..24, regionFog: hex of the current region's daytime haze
  update(dt, hour, camera, regionFog, fog) {
    const t = ((hour - 6) / 24) * Math.PI * 2 // sunrise at 6
    const sunH = Math.sin(t)
    const day = THREE.MathUtils.smoothstep(sunH, -0.18, 0.25)
    const dusk = Math.max(0, 1 - Math.abs(sunH) * 4) * 0.8
    const night = new THREE.Color(0x0a0e1c)
    const dayCol = new THREE.Color(regionFog)
    const duskCol = new THREE.Color(0xc0643a)
    this.skyColor.copy(night).lerp(dayCol, day).lerp(duskCol, dusk * 0.5)
    let visibility = 1
    if (this.weather === "ash" || this.weather === "blight") {
      this.skyColor.lerp(new THREE.Color(this.weather === "blight" ? 0x8a3a2a : 0x7a5a42), 0.6 * (0.3 + day * 0.7))
      visibility = 0.35
    } else if (this.weather === "rain") {
      this.skyColor.lerp(new THREE.Color(0x5a6068), 0.5)
      visibility = 0.6
    } else if (this.weather === "fog") {
      this.skyColor.lerp(new THREE.Color(0x9a9a98), 0.5 * (0.3 + day))
      visibility = 0.35
    } else if (this.weather === "cloudy") {
      this.skyColor.lerp(new THREE.Color(0x808890), 0.3)
      visibility = 0.85
    }
    fog.color.copy(this.skyColor)
    fog.near = 40 * visibility
    fog.far = (140 + 260 * day) * visibility + 60

    const cp = camera.getWorldPosition(new THREE.Vector3())
    this.dome.position.copy(cp)
    const sunDir = new THREE.Vector3(Math.cos(t) * 0.8, sunH, 0.35).normalize()
    this.sunDisc.position.copy(sunDir).multiplyScalar(700)
    this.sunDisc.visible = sunH > -0.1
    const mt = t + Math.PI * 0.9
    this.masser.position.set(Math.cos(mt) * 500, Math.sin(mt) * 500 + 80, -300)
    this.secunda.position.set(Math.cos(mt + 0.5) * 520, Math.sin(mt + 0.5) * 520 + 60, -200)
    this.stars.material.opacity = (1 - day) * (visibility > 0.5 ? 0.9 : 0.2)

    const sunI = Math.max(0, sunH)
    this.sun.intensity = 0.2 + 2.2 * day * visibility
    this.sun.color.setHSL(0.1, 0.5, 0.6 + sunI * 0.3)
    const lightDir = sunH > -0.05 ? sunDir : new THREE.Vector3(Math.cos(mt), Math.max(0.3, Math.sin(mt)), -0.5).normalize()
    this.sun.position.copy(cp).addScaledVector(lightDir, 150)
    this.sun.target.position.copy(cp)
    this.hemi.intensity = 0.35 + 0.95 * day
    this.hemi.color.copy(this.skyColor).lerp(new THREE.Color(0xffffff), 0.4)

    // particles
    const active = this.weather === "ash" || this.weather === "blight" || this.weather === "rain"
    this.particles.visible = active
    if (active) {
      const rain = this.weather === "rain"
      this.particles.material.color.set(rain ? 0xa0b0c0 : this.weather === "blight" ? 0xb04a30 : 0x9a8a78)
      this.particles.material.size = rain ? 0.08 : 0.2
      this.particles.position.set(cp.x, cp.y - 10, cp.z)
      const p = this.particlePos
      for (let i = 0; i < p.length; i += 3) {
        if (rain) p[i + 1] -= dt * 22
        else {
          p[i] += dt * 9
          p[i + 1] -= dt * 1.5
          p[i + 2] += dt * 4
        }
        if (p[i + 1] < 0) p[i + 1] += 30
        if (p[i] > 30) p[i] -= 60
        if (p[i + 2] > 30) p[i + 2] -= 60
      }
      this.particles.geometry.attributes.position.needsUpdate = true
    }
    return { day, skyColor: this.skyColor }
  }
}
