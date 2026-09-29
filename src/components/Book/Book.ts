import * as THREE from 'three'
import { createCover } from './cover.ts'
import { createPageBlock } from './pageBlock.ts'
import { createPages, pageSize } from './pages.ts'

export type BookSize = [width: number, height: number, thickness: number]

const HEIGHT = 2.4
export const BOOK_SIZE: BookSize = [HEIGHT * (9 / 11), HEIGHT, 0.6]

const PAGE_COUNT = 6
const BOARD_THICKNESS = 0.04
const SPINE_GAP = 0.002

const COVER_COLOR = 0xbfd8ff
const WIREFRAME_COLOR = 0xff00ff
const COVER_LIFT = 0.001

export function createBook(size: BookSize) {
  const [width, height, thickness] = size
  const [pageWidth, pageHeight] = pageSize(width, height)
  const blockDepth = thickness / 2 - BOARD_THICKNESS
  const object = new THREE.Group()
  const spread = new THREE.Group()
  object.add(spread)

  const coverMaterial = new THREE.MeshBasicMaterial({
    color: COVER_COLOR,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  const wireMaterial = new THREE.LineBasicMaterial({ color: WIREFRAME_COLOR })
  const boardGeometry = new THREE.BoxGeometry(width, height, BOARD_THICKNESS)
  const boardWireGeometry = new THREE.WireframeGeometry(boardGeometry)
  const spineDepth = thickness / 2 - SPINE_GAP
  const spineGeometry = new THREE.BoxGeometry(BOARD_THICKNESS, height, spineDepth)
  const spineWireGeometry = new THREE.WireframeGeometry(spineGeometry)
  const blocks: { dispose: () => void }[] = []

  const half = (side: 1 | -1) => {
    const group = new THREE.Group()
    const board = new THREE.Mesh(boardGeometry, coverMaterial)
    board.add(new THREE.LineSegments(boardWireGeometry, wireMaterial))
    board.position.z = side * (thickness / 2 - BOARD_THICKNESS / 2)
    const block = createPageBlock(pageWidth, pageHeight, blockDepth, wireMaterial)
    block.mesh.position.set(-width / 2 + pageWidth / 2, 0, (side * blockDepth) / 2)
    const spineStrip = new THREE.Mesh(spineGeometry, coverMaterial)
    spineStrip.add(new THREE.LineSegments(spineWireGeometry, wireMaterial))
    spineStrip.position.set(-width / 2 - BOARD_THICKNESS / 2, 0, side * (SPINE_GAP + spineDepth / 2))
    group.add(board, block.mesh, spineStrip)
    blocks.push(block)
    return group
  }

  spread.add(half(-1))
  const spine = new THREE.Group()
  spine.position.x = -width / 2
  spread.add(spine)
  const front = half(1)
  front.position.x = width / 2
  spine.add(front)
  const cover = createCover(width, height)
  cover.mesh.position.z = thickness / 2 + COVER_LIFT
  front.add(cover.mesh)
  const pages = createPages(width, height, PAGE_COUNT, wireMaterial)
  spread.add(pages.object)

  let openAmount = 0
  const setOpen = (amount: number) => {
    openAmount = amount
    spine.rotation.y = -Math.PI * amount
    spread.position.x = (width / 2) * amount
  }
  const update = (dt: number) => pages.update(dt, openAmount)

  const dispose = () => {
    boardGeometry.dispose()
    boardWireGeometry.dispose()
    spineGeometry.dispose()
    spineWireGeometry.dispose()
    coverMaterial.dispose()
    wireMaterial.dispose()
    for (const block of blocks) block.dispose()
    cover.dispose()
    pages.dispose()
  }

  const openSize: [number, number] = [2 * width, height]
  return { object, size, openSize, setOpen, update, nextPage: pages.next, previousPage: pages.previous, dispose }
}
