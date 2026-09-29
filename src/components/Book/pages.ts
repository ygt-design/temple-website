import * as THREE from 'three'
import { createLabel } from '../../lib/label.ts'

const PAGE_COLOR = '#ffffff'
const NUMBER_COLOR = '#0000ff'
const FONT_SIZE = 0.12
const INSET = 0.04
const TURN_DURATION = 0.7
const LEAF_GAP = 0.002

type Leaf = {
  hinge: THREE.Group
  progress: number
  target: number
  rightZ: number
  leftZ: number
}

const easeInOut = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2)

export const pageSize = (bookWidth: number, bookHeight: number): [number, number] => [
  bookWidth * (1 - INSET),
  bookHeight - 2 * INSET * bookWidth,
]

export function createPages(bookWidth: number, bookHeight: number, pageCount: number, outline: THREE.LineBasicMaterial) {
  const object = new THREE.Group()
  const [width, height] = pageSize(bookWidth, bookHeight)
  const leafCount = Math.ceil(pageCount / 2)
  const outlineSource = new THREE.PlaneGeometry(width, height)
  const outlineGeometry = new THREE.EdgesGeometry(outlineSource)
  const labels: { dispose: () => void }[] = []
  const leaves: Leaf[] = []

  for (let i = 0; i < leafCount; i++) {
    const hinge = new THREE.Group()
    hinge.position.x = -bookWidth / 2
    object.add(hinge)
    for (const side of [0, 1]) {
      const pageNumber = 2 * i + 1 + side
      const text = pageNumber <= pageCount ? String(pageNumber) : ''
      const label = createLabel(width, height, text, { color: NUMBER_COLOR, fontSize: FONT_SIZE, background: PAGE_COLOR })
      label.mesh.name = `page-${pageNumber}`
      label.mesh.position.x = width / 2
      if (side === 1) label.mesh.rotation.y = Math.PI
      label.mesh.add(new THREE.LineSegments(outlineGeometry, outline))
      hinge.add(label.mesh)
      labels.push(label)
    }
    leaves.push({ hinge, progress: 0, target: 0, rightZ: LEAF_GAP * (leafCount - i), leftZ: LEAF_GAP * (i + 1) })
  }

  let turned = 0
  const next = () => {
    if (turned < leaves.length) leaves[turned++].target = 1
  }
  const previous = () => {
    if (turned > 0) leaves[--turned].target = 0
  }

  const update = (dt: number, bookOpen: number) => {
    const step = dt / TURN_DURATION
    for (const leaf of leaves) {
      leaf.progress =
        leaf.target > leaf.progress ? Math.min(leaf.target, leaf.progress + step) : Math.max(leaf.target, leaf.progress - step)
      const turn = Math.min(easeInOut(leaf.progress), bookOpen)
      leaf.hinge.rotation.y = -Math.PI * turn
      leaf.hinge.position.z = leaf.rightZ + (leaf.leftZ - leaf.rightZ) * turn
    }
  }

  const dispose = () => {
    outlineSource.dispose()
    outlineGeometry.dispose()
    for (const label of labels) label.dispose()
  }

  return { object, next, previous, update, dispose }
}
