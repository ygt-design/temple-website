import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const SIZE: [number, number, number] = [120, 200, 60]
const TILT = new THREE.Euler(0.4, 0.6, 0)
const SPIN = { x: 0.1, y: 0.15, z: 0 }
const SPEED = 30
const FILL_COLOR = 0xffffff
const WIREFRAME_COLOR = 0xff00ff
const BOUNDS_COLOR = 0x0000ff

function FloatingPrism() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000)
    camera.position.z = 1000

    const geometry = new THREE.BoxGeometry(...SIZE)
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: FILL_COLOR,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
    const prism = new THREE.Mesh(geometry, fillMaterial)
    prism.rotation.copy(TILT)
    const wireGeometry = new THREE.WireframeGeometry(geometry)
    const wireMaterial = new THREE.LineBasicMaterial({ color: WIREFRAME_COLOR })
    prism.add(new THREE.LineSegments(wireGeometry, wireMaterial))
    scene.add(prism)

    const bounds = new THREE.Box3()
    const half = new THREE.Vector3()
    const measure = () => {
      bounds.setFromObject(prism)
      bounds.getSize(half).multiplyScalar(0.5)
    }
    measure()
    const boundsHelper = new THREE.Box3Helper(bounds, BOUNDS_COLOR)
    scene.add(boundsHelper)

    const angle = Math.random() * Math.PI * 2
    const velocity = new THREE.Vector2(Math.cos(angle), Math.sin(angle)).multiplyScalar(SPEED)
    const view = { halfWidth: 0, halfHeight: 0 }

    const collide = () => {
      const limitX = view.halfWidth - half.x
      const limitY = view.halfHeight - half.y
      if (limitX <= 0) prism.position.x = 0
      else if (prism.position.x > limitX) {
        prism.position.x = limitX
        velocity.x = -Math.abs(velocity.x)
      } else if (prism.position.x < -limitX) {
        prism.position.x = -limitX
        velocity.x = Math.abs(velocity.x)
      }
      if (limitY <= 0) prism.position.y = 0
      else if (prism.position.y > limitY) {
        prism.position.y = limitY
        velocity.y = -Math.abs(velocity.y)
      } else if (prism.position.y < -limitY) {
        prism.position.y = -limitY
        velocity.y = Math.abs(velocity.y)
      }
    }

    const resize = () => {
      const { clientWidth: width, clientHeight: height } = container
      renderer.setSize(width, height)
      view.halfWidth = width / 2
      view.halfHeight = height / 2
      camera.left = -view.halfWidth
      camera.right = view.halfWidth
      camera.top = view.halfHeight
      camera.bottom = -view.halfHeight
      camera.updateProjectionMatrix()
      collide()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let last: number | null = null
    renderer.setAnimationLoop((time) => {
      const dt = last == null ? 0 : Math.min((time - last) / 1000, 0.05)
      last = time
      if (!reducedMotion) {
        prism.rotation.x += SPIN.x * dt
        prism.rotation.y += SPIN.y * dt
        prism.rotation.z += SPIN.z * dt
        prism.position.x += velocity.x * dt
        prism.position.y += velocity.y * dt
        measure()
        collide()
      }
      bounds.setFromObject(prism)
      renderer.render(scene, camera)
    })

    return () => {
      renderer.setAnimationLoop(null)
      observer.disconnect()
      geometry.dispose()
      fillMaterial.dispose()
      wireGeometry.dispose()
      wireMaterial.dispose()
      boundsHelper.geometry.dispose()
      ;(boundsHelper.material as THREE.Material).dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div ref={containerRef} className="floating-prism" aria-hidden="true" />
}

export default FloatingPrism
