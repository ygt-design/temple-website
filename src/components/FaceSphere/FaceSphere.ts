import * as THREE from 'three'
import faceUrl from '../../assets/images/lol.png'
import { createSpin } from '../../lib/spin.ts'

export const FACE_SPHERE_RADIUS = 0.9
const SEGMENTS = 48
const SPIN_SPEED = 0.6

export function createFaceSphere(radius: number) {
  const texture = new THREE.TextureLoader().load(faceUrl)
  texture.colorSpace = THREE.SRGBColorSpace
  const geometry = new THREE.SphereGeometry(radius, SEGMENTS, SEGMENTS / 2)
  geometry.rotateY(-Math.PI / 2)
  const material = new THREE.MeshBasicMaterial({ map: texture })
  const mesh = new THREE.Mesh(geometry, material)
  const object = new THREE.Group()
  object.add(mesh)

  const spin = createSpin(mesh, SPIN_SPEED)
  const openSize: [number, number] = [2 * radius, 2 * radius]

  const dispose = () => {
    geometry.dispose()
    material.dispose()
    texture.dispose()
  }

  return { object, radius, openSize, ...spin, dispose }
}
