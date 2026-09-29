import { useEffect, useRef, type RefObject } from 'react'
import * as CANNON from 'cannon-es'
import * as THREE from 'three'
import { BOOK_SIZE, createBook, type BookSize } from '../Book/Book.ts'
import { MAP_SIZE, createMap, type MapSize } from '../Map/Map.ts'
import { createTitlePlane } from './titlePlane.ts'

type Size = [number, number, number]

const PX_PER_UNIT = 100
const PRISM_COUNT = 5
const SIDE_RANGE: [number, number] = [0.8, 2.8]
const SPAWN_RADIUS = 0.5
const WALL_SEGMENTS = 20

const DRIFT_FORCE = 0.4
const PULL_IMPULSE = 0.08
const SCATTER_IMPULSE = 4
const SCROLL_TURN = 0.0015
const TURN_EASE = 0.08

const FOCUS_DURATION = 1.8
const GLIDE_SHARE = 0.55
const FOCUS_FIT = { width: 0.8, height: 0.7 }
const CLICK_SLOP = 6
const CLICK_MS = 400

const FILL_COLOR = 0xffffff
const WIREFRAME_COLOR = 0xff00ff
const BOUNDS_COLOR = 0x0000ff
const OPENABLE_BOUNDS_COLOR = 0x00ff00
const SHOW_BOUNDS = true

type Prism = {
  body: CANNON.Body
  object: THREE.Object3D
  size: Size
  bounds: THREE.Box3
  phase: number
}

type OpenableItem = {
  object: THREE.Object3D
  openSize: [number, number]
  setOpen: (amount: number) => void
  update?: (dt: number) => void
}

type Openable = {
  item: OpenableItem
  prism: Prism
  click?: (point: THREE.Vector3) => void
}

type PrismFieldProps = {
  titleRef?: RefObject<HTMLElement | null>
}

const randomIn = ([min, max]: [number, number]) => min + Math.random() * (max - min)
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const easeInOut = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2)

function PrismField({ titleRef }: PrismFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
    camera.position.z = 50
    const rig = new THREE.Object3D()
    rig.add(camera)
    scene.add(rig)

    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, 0) })
    world.defaultContactMaterial.friction = 0
    world.defaultContactMaterial.contactEquationStiffness = 1e6
    const solver = world.solver as CANNON.GSSolver
    solver.iterations = 5

    const view = { width: 1, height: 1 }
    let walls: CANNON.Body[] = []

    const buildWalls = () => {
      for (const wall of walls) world.removeBody(wall)
      walls = []
      const radius = view.height / 2
      const addWall = (position: CANNON.Vec3, inward: CANNON.Vec3) => {
        const wall = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane(), position })
        wall.quaternion.setFromVectors(new CANNON.Vec3(0, 0, 1), inward)
        world.addBody(wall)
        walls.push(wall)
      }
      for (let i = 0; i < WALL_SEGMENTS; i++) {
        const angle = (i / WALL_SEGMENTS) * Math.PI * 2
        const out = new CANNON.Vec3(0, Math.cos(angle), Math.sin(angle))
        addWall(out.scale(radius), out.scale(-1))
      }
      addWall(new CANNON.Vec3(-view.width / 2, 0, 0), new CANNON.Vec3(1, 0, 0))
      addWall(new CANNON.Vec3(view.width / 2, 0, 0), new CANNON.Vec3(-1, 0, 0))
    }

    const title = createTitlePlane(PX_PER_UNIT)
    scene.add(title.mesh)

    const fillMaterial = new THREE.MeshBasicMaterial({
      color: FILL_COLOR,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
    const wireMaterial = new THREE.LineBasicMaterial({ color: WIREFRAME_COLOR })
    const disposables: { dispose: () => void }[] = [fillMaterial, wireMaterial]
    const prisms: Prism[] = []

    const boxObject = (size: Size) => {
      const geometry = new THREE.BoxGeometry(...size)
      const wireGeometry = new THREE.WireframeGeometry(geometry)
      disposables.push(geometry, wireGeometry)
      const mesh = new THREE.Mesh(geometry, fillMaterial)
      mesh.add(new THREE.LineSegments(wireGeometry, wireMaterial))
      return mesh
    }

    const addPrism = (size: Size, boundsColor: number, object: THREE.Object3D = boxObject(size)) => {
      scene.add(object)

      const direction = new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * SPAWN_RADIUS)
      const body = new CANNON.Body({
        mass: 1,
        shape: new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)),
        position: new CANNON.Vec3(direction.x, direction.y, direction.z),
        linearDamping: 0.2,
        angularDamping: 0.5,
      })
      body.quaternion.setFromEuler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
      world.addBody(body)

      const bounds = new THREE.Box3()
      if (SHOW_BOUNDS) {
        const helper = new THREE.Box3Helper(bounds, boundsColor)
        scene.add(helper)
        disposables.push(helper.geometry, helper.material as THREE.Material)
      }
      const prism = { body, object, size, bounds, phase: Math.random() * 100 }
      prisms.push(prism)
      return prism
    }

    const resize = () => {
      const { clientWidth: width, clientHeight: height } = container
      renderer.setSize(width, height)
      view.width = width / PX_PER_UNIT
      view.height = height / PX_PER_UNIT
      camera.left = -view.width / 2
      camera.right = view.width / 2
      camera.top = view.height / 2
      camera.bottom = -view.height / 2
      camera.updateProjectionMatrix()
      buildWalls()
      if (titleRef?.current) title.draw(titleRef.current, renderer.getPixelRatio())
      for (const { body } of prisms) {
        const limitX = view.width / 2
        body.position.x = Math.max(-limitX, Math.min(limitX, body.position.x))
        const r = Math.hypot(body.position.y, body.position.z)
        if (r > view.height / 2) body.position.scale(view.height / 2 / r, body.position)
      }
    }
    resize()

    const scale = Math.max(0.5, Math.min(1, Math.min(view.width, view.height) / 8))
    const randomSize = (): Size => [randomIn(SIDE_RANGE), randomIn(SIDE_RANGE), randomIn(SIDE_RANGE)].map((s) => s * scale) as Size
    const book = createBook(BOOK_SIZE.map((s) => s * scale) as BookSize)
    const map = createMap(MAP_SIZE.map((s) => s * scale) as MapSize)
    disposables.push(book, map)
    const openables: Openable[] = [
      {
        item: book,
        prism: addPrism(book.size, OPENABLE_BOUNDS_COLOR, book.object),
        click: (point) => (point.x > 0 ? book.nextPage() : book.previousPage()),
      },
      { item: map, prism: addPrism(map.size, OPENABLE_BOUNDS_COLOR, map.object) },
    ]
    for (let i = 1; i < PRISM_COUNT; i++) addPrism(randomSize(), BOUNDS_COLOR)

    const focus = {
      state: 'free' as 'free' | 'opening' | 'open' | 'closing',
      target: null as Openable | null,
      progress: 0,
      from: { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() },
    }

    const openFocus = (target: Openable) => {
      focus.from.position.copy(target.prism.object.position)
      focus.from.quaternion.copy(target.prism.object.quaternion)
      world.removeBody(target.prism.body)
      focus.target = target
      focus.state = 'opening'
    }
    const isFocused = () => focus.state === 'open' || focus.state === 'opening'
    const closeFocus = () => {
      focus.state = 'closing'
    }
    const releaseFocus = (target: Openable) => {
      const { body } = target.prism
      const { position, quaternion } = focus.from
      body.position.set(position.x, position.y, position.z)
      body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w)
      body.velocity.setZero()
      body.angularVelocity.setZero()
      body.force.setZero()
      body.torque.setZero()
      world.addBody(body)
      focus.target = null
      focus.state = 'free'
    }

    const glideTarget = new THREE.Vector3()
    const poseFocused = ({ item, prism }: Openable) => {
      const glide = easeInOut(clamp01(focus.progress / GLIDE_SHARE))
      const open = easeInOut(clamp01((focus.progress - GLIDE_SHARE) / (1 - GLIDE_SHARE)))
      const [width, height] = item.openSize
      const fit = Math.min((FOCUS_FIT.width * view.width) / width, (FOCUS_FIT.height * view.height) / height)
      rig.updateMatrixWorld()
      rig.localToWorld(glideTarget.set(0, 0, view.height / 2 + 3))

      const { object } = prism
      object.position.lerpVectors(focus.from.position, glideTarget, glide)
      object.quaternion.slerpQuaternions(focus.from.quaternion, rig.quaternion, glide)
      object.scale.setScalar(1 + (fit - 1) * glide)
      item.setOpen(open)
      if (SHOW_BOUNDS) prism.bounds.setFromObject(object)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(container)

    const pointer = new THREE.Vector2()
    const raycaster = new THREE.Raycaster()
    let pulling = false
    let press: { x: number; y: number; time: number; target: Openable | null } | null = null
    const turn = { current: 0, target: 0 }

    const openableAtPointer = () => {
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(
        openables.map(({ prism }) => prism.object),
        true,
      )
      const hit = hits.find((h) => h.object instanceof THREE.Mesh)
      if (!hit) return null
      const openable = openables.find(({ prism }) => {
        for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) if (o === prism.object) return true
        return false
      })
      return openable ? { openable, point: hit.point } : null
    }
    const onPointerMove = (e: PointerEvent) => {
      pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1)
      const clickable = isFocused() || (focus.state === 'free' && openableAtPointer() != null)
      document.documentElement.style.cursor = clickable ? 'pointer' : ''
    }
    const onPointerDown = (e: PointerEvent) => {
      onPointerMove(e)
      const target = focus.state === 'free' ? (openableAtPointer()?.openable ?? null) : null
      press = { x: e.clientX, y: e.clientY, time: e.timeStamp, target }
      pulling = focus.state === 'free' && !target
    }
    const onPointerUp = (e: PointerEvent) => {
      const isClick =
        press != null &&
        Math.hypot(e.clientX - press.x, e.clientY - press.y) < CLICK_SLOP &&
        e.timeStamp - press.time < CLICK_MS
      const target = focus.target
      if (isClick && focus.state === 'free' && press?.target) openFocus(press.target)
      else if (isClick && focus.state === 'open' && target) {
        const hit = openableAtPointer()
        if (hit?.openable === target && target.click) target.click(target.prism.object.worldToLocal(hit.point))
        else closeFocus()
      } else if (isClick && focus.state === 'opening') closeFocus()
      else if (pulling) {
        const kick = () => (Math.random() * 2 - 1) * SCATTER_IMPULSE
        for (const { body } of prisms) body.applyLocalImpulse(new CANNON.Vec3(kick(), kick(), kick()))
      }
      pulling = false
      press = null
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFocused()) closeFocus()
    }
    const onWheel = (e: WheelEvent) => {
      turn.target += e.deltaY * SCROLL_TURN
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('wheel', onWheel, { passive: true })

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let last: number | null = null
    renderer.setAnimationLoop((time) => {
      const dt = last == null ? 0 : Math.min((time - last) / 1000, 0.05)
      last = time
      const t = time / 1000

      turn.current += (turn.target - turn.current) * TURN_EASE
      rig.rotation.x = turn.current
      title.mesh.rotation.x = turn.current

      const up = new CANNON.Vec3(0, Math.cos(turn.current), Math.sin(turn.current))
      for (const prism of prisms) {
        if (prism === focus.target?.prism) continue
        const { body, phase } = prism
        if (!reducedMotion) {
          const drift = new CANNON.Vec3(Math.sin((t + phase) / 10), 0, Math.cos((t + phase) / 10)).scale(DRIFT_FORCE)
          const at = new CANNON.Vec3(Math.cos(t / 15 + phase), Math.sin(t / 10 + phase), Math.cos(t / 20 + phase))
          body.applyLocalForce(drift, at.scale(0.1))
        }
        if (pulling) {
          const pull = up.scale(pointer.y).vadd(new CANNON.Vec3(pointer.x, 0, 0)).scale(PULL_IMPULSE)
          body.applyImpulse(pull)
        }
      }

      if (dt > 0) world.step(1 / 60, dt, 3)
      for (const prism of prisms) {
        if (prism === focus.target?.prism) continue
        const { body, object, bounds } = prism
        object.position.set(body.position.x, body.position.y, body.position.z)
        object.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
        if (SHOW_BOUNDS) bounds.setFromObject(object)
      }

      if (focus.target) {
        const step = reducedMotion ? 1 : dt / FOCUS_DURATION
        if (focus.state === 'opening') {
          focus.progress = Math.min(1, focus.progress + step)
          if (focus.progress === 1) focus.state = 'open'
        } else if (focus.state === 'closing') {
          focus.progress = Math.max(0, focus.progress - step)
        }
        poseFocused(focus.target)
        if (focus.state === 'closing' && focus.progress === 0) releaseFocus(focus.target)
      }
      for (const { item } of openables) item.update?.(reducedMotion ? Infinity : dt)
      renderer.render(scene, camera)
    })

    return () => {
      renderer.setAnimationLoop(null)
      observer.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('wheel', onWheel)
      document.documentElement.style.cursor = ''
      for (const item of disposables) item.dispose()
      title.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [titleRef])

  return <div ref={containerRef} className="prism-field" aria-hidden="true" />
}

export default PrismField
