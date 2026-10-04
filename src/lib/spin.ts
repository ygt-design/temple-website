import * as THREE from 'three'

const Y_AXIS = new THREE.Vector3(0, 1, 0)

export function createSpin(target: THREE.Object3D, speed: number) {
  let openAmount = 0

  const setOpen = (amount: number) => {
    openAmount = amount
  }
  const update = (dt: number) => {
    if (openAmount === 0 || !Number.isFinite(dt)) return
    target.rotation.y += speed * openAmount * dt
  }
  const release = () => {
    const spin = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, target.rotation.y)
    target.rotation.y = 0
    return spin
  }

  return { setOpen, update, release }
}
