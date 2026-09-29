import * as THREE from 'three'
import { createLabelTexture } from '../../lib/label.ts'

export type MapSize = [width: number, height: number]
export const MAP_SIZE: MapSize = [3.2, 2.2]

const CORE_RADIUS = 0.08
const LAYER_GAP = 0.012
const SEGMENTS = 200

const TEXT = 'wtf?'
const FRONT_COLOR = '#ffffff'
const PAPER_COLOR = '#ffffff'
const FILTER_COLOR = '#e8893a'
const FILTER_RING_COLOR = '#c9a24a'
const FILTER_SHARE = 0.28
const FILTER_RING_SHARE = 0.012
const TEXT_COLOR = '#0000ff'
const FONT_SIZE = 0.1
const WIREFRAME_COLOR = 0xff00ff

const SPIRAL = LAYER_GAP / (2 * Math.PI)
const rollRadius = (length: number) => Math.sqrt(CORE_RADIUS ** 2 + 2 * SPIRAL * length)

function createBackTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const filterTop = canvas.height * (1 - FILTER_SHARE)
    const ring = canvas.height * FILTER_RING_SHARE
    ctx.fillStyle = PAPER_COLOR
    ctx.fillRect(0, 0, canvas.width, filterTop)
    ctx.fillStyle = FILTER_COLOR
    ctx.fillRect(0, filterTop, canvas.width, canvas.height - filterTop)
    ctx.fillStyle = FILTER_RING_COLOR
    ctx.fillRect(0, filterTop - ring / 2, canvas.width, ring)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function createMap([width, height]: MapSize) {
  const object = new THREE.Group()
  const rolledRadius = rollRadius(width)

  const geometry = new THREE.PlaneGeometry(width, height, SEGMENTS, 1)
  const positions = geometry.attributes.position as THREE.BufferAttribute
  const along = Array.from({ length: positions.count }, (_, i) => positions.getX(i) + width / 2)
  const top = Array.from({ length: positions.count }, (_, i) => positions.getY(i) > 0)

  const texture = createLabelTexture(width, height, TEXT, { color: TEXT_COLOR, fontSize: FONT_SIZE, background: FRONT_COLOR })
  const offset = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }
  const frontMaterial = new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide, ...offset })
  const backTexture = createBackTexture()
  const backMaterial = new THREE.MeshBasicMaterial({ map: backTexture, side: THREE.BackSide, ...offset })
  object.add(new THREE.Mesh(geometry, frontMaterial), new THREE.Mesh(geometry, backMaterial))

  const columns = SEGMENTS + 1
  const outlinePositions = new Float32Array((2 * SEGMENTS + 2) * 2 * 3)
  const outlineGeometry = new THREE.BufferGeometry()
  outlineGeometry.setAttribute('position', new THREE.BufferAttribute(outlinePositions, 3))
  const outlineMaterial = new THREE.LineBasicMaterial({ color: WIREFRAME_COLOR })
  object.add(new THREE.LineSegments(outlineGeometry, outlineMaterial))

  const updateOutline = () => {
    let o = 0
    const copy = (i: number) => {
      outlinePositions[o++] = positions.getX(i)
      outlinePositions[o++] = positions.getY(i)
      outlinePositions[o++] = positions.getZ(i)
    }
    for (const row of [0, columns]) {
      for (let c = 0; c < SEGMENTS; c++) {
        copy(row + c)
        copy(row + c + 1)
      }
    }
    for (const c of [0, SEGMENTS]) {
      copy(c)
      copy(columns + c)
    }
    outlineGeometry.attributes.position.needsUpdate = true
    outlineGeometry.computeBoundingSphere()
    outlineGeometry.computeBoundingBox()
  }

  const setOpen = (amount: number) => {
    const flat = width * amount
    const outer = rollRadius(width - flat)
    const shiftX = (width / 2) * amount
    const shiftZ = rolledRadius * (1 - amount)
    for (let i = 0; i < positions.count; i++) {
      const s = along[i]
      let x = s
      let z = 0
      if (s > flat) {
        const radius = Math.sqrt(Math.max(CORE_RADIUS ** 2, outer ** 2 - 2 * SPIRAL * (s - flat)))
        const angle = (outer - radius) / SPIRAL
        x = flat + radius * Math.sin(angle)
        z = outer - radius * Math.cos(angle)
      }
      positions.setXYZ(i, x - shiftX, top[i] ? height / 2 : -height / 2, z - shiftZ)
    }
    positions.needsUpdate = true
    geometry.computeBoundingSphere()
    geometry.computeBoundingBox()
    updateOutline()
  }
  setOpen(0)

  const dispose = () => {
    geometry.dispose()
    texture.dispose()
    backTexture.dispose()
    frontMaterial.dispose()
    backMaterial.dispose()
    outlineGeometry.dispose()
    outlineMaterial.dispose()
  }

  const size: [number, number, number] = [2 * rolledRadius, height, 2 * rolledRadius]
  return { object, size, openSize: [width, height] as [number, number], setOpen, dispose }
}
