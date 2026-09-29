import * as THREE from 'three'

const BLOCK_COLOR = 0xffffff
const EDGE_COLOR = 0xbdbdbd
const LINE_SPACING = 0.012

export function createPageBlock(width: number, height: number, depth: number, outline: THREE.LineBasicMaterial) {
  const geometry = new THREE.BoxGeometry(width, height, depth)
  const fillMaterial = new THREE.MeshBasicMaterial({
    color: BLOCK_COLOR,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  const mesh = new THREE.Mesh(geometry, fillMaterial)
  const outlineGeometry = new THREE.EdgesGeometry(geometry)
  mesh.add(new THREE.LineSegments(outlineGeometry, outline))

  const [left, right, bottom, top] = [-width / 2, width / 2, -height / 2, height / 2]
  const sheets = Math.max(1, Math.round(depth / LINE_SPACING))
  const points: number[] = []
  for (let i = 1; i < sheets; i++) {
    const z = -depth / 2 + (depth * i) / sheets
    points.push(right, bottom, z, right, top, z)
    points.push(left, top, z, right, top, z)
    points.push(left, bottom, z, right, bottom, z)
  }
  const edgeGeometry = new THREE.BufferGeometry()
  edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  const edgeMaterial = new THREE.LineBasicMaterial({ color: EDGE_COLOR })
  mesh.add(new THREE.LineSegments(edgeGeometry, edgeMaterial))

  const dispose = () => {
    geometry.dispose()
    fillMaterial.dispose()
    outlineGeometry.dispose()
    edgeGeometry.dispose()
    edgeMaterial.dispose()
  }

  return { mesh, dispose }
}
