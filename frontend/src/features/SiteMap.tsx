import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { WindObject } from '../api/types'
import { useT } from '../lib/i18n'
import { usePalette } from '../lib/theme'

interface Props { objects: WindObject[]; wind: number | null; direction: number | null; power: number | null }

export const FALLBACK: WindObject[] = [
  { object_id: 1, name: 'Нурлы — турбина 1', latitude: 43.645138889, longitude: 78.535611111, rated_power_mw: 2.5, tower_height_m: 80, rotor_diameter_m: 109, turbine_model: 'Goldwind GW109/2500', metadata_source_url: '' },
  { object_id: 2, name: 'Нурлы — турбина 2', latitude: 43.643194444, longitude: 78.538833333, rated_power_mw: 2.5, tower_height_m: 80, rotor_diameter_m: 109, turbine_model: 'Goldwind GW109/2500', metadata_source_url: '' },
]

/** Спутниковая карта с турбинами и 3D-сцена площадки: лопасти крутятся по ветру из прогноза. */
export function SiteMap({ objects, wind, direction, power }: Props) {
  const { t } = useT()
  const objs = objects.length ? objects : FALLBACK
  const spinSec = wind == null || wind < 2.5 ? 0 : Math.max(1.2, 12 / wind)
  return (
    <section className="panel rise !p-0">
      <div className="flex h-[44px] items-center gap-3 border-b border-line bg-sunk px-3">
        <span className="text-[14px] font-semibold">{t('map')}</span>
        <span className="mono ml-auto text-mute">{t('map_hint')} · {wind == null ? '—' : `${wind.toFixed(1)} м/с`}{direction == null ? '' : ` · ${Math.round(direction)}°`}</span>
      </div>
      <div className="grid md:grid-cols-2">
        <LeafletMap objs={objs} spinSec={spinSec} direction={direction} />
        <Scene objs={objs} wind={wind ?? 0} direction={direction ?? 0} power={power ?? 0} />
      </div>
    </section>
  )
}

function turbineIcon(spinSec: number, label: string, color: string) {
  const anim = spinSec ? `--spin:${spinSec}s` : 'animation:none'
  return L.divIcon({
    className: 'turbine-marker', iconSize: [40, 40], iconAnchor: [20, 38],
    html: `<svg viewBox="0 0 40 40"><circle cx="20" cy="14" r="13" fill="${color}" fill-opacity=".12"/>
      <line x1="20" y1="14" x2="20" y2="38" stroke="#fff" stroke-width="3"/>
      <g class="rotor" style="${anim};transform-origin:20px 14px"><g stroke="#fff" stroke-width="2.8" stroke-linecap="round">
      <line x1="20" y1="14" x2="20" y2="1"/><line x1="20" y1="14" x2="31.3" y2="20.5"/><line x1="20" y1="14" x2="8.7" y2="20.5"/></g>
      <circle cx="20" cy="14" r="2.6" fill="${color}"/></g>
      <text x="20" y="34" font-size="8" font-weight="700" text-anchor="middle" fill="#fff" stroke="#000" stroke-width=".4">${label}</text></svg>`,
  })
}

function LeafletMap({ objs, spinSec, direction }: { objs: WindObject[]; spinSec: number; direction: number | null }) {
  const { t } = useT()
  const ref = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const base = useRef<L.TileLayer | null>(null)
  const [sat, setSat] = useState(true)
  const c = usePalette()
  useEffect(() => {
    if (!ref.current || map.current) return
    const m = L.map(ref.current, { zoomControl: true, attributionControl: false }).setView([43.6442, 78.5372], 16)
    map.current = m
    return () => { m.remove(); map.current = null }
  }, [])
  useEffect(() => {
    const m = map.current; if (!m) return
    base.current?.remove()
    base.current = sat
      ? L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: '' })
      : L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19, attribution: '' })
    base.current.addTo(m)
  }, [sat])
  useEffect(() => {
    const m = map.current; if (!m) return
    const layer = L.layerGroup().addTo(m)
    objs.forEach((o) => {
      L.circle([o.latitude, o.longitude], { radius: (o.rotor_diameter_m ?? 109) / 2, color: c.blue, weight: 1, fillOpacity: 0.08, dashArray: '4 4' }).addTo(layer)
      L.marker([o.latitude, o.longitude], { icon: turbineIcon(spinSec, `T${o.object_id}`, c.blue) })
        .bindTooltip(`${o.name} · ${o.rated_power_mw ?? 2.5} МВт · ${o.tower_height_m ?? 80} м`).addTo(layer)
    })
    if (objs.length >= 2) {
      const a = objs[0], b = objs[1]
      const d = m.distance([a.latitude, a.longitude], [b.latitude, b.longitude])
      L.polyline([[a.latitude, a.longitude], [b.latitude, b.longitude]], { color: c.blue, weight: 1, dashArray: '2 6', opacity: 0.7 }).addTo(layer)
      L.marker([(a.latitude + b.latitude) / 2, (a.longitude + b.longitude) / 2], { icon: L.divIcon({ className: '', html: `<span style="font:10px ui-monospace,monospace;color:#fff;background:${c.blue};padding:1px 5px;border-radius:8px">${Math.round(d)} м</span>`, iconSize: [50, 14], iconAnchor: [25, 7] }) }).addTo(layer)
    }
    if (direction != null) {
      const center = m.getCenter()
      L.marker(center, { icon: L.divIcon({ className: '', iconSize: [60, 60], iconAnchor: [30, 30],
        html: `<svg viewBox="0 0 60 60" style="transform:rotate(${direction + 180}deg)"><path d="M30 8 L36 26 L30 22 L24 26 Z" fill="${c.blue}"/><circle cx="30" cy="30" r="27" fill="none" stroke="${c.blue}" stroke-opacity=".35" stroke-dasharray="3 5"/></svg>` }) }).addTo(layer)
    }
    return () => { layer.remove() }
  }, [objs, spinSec, direction, c.blue])
  return (
    <div className="relative">
      <div ref={ref} className="h-[520px] w-full" />
      <div className="seg absolute right-3 top-3 z-[500] !h-7 bg-panel">
        <button className={sat ? 'on' : ''} onClick={() => setSat(true)}>{t('map_sat')}</button>
        <button className={!sat ? 'on' : ''} onClick={() => setSat(false)}>{t('map_scheme')}</button>
      </div>
    </div>
  )
}

/** three.js: небо, полупустыня с холмами, зелёная пойма на западе, подстанция между турбинами, дороги, две турбины. */
function Scene({ objs, wind, direction, power }: { objs: WindObject[]; wind: number; direction: number; power: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const state = useRef({ wind, direction, power })
  state.current = { wind, direction, power }
  const c = usePalette()
  useEffect(() => {
    const el = ref.current; if (!el) return
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.shadowMap.enabled = true
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 1, 6000)

    // небо: градиентный купол + солнце
    const skyGeo = new THREE.SphereGeometry(2800, 32, 16)
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color('#3f7fd6') }, mid: { value: new THREE.Color('#a9cdf0') }, bottom: { value: new THREE.Color('#e9dfc8') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top, mid, bottom; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 col = h > 0.0 ? mix(mid, top, pow(h, 0.6)) : mix(mid, bottom, clamp(-h*6.0,0.0,1.0)); gl_FragColor = vec4(col,1.0); }',
    })
    scene.add(new THREE.Mesh(skyGeo, skyMat))
    scene.fog = new THREE.Fog(new THREE.Color('#cfd9e3'), 900, 2600)
    const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(40, 16, 16), new THREE.MeshBasicMaterial({ color: '#fff4d6' })); sunMesh.position.set(900, 700, -1400); scene.add(sunMesh)
    scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x9c8f6e, 0.85))
    const sun = new THREE.DirectionalLight(0xfff2d6, 1.7); sun.position.set(400, 500, -300); sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -500, right: 500, top: 500, bottom: -500, far: 2000 }); scene.add(sun)

    // рельеф: песчаная равнина, пойма с зеленью на западе (x < -260)
    const noise = (x: number, z: number) => Math.sin(x * 0.011) * Math.cos(z * 0.009) * 6 + Math.sin(x * 0.037 + z * 0.021) * 2 + Math.sin(x * 0.09) * Math.cos(z * 0.07) * 0.6
    const geo = new THREE.PlaneGeometry(2400, 2400, 140, 140)
    const pos = geo.attributes.position
    const colors: number[] = []
    const sand = new THREE.Color('#d9ceb3'), sandDark = new THREE.Color('#c2b394'), green = new THREE.Color('#5e7a48'), greenDark = new THREE.Color('#3d5a33')
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), h = noise(x, -y)
      pos.setZ(i, h)
      const west = Math.min(1, Math.max(0, (-x - 220 + Math.sin(y * 0.01) * 60) / 160))
      const col = sandDark.clone().lerp(sand, Math.min(1, Math.max(0, (h + 4) / 12))).lerp(Math.random() > 0.5 ? green : greenDark, west)
      colors.push(col.r, col.g, col.b)
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.computeVertexNormals()
    const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); terrain.rotation.x = -Math.PI / 2; terrain.receiveShadow = true; scene.add(terrain)

    // растительность: редкий кустарник на востоке, деревья на западе
    const shrubs = new THREE.InstancedMesh(new THREE.SphereGeometry(1.6, 6, 5), new THREE.MeshStandardMaterial({ color: '#55613f', roughness: 1 }), 600)
    const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(4, 11, 7), new THREE.MeshStandardMaterial({ color: '#2f4a2c', roughness: 1 }), 500)
    const m4 = new THREE.Matrix4()
    for (let i = 0; i < 600; i++) { const x = (Math.random() - 0.2) * 1800, z = (Math.random() - 0.5) * 2000, s = 0.6 + Math.random() * 1.4
      m4.compose(new THREE.Vector3(x, noise(x, z) + 0.8, z), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.7, s)); shrubs.setMatrixAt(i, m4) }
    for (let i = 0; i < 500; i++) { const x = -300 - Math.random() * 800, z = (Math.random() - 0.5) * 2000, s = 0.7 + Math.random() * 1.2
      m4.compose(new THREE.Vector3(x, noise(x, z) + 5 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)); trees.setMatrixAt(i, m4) }
    trees.castShadow = true; scene.add(shrubs); scene.add(trees)

    // метры от центра площадки
    const lat0 = objs.reduce((a, o) => a + o.latitude, 0) / objs.length, lon0 = objs.reduce((a, o) => a + o.longitude, 0) / objs.length
    const toXZ = (o: WindObject) => [(o.longitude - lon0) * 111000 * Math.cos((lat0 * Math.PI) / 180), -(o.latitude - lat0) * 111000] as const
    const roadMat = new THREE.MeshStandardMaterial({ color: '#cbbf9f', roughness: 1 })
    const road = (ax: number, az: number, bx: number, bz: number, w = 6) => {
      const len = Math.hypot(bx - ax, bz - az)
      const r = new THREE.Mesh(new THREE.PlaneGeometry(w, len), roadMat)
      r.rotation.x = -Math.PI / 2; r.rotation.z = -Math.atan2(bx - ax, bz - az); r.position.set((ax + bx) / 2, noise((ax + bx) / 2, (az + bz) / 2) + 0.25, (az + bz) / 2); scene.add(r)
    }
    // подстанция между турбинами: огороженная площадка, здание с синей крышей, трансформаторы
    const bx = 60, bz = 20
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(70, 50), new THREE.MeshStandardMaterial({ color: '#b8b0a0', roughness: 1 })); yard.rotation.x = -Math.PI / 2; yard.position.set(bx, noise(bx, bz) + 0.3, bz); scene.add(yard)
    const bld = new THREE.Mesh(new THREE.BoxGeometry(22, 6, 10), new THREE.MeshStandardMaterial({ color: '#e8e4dc', roughness: 0.8 })); bld.position.set(bx, noise(bx, bz) + 3, bz); bld.castShadow = true; scene.add(bld)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(23, 0.8, 11), new THREE.MeshStandardMaterial({ color: '#2f6fb3', roughness: 0.6 })); roof.position.set(bx, noise(bx, bz) + 6.4, bz); scene.add(roof)
    for (let i = 0; i < 3; i++) { const tr = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshStandardMaterial({ color: '#6b7280', roughness: 0.7 })); tr.position.set(bx - 22 + i * 8, noise(bx, bz) + 2, bz + 14); tr.castShadow = true; scene.add(tr) }
    const fence = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(72, 2.2, 52)), new THREE.LineBasicMaterial({ color: '#8d8a80' })); fence.position.set(bx, noise(bx, bz) + 1.1, bz); scene.add(fence)

    // ветер: поток частиц-штрихов, летящих по направлению ветра со скоростью, пропорциональной прогнозу
    const N_WIND = 900
    const streaks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.35, 0.35), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 }), N_WIND)
    const wp = Array.from({ length: N_WIND }, () => new THREE.Vector3((Math.random() - 0.5) * 1400, 15 + Math.random() * 150, (Math.random() - 0.5) * 1400))
    scene.add(streaks)
    const white = new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: 0.55 })
    const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(c.blue), roughness: 0.5 })
    const rotors: THREE.Group[] = [], nacelles: THREE.Group[] = []
    objs.forEach((o) => {
      const [x, z] = toXZ(o)
      road(x, z, bx, bz)
      const h = o.tower_height_m ?? 80, r = (o.rotor_diameter_m ?? 109) / 2
      const g = new THREE.Group(); g.position.set(x, noise(x, z), z)
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.6, 32), new THREE.MeshStandardMaterial({ color: '#b9b2a4', roughness: 1 })); pad.position.y = 0.3; g.add(pad)
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 3.2, h, 24), white); tower.position.y = h / 2; tower.castShadow = true; g.add(tower)
      const nac = new THREE.Group(); nac.position.y = h
      const body = new THREE.Mesh(new THREE.BoxGeometry(12, 5, 5), white); body.castShadow = true; nac.add(body)
      const hub = new THREE.Group(); hub.position.x = 7
      hub.add(new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 16), accent))
      for (let i = 0; i < 3; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.8, r, 3.2), white); blade.position.y = r / 2; blade.castShadow = true
        const pivot = new THREE.Group(); pivot.add(blade); pivot.rotation.x = (i * 2 * Math.PI) / 3; hub.add(pivot)
      }
      nac.add(hub); g.add(nac); scene.add(g); rotors.push(hub); nacelles.push(nac)
    })
    road(-700, 600, bx, bz, 7); road(bx, bz, 700, -500, 7)

    let raf = 0; let t0 = performance.now()
    const tick = (now: number) => {
      const dt = (now - t0) / 1000; t0 = now
      const { wind: w, direction: dir, power: pw } = state.current
      const omega = w < 2.5 ? 0 : Math.min(2.2, 0.28 * w) * (0.6 + 0.4 * Math.min(1, pw + 0.2))
      rotors.forEach((h) => { h.rotation.x += omega * dt })
      nacelles.forEach((n) => { n.rotation.y += ((-(dir * Math.PI) / 180 - n.rotation.y) * Math.min(1, dt * 2)) })
      // ветер дует ИЗ направления dir (метео-конвенция): вектор движения частиц — противоположный
      const rad = (dir * Math.PI) / 180, vx = -Math.sin(rad) * w * 6, vz = Math.cos(rad) * w * 6
      const yaw = Math.atan2(vx, vz)
      const len = Math.max(2, w * 2.2)
      wp.forEach((v, i) => {
        v.x += vx * dt; v.z += vz * dt
        if (v.x > 700) v.x -= 1400; if (v.x < -700) v.x += 1400; if (v.z > 700) v.z -= 1400; if (v.z < -700) v.z += 1400
        m4.compose(v, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw + Math.PI / 2, 0)), new THREE.Vector3(len, 1, 1))
        streaks.setMatrixAt(i, m4)
      })
      streaks.instanceMatrix.needsUpdate = true
      ;(streaks.material as THREE.MeshBasicMaterial).opacity = w < 2.5 ? 0.12 : Math.min(0.7, 0.2 + w * 0.05)
      const a = now / 16000
      camera.position.set(-420 * Math.cos(a) + 60, 140 + 30 * Math.sin(a * 1.3), 420 * Math.sin(a) + 20); camera.lookAt(30, 60, 10)
      renderer.render(scene, camera); raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const onResize = () => { renderer.setSize(el.clientWidth, el.clientHeight); camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix() }
    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); renderer.dispose(); el.removeChild(renderer.domElement) }
  }, [objs, c.blue])
  return <div ref={ref} className="h-[520px] w-full border-l border-line" />
}
