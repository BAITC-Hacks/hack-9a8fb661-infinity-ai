import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { usePalette } from '../lib/theme'
import { buildTurbine } from '../lib/turbine3d'

/** Мини-3D одной турбины: вращение ∝ ветру, поворот по направлению, медленный облёт камеры. */
export function MiniTurbine({ hub, rotor, wind, direction }: { hub: number; rotor: number; wind: number; direction: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const st = useRef({ wind, direction }); st.current = { wind, direction }
  const c = usePalette()
  useEffect(() => {
    const el = ref.current; if (!el) return
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setSize(el.clientWidth, el.clientHeight); el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, el.clientWidth / el.clientHeight, 1, 2000)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7d5c, 0.9))
    const sun = new THREE.DirectionalLight(0xfff2d6, 1.5); sun.position.set(150, 200, 100); scene.add(sun)
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: '#d9ceb3', roughness: 1 })); ground.rotation.x = -Math.PI / 2; scene.add(ground)
    const tb = buildTurbine(hub, rotor, c.blue); scene.add(tb.group)
    let raf = 0, t0 = performance.now()
    const tick = (now: number) => {
      const dt = (now - t0) / 1000; t0 = now
      const { wind: w, direction: d } = st.current
      tb.rotor.rotation.x += (w < 2.5 ? 0 : Math.min(2.2, 0.28 * w)) * dt
      tb.nacelle.rotation.y += ((-(d * Math.PI) / 180 - tb.nacelle.rotation.y) * Math.min(1, dt * 2))
      const a = now / 9000
      camera.position.set(Math.cos(a) * 190, hub * 0.95, Math.sin(a) * 190); camera.lookAt(0, hub * 0.7, 0)
      renderer.render(scene, camera); raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); renderer.dispose(); el.removeChild(renderer.domElement) }
  }, [hub, rotor, c.blue])
  return <div ref={ref} className="h-56 w-full rounded-lg bg-sunk" />
}
