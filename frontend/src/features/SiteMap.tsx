import L from 'leaflet'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { WindObject } from '../api/types'
import { useT } from '../lib/i18n'
import { usePalette } from '../lib/theme'

interface Props { objects: WindObject[]; wind: number | null; direction: number | null; power: number | null }

const FALLBACK: WindObject[] = [
  { object_id: 1, name: 'Турбина 1', latitude: 43.645138889, longitude: 78.535611111, rated_power_mw: 2.5, tower_height_m: 80, rotor_diameter_m: 109, turbine_model: 'Goldwind GW109/2500', metadata_source_url: '' },
  { object_id: 2, name: 'Турбина 2', latitude: 43.643194444, longitude: 78.538833333, rated_power_mw: 2.5, tower_height_m: 80, rotor_diameter_m: 109, turbine_model: 'Goldwind GW109/2500', metadata_source_url: '' },
]

/** Карта (OpenStreetMap) с турбинами и 3D-сцена: лопасти крутятся по ветру из прогноза. */
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
        <LeafletMap objs={objs} spinSec={spinSec} />
        <Scene objs={objs} wind={wind ?? 0} direction={direction ?? 0} power={power ?? 0} />
      </div>
    </section>
  )
}

function turbineIcon(spinSec: number, label: string, color: string) {
  const anim = spinSec ? `--spin:${spinSec}s` : 'animation:none'
  return L.divIcon({
    className: 'turbine-marker', iconSize: [34, 34], iconAnchor: [17, 32],
    html: `<svg viewBox="0 0 34 34"><line x1="17" y1="12" x2="17" y2="32" stroke="${color}" stroke-width="2.5"/>
      <g class="rotor" style="${anim}"><g stroke="${color}" stroke-width="2.4" stroke-linecap="round">
      <line x1="17" y1="12" x2="17" y2="1"/><line x1="17" y1="12" x2="26.5" y2="17.5"/><line x1="17" y1="12" x2="7.5" y2="17.5"/></g>
      <circle cx="17" cy="12" r="2.2" fill="${color}"/></g>
      <text x="17" y="34" font-size="7" text-anchor="middle" fill="${color}">${label}</text></svg>`,
  })
}

function LeafletMap({ objs, spinSec }: { objs: WindObject[]; spinSec: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const c = usePalette()
  useEffect(() => {
    if (!ref.current || map.current) return
    const m = L.map(ref.current, { zoomControl: true, attributionControl: true }).setView([43.6442, 78.5372], 15)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(m)
    map.current = m
    return () => { m.remove(); map.current = null }
  }, [])
  useEffect(() => {
    const m = map.current; if (!m) return
    const layer = L.layerGroup().addTo(m)
    objs.forEach((o) => L.marker([o.latitude, o.longitude], { icon: turbineIcon(spinSec, `T${o.object_id}`, c.blue) })
      .bindTooltip(`${o.name} · ${o.rated_power_mw ?? 2.5} МВт`).addTo(layer))
    return () => { layer.remove() }
  }, [objs, spinSec, c.blue])
  return <div ref={ref} className="h-[520px] w-full" />
}

/** three.js: земля, две турбины (башня 80 м, ротор 109 м), вращение ∝ ветру, поворот гондолы по направлению. */
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
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 1, 5000)
    camera.position.set(-260, 150, 420); camera.lookAt(0, 60, 0)
    scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x8a7d5c, 0.9))
    const sun = new THREE.DirectionalLight(0xfff2d6, 1.6); sun.position.set(300, 400, -150); scene.add(sun)
    // Ландшафт: полупустыня у п. Нурлы — песчаная равнина с пологими холмами, редкий кустарник, грунтовые дороги
    scene.background = new THREE.Color(c.bg)
    scene.fog = new THREE.Fog(new THREE.Color(c.bg), 700, 1600)
    const noise = (x: number, z: number) => Math.sin(x * 0.011) * Math.cos(z * 0.009) * 6 + Math.sin(x * 0.037 + z * 0.021) * 2 + Math.sin(x * 0.09) * Math.cos(z * 0.07) * 0.6
    const terrainGeo = new THREE.PlaneGeometry(1800, 1800, 120, 120)
    const pos = terrainGeo.attributes.position
    const colors: number[] = []
    const sand = new THREE.Color('#d8cdb2'), sandDark = new THREE.Color('#bfb190'), dark = new THREE.Color('#8c8468')
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i)
      const h = noise(x, -y)
      pos.setZ(i, h)
      const k = Math.min(1, Math.max(0, (h + 4) / 12))
      const col = sandDark.clone().lerp(sand, k)
      if (Math.sin(x * 0.5) * Math.cos(y * 0.37) > 0.985) col.copy(dark)   // пятна кустарника
      colors.push(col.r, col.g, col.b)
    }
    terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    terrainGeo.computeVertexNormals()
    const terrain = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }))
    terrain.rotation.x = -Math.PI / 2; terrain.receiveShadow = true; scene.add(terrain)
    // кустарник
    const shrubGeo = new THREE.SphereGeometry(1.6, 6, 5), shrubMat = new THREE.MeshStandardMaterial({ color: '#4c5a3c', roughness: 1 })
    const shrubs = new THREE.InstancedMesh(shrubGeo, shrubMat, 700)
    const m4 = new THREE.Matrix4()
    for (let i = 0; i < 700; i++) {
      const x = (Math.random() - 0.5) * 1600, z = (Math.random() - 0.5) * 1600
      const sc = 0.6 + Math.random() * 1.4
      m4.compose(new THREE.Vector3(x, noise(x, z) + 0.8, z), new THREE.Quaternion(), new THREE.Vector3(sc, sc * 0.7, sc))
      shrubs.setMatrixAt(i, m4)
    }
    scene.add(shrubs)
    // грунтовая дорога к площадке
    const road = new THREE.Mesh(new THREE.PlaneGeometry(6, 1400), new THREE.MeshStandardMaterial({ color: '#c9bc9c', roughness: 1 }))
    road.rotation.x = -Math.PI / 2; road.rotation.z = 0.35; road.position.y = 0.15; scene.add(road)

    // метры относительно центра площадки: 1° широты ≈ 111 км, долготы ≈ 111 км·cos(lat)
    const lat0 = objs.reduce((a, o) => a + o.latitude, 0) / objs.length, lon0 = objs.reduce((a, o) => a + o.longitude, 0) / objs.length
    const white = new THREE.MeshStandardMaterial({ color: 0xe6edf3, roughness: 0.6 })
    const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(c.blue), roughness: 0.5 })
    const rotors: THREE.Group[] = []; const nacelles: THREE.Group[] = []
    objs.forEach((o) => {
      const x = (o.longitude - lon0) * 111000 * Math.cos((lat0 * Math.PI) / 180), z = -(o.latitude - lat0) * 111000
      const h = o.tower_height_m ?? 80, r = (o.rotor_diameter_m ?? 109) / 2
      const g = new THREE.Group(); g.position.set(x, noise(x, z), z)
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.6, 32), new THREE.MeshStandardMaterial({ color: '#b9b2a4', roughness: 1 })); pad.position.y = 0.3; g.add(pad)
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 3.2, h, 24), white); tower.position.y = h / 2; g.add(tower)
      const nac = new THREE.Group(); nac.position.y = h
      nac.add(new THREE.Mesh(new THREE.BoxGeometry(12, 5, 5), white))
      const hub = new THREE.Group(); hub.position.x = 7
      hub.add(new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 16), accent))
      for (let i = 0; i < 3; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.8, r, 3.2), white)
        blade.position.y = r / 2
        const pivot = new THREE.Group(); pivot.add(blade); pivot.rotation.x = (i * 2 * Math.PI) / 3
        hub.add(pivot)
      }
      nac.add(hub); g.add(nac); scene.add(g); rotors.push(hub); nacelles.push(nac)
    })

    let raf = 0; let t0 = performance.now()
    const tick = (now: number) => {
      const dt = (now - t0) / 1000; t0 = now
      const { wind: w, direction: dir, power: pw } = state.current
      const omega = w < 2.5 ? 0 : Math.min(2.2, 0.28 * w) * (0.6 + 0.4 * Math.min(1, pw + 0.2))
      rotors.forEach((h) => { h.rotation.x += omega * dt })
      nacelles.forEach((n) => { n.rotation.y += ((-(dir * Math.PI) / 180 - n.rotation.y) * Math.min(1, dt * 2)) })
      camera.position.x = -260 * Math.cos(now / 12000) - 120 * Math.sin(now / 12000); camera.position.z = 420 * Math.cos(now / 12000 + 0.4)
      camera.lookAt(0, 60, 0)
      renderer.render(scene, camera); raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const onResize = () => { renderer.setSize(el.clientWidth, el.clientHeight); camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix() }
    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); renderer.dispose(); el.removeChild(renderer.domElement) }
  }, [objs, c.blue, c.bg])
  return <div ref={ref} className="h-[520px] w-full border-l border-line" />
}
