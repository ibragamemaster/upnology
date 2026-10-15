import { useEffect, useRef } from 'react'
import * as THREE from 'three'

type Props = { progress: number; active: number; onUnavailable: () => void; onReady: () => void }
const phase = (value: number, start: number, end: number) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)))
  return t * t * (3 - 2 * t)
}

export default function UpnologyScene({ progress, active, onUnavailable, onReady }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const state = useRef({ progress, active })
  state.current = { progress, active }

  useEffect(() => {
    const element = host.current
    if (!element) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
    } catch {
      onUnavailable()
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.2 : 1.6))
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.35
    element.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 60)
    camera.position.set(0, 0, 11)
    scene.add(new THREE.AmbientLight('#b8b4f2', 1.2))
    const key = new THREE.PointLight('#8ce8f5', 16, 14)
    key.position.set(3, 3, 5)
    scene.add(key)
    const rim = new THREE.PointLight('#745cff', 10, 12)
    rim.position.set(-3, -2, -1)
    scene.add(rim)
    const root = new THREE.Group()
    scene.add(root)
    const cyan = new THREE.Color('#8ce8f5')
    const blue = new THREE.Color('#6385ff')
    const steel = new THREE.Color('#a89cde')
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.53, 0),
      new THREE.MeshPhysicalMaterial({ color: '#879eff', metalness: 0.55, roughness: 0.2, flatShading: true, emissive: '#453c9d', emissiveIntensity: 0.42 }),
    )
    core.scale.y = 1.35
    root.add(core)
    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.54, 0)),
      new THREE.LineBasicMaterial({ color: '#d8d2ff', transparent: true, opacity: 0.8 }),
    )
    wire.scale.y = 1.35
    root.add(wire)
    const shellGeometry = new THREE.CylinderGeometry(1.05, 1.05, 1.42, 6, 1, true, -Math.PI / 6, Math.PI / 3 - 0.055)
    const shellEdges = new THREE.EdgesGeometry(shellGeometry)
    const petals: THREE.Group[] = []
    const petalMaterials: THREE.MeshPhysicalMaterial[] = []
    for (let i = 0; i < 6; i++) {
      const petal = new THREE.Group()
      petal.rotation.y = i * Math.PI / 3
      const material = new THREE.MeshPhysicalMaterial({ color: i % 2 ? '#33317c' : '#294a95', metalness: 0.3, roughness: 0.29, transparent: true, opacity: 0.86, side: THREE.DoubleSide, flatShading: true, emissive: '#252261', emissiveIntensity: 0.28 })
      petal.add(new THREE.Mesh(shellGeometry, material))
      petal.add(new THREE.LineSegments(shellEdges, new THREE.LineBasicMaterial({ color: i === 3 ? '#baa8ff' : '#8ce8f5', transparent: true, opacity: 0.63 })))
      root.add(petal)
      petals.push(petal)
      petalMaterials.push(material)
    }
    const rings: THREE.Mesh[] = []
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.53 + i * 0.21, 0.008, 4, 72, Math.PI * (1.08 + i * 0.13)),
        new THREE.MeshBasicMaterial({ color: i === 1 ? blue : steel, transparent: true, opacity: i === 1 ? 0.62 : 0.42 }),
      )
      ring.rotation.set(0.38 + i * 0.56, 0.5 + i * 0.62, i * 0.45)
      root.add(ring)
      rings.push(ring)
    }
    const nodes: THREE.Mesh[] = []
    const lines: THREE.Line[] = []
    const signals: THREE.Mesh[] = []
    const paths: THREE.QuadraticBezierCurve3[] = []
    const positions = Array.from({ length: 6 }, (_, i) => {
      const a = -Math.PI / 2 + i * Math.PI / 3
      return new THREE.Vector3(Math.cos(a) * 2.7, Math.sin(a) * 1.9, Math.sin(a * 2) * 0.45)
    })
    positions.forEach((position, i) => {
      const start = new THREE.Vector3(position.x * 0.25, position.y * 0.25, 0)
      const curve = new THREE.QuadraticBezierCurve3(start, new THREE.Vector3(position.x * 0.56, position.y * 0.54, position.z + 0.24), position)
      paths.push(curve)
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(20)),
        new THREE.LineBasicMaterial({ color: '#747bd5', transparent: true, opacity: 0 }),
      )
      root.add(line)
      lines.push(line)
      const node = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.12, 0),
        new THREE.MeshBasicMaterial({ color: i === 3 ? blue : cyan, transparent: true, opacity: 0 }),
      )
      node.position.copy(position)
      root.add(node)
      nodes.push(node)
      const signal = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshBasicMaterial({ color: '#d5dcff', transparent: true, opacity: 0 }))
      root.add(signal)
      signals.push(signal)
    })
    const pointer = { x: 0, y: 0 }
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      pointer.x = (event.clientX / window.innerWidth - 0.5) * 2
      pointer.y = (event.clientY / window.innerHeight - 0.5) * 2
    }
    const onTouch = (event: TouchEvent) => {
      const touch = event.changedTouches[0]
      if (!touch) return
      pointer.x = (touch.clientX / window.innerWidth - 0.5) * 0.35
      pointer.y = (touch.clientY / window.innerHeight - 0.5) * 0.35
    }
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.2 : 1.6))
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('touchstart', onTouch, { passive: true })
    window.addEventListener('resize', onResize)
    const onContextLost = (event: Event) => { event.preventDefault(); onUnavailable() }
    renderer.domElement.addEventListener('webglcontextlost', onContextLost)
    let raf = 0
    let currentProgress = state.current.progress
    let last = performance.now()
    let readySent = false
    let visible = true
    let intersecting = true
    const onVisibility = () => {
      const next = !document.hidden && intersecting
      if (next === visible) return
      visible = next
      cancelAnimationFrame(raf)
      if (visible) { last = performance.now(); raf = requestAnimationFrame(render) }
    }
    document.addEventListener('visibilitychange', onVisibility)
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting
      onVisibility()
    })
    observer.observe(element)
    const render = (now: number) => {
      if (!visible) return
      raf = requestAnimationFrame(render)
      const dt = Math.min(50, now - last)
      last = now
      const ease = 1 - Math.exp(-dt / 140)
      currentProgress += (state.current.progress - currentProgress) * ease
      const opening = phase(currentProgress, 0.12, 0.52)
      const reveal = phase(currentProgress, 0.29, 0.76)
      const mobile = window.innerWidth < 700
      const compact = window.innerWidth < 1000
      const approachPass = phase(currentProgress, 0.18, 0.34) * (1 - phase(currentProgress, 0.49, 0.67))
      const x = mobile ? 0 : compact ? 1.05 + reveal * 0.25 - approachPass * 2.5 : 1.5 + reveal * 0.5 - approachPass * 2.1
      root.position.x += (x - root.position.x) * ease
      root.position.y += ((mobile ? -2.2 + reveal * 1.15 : reveal * 1.1) - root.position.y) * ease
      const scale = (mobile ? 0.82 : compact ? 0.72 : 1) * (1 + reveal * (mobile ? 0.08 : 0.12))
      root.scale.setScalar(scale)
      root.rotation.y += ((pointer.x * 0.075 + currentProgress * 0.35) - root.rotation.y) * ease * 0.36
      root.rotation.x += ((-pointer.y * 0.055 + currentProgress * 0.12) - root.rotation.x) * ease * 0.36
      core.rotation.y += dt * 0.00023
      wire.rotation.y = core.rotation.y
      const pulse = 1 + Math.sin(now * 0.0008) * 0.025
      core.scale.set(pulse, pulse * 1.35, pulse)
      wire.scale.copy(core.scale)
      petals.forEach((petal, i) => {
        const angle = i * Math.PI / 3
        const selected = reveal > 0.5 && state.current.active === i
        const spread = opening * (0.24 + reveal * 0.17) + (selected ? reveal * 0.12 : 0)
        petal.position.set(Math.sin(angle) * spread, Math.sin(i * 2.4) * opening * 0.1, Math.cos(angle) * spread)
        petal.rotation.z = Math.sin(angle) * opening * 0.1
        petalMaterials[i].emissive.set(selected ? '#4c58ad' : '#151538')
        petalMaterials[i].emissiveIntensity = selected ? 0.65 : 0.2
      })
      rings.forEach((ring, i) => { ring.rotation.z += dt * (i % 2 ? -1 : 1) * 0.000035; (ring.material as THREE.MeshBasicMaterial).opacity = (i === 1 ? 0.62 : 0.42) * (1 - reveal * 0.42) })
      nodes.forEach((node, i) => {
        const selected = state.current.active === i
        const birth = phase(reveal, i * 0.075, 0.42 + i * 0.075)
        node.scale.setScalar(birth * (selected ? 1.6 : 0.9))
        ;(node.material as THREE.MeshBasicMaterial).opacity = birth * (selected ? 1 : 0.72)
        node.visible = birth > 0.005
        ;(lines[i].material as THREE.LineBasicMaterial).opacity = birth * (selected ? 0.72 : 0.28)
        const signal = signals[i]
        const travel = (now * 0.000055 + i / 6) % 1
        paths[i].getPoint(travel, signal.position)
        ;(signal.material as THREE.MeshBasicMaterial).opacity = birth * (selected ? 0.7 : 0.2)
      })
      camera.position.z += ((11 - opening * 0.6 - reveal * 0.55) - camera.position.z) * ease
      renderer.render(scene, camera)
      if (!readySent) { readySent = true; onReady() }
    }
    raf = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('touchstart', onTouch)
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost)
      document.removeEventListener('visibilitychange', onVisibility)
      observer.disconnect()
      const geometries = new Set<THREE.BufferGeometry>()
      const materials = new Set<THREE.Material>()
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments) {
          geometries.add(object.geometry)
          const group = Array.isArray(object.material) ? object.material : [object.material]
          group.forEach((material) => materials.add(material))
        }
      })
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [onUnavailable, onReady])
  return <div className="scene-canvas" ref={host} aria-hidden="true" />
}
