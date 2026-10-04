import * as THREE from 'three'
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js'
import unicornUrl from '../../assets/models/unicorn.ply?url'
import { createSpin } from '../../lib/spin.ts'

export const UNICORN_SIZE = 2.6
const POINT_STRIDE = 4
const POINT_SIZE = 1.5
const LIGHTNESS_RANGE: [number, number] = [0.4, 0.85]
const SHADOW_LIGHTNESS = 0.08
const SPIN_SPEED = 0.6

function flattenLighting(colors: THREE.BufferAttribute) {
  const color = new THREE.Color()
  const hsl = { h: 0, s: 0, l: 0 }
  const [low, high] = LIGHTNESS_RANGE
  for (let i = 0; i < colors.count; i++) {
    color.setRGB(colors.getX(i), colors.getY(i), colors.getZ(i), THREE.SRGBColorSpace).getHSL(hsl, THREE.SRGBColorSpace)
    const saturation = hsl.l < SHADOW_LIGHTNESS ? 0 : hsl.s
    color.setHSL(hsl.h, saturation, low + (high - low) * hsl.l, THREE.SRGBColorSpace)
    colors.setXYZ(i, color.r, color.g, color.b)
  }
}

function keepEvery(source: THREE.BufferGeometry, stride: number) {
  const geometry = new THREE.BufferGeometry()
  for (const name of ['position', 'color']) {
    const attribute = source.getAttribute(name)
    if (!attribute) continue
    const kept = new Float32Array(Math.ceil(attribute.count / stride) * attribute.itemSize)
    for (let i = 0, k = 0; i < attribute.count; i += stride, k++) {
      for (let c = 0; c < attribute.itemSize; c++) kept[k * attribute.itemSize + c] = attribute.getComponent(i, c)
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(kept, attribute.itemSize))
  }
  return geometry
}

export async function loadUnicorn(longestSide: number) {
  const source = await new PLYLoader().loadAsync(unicornUrl)
  const geometry = keepEvery(source, POINT_STRIDE)
  source.dispose()
  const colors = geometry.getAttribute('color')
  if (colors instanceof THREE.BufferAttribute) flattenLighting(colors)

  geometry.rotateX(Math.PI)
  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox ?? new THREE.Box3()
  const center = bounds.getCenter(new THREE.Vector3())
  geometry.translate(-center.x, -center.y, -center.z)
  const extent = bounds.getSize(new THREE.Vector3())
  const fit = longestSide / Math.max(extent.x, extent.y, extent.z)
  geometry.scale(fit, fit, fit)
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  const material = new THREE.PointsMaterial({
    size: POINT_SIZE,
    sizeAttenuation: false,
    vertexColors: geometry.hasAttribute('color'),
  })
  const points = new THREE.Points(geometry, material)
  const object = new THREE.Group()
  object.add(points)

  const size = extent.multiplyScalar(fit).toArray() as [number, number, number]
  const openSize: [number, number] = [Math.hypot(size[0], size[2]), size[1]]

  const spin = createSpin(points, SPIN_SPEED)
  const update = (dt: number) => {
    material.size = POINT_SIZE * Math.sqrt(object.scale.x)
    spin.update(dt)
  }

  const dispose = () => {
    geometry.dispose()
    material.dispose()
  }

  return { object, size, openSize, setOpen: spin.setOpen, update, release: spin.release, dispose }
}
