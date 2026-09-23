import * as THREE from 'three'

/** Реалистичная модель ветротурбины (Goldwind GW109/2500): коническая башня, обтекаемая гондола,
 *  конус-обтекатель, три лопасти с сужением и закруткой. Возвращает группу, ротор и гондолу. */
export function buildTurbine(hubHeight: number, rotorDiameter: number, accent: string) {
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf4f6f8, roughness: 0.35, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.3 })
  const grey = new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.5 })
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(accent), roughness: 0.4 })
  const g = new THREE.Group()
  const r = rotorDiameter / 2

  // башня: три секции с фланцами, дверь и красные кольца на верхней трети (авиационная маркировка)
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 3.4, hubHeight, 40, 1), white); tower.position.y = hubHeight / 2; tower.castShadow = true; g.add(tower)
  for (const f of [0.33, 0.66]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4 - 1.7 * f, 0.12, 8, 40), grey); ring.rotation.x = Math.PI / 2; ring.position.y = hubHeight * f; g.add(ring) }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.2, 1.2, 40), grey); base.position.y = 0.6; g.add(base)
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 0.2), grey); door.position.set(0, 2.4, 3.35); g.add(door)

  // гондола: скруглённый корпус (капсула), задняя часть с решёткой вентиляции, анемометр сверху
  const nac = new THREE.Group(); nac.position.y = hubHeight
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(2.4, 8, 6, 16), white); body.rotation.z = Math.PI / 2; body.position.x = -1.5; body.castShadow = true; nac.add(body)
  const box = new THREE.Mesh(new THREE.BoxGeometry(7, 4.2, 4.2), white); box.position.x = -2; box.castShadow = true; nac.add(box)
  const vent = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 2.8), grey); vent.position.set(-6.6, 0.4, 0); nac.add(vent)
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), grey); mast.position.set(-5, 2.9, 0); nac.add(mast)
  const anem = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), accentMat); anem.position.set(-5, 3.7, 0); nac.add(anem)

  // ротор: обтекатель-конус и лопасти
  const hub = new THREE.Group(); hub.position.x = 3.4
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(2.1, 3.2, 24), white); spinner.rotation.z = -Math.PI / 2; spinner.position.x = 1.2; hub.add(spinner)
  const hubBall = new THREE.Mesh(new THREE.SphereGeometry(2.1, 20, 20), white); hub.add(hubBall)
  const bladeGeo = bladeGeometry(r)
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(bladeGeo, white); blade.castShadow = true
    const pivot = new THREE.Group(); pivot.add(blade); pivot.rotation.x = (i * 2 * Math.PI) / 3
    hub.add(pivot)
  }
  nac.add(hub); g.add(nac)
  return { group: g, rotor: hub, nacelle: nac }
}

/** Лопасть: профиль от круглого корня к тонкому кончику, сужение по хорде и закрутка ~12°. */
function bladeGeometry(length: number) {
  const segs = 24
  const geo = new THREE.CylinderGeometry(1, 1, length, 10, segs, false)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const s = (y + length / 2) / length                           // 0 — корень, 1 — кончик
    const chord = 0.9 * (1 - 0.85 * s) + 0.15                     // хорда сужается
    const thick = 0.9 * (1 - 0.7 * s) * (s < 0.08 ? 1 : 0.35)     // корень круглый, дальше плоский
    const tw = (12 * Math.PI) / 180 * (1 - s)                     // закрутка у корня больше
    const cx = x * chord * 1.9, cz = z * thick
    pos.setX(i, cx * Math.cos(tw) - cz * Math.sin(tw)); pos.setZ(i, cx * Math.sin(tw) + cz * Math.cos(tw))
    pos.setY(i, y + length / 2)
  }
  geo.computeVertexNormals()
  return geo
}
