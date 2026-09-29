import * as THREE from 'three'
import fontUrl from '../assets/fonts/ABCArealSuperfamilyVariable.woff2?url'

const FONT_FAMILY = 'ABC Areal'
const TEXTURE_RESOLUTION = 400

export type LabelStyle = {
  color: string
  fontSize: number
  background?: string
}

let fontLoaded: Promise<unknown> | null = null
const loadFont = () =>
  (fontLoaded ??= new FontFace(FONT_FAMILY, `url(${fontUrl})`, { weight: '400 700' })
    .load()
    .then((face) => document.fonts.add(face)))

export function createLabelTexture(width: number, height: number, text: string, { color, fontSize, background }: LabelStyle) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * TEXTURE_RESOLUTION)
  canvas.height = Math.round(height * TEXTURE_RESOLUTION)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace

  const paint = () => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (background) {
      ctx.fillStyle = background
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    ctx.font = `400 ${canvas.width * fontSize}px "${FONT_FAMILY}"`
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2)
    texture.needsUpdate = true
  }
  loadFont().finally(paint)

  return texture
}

export function createLabel(width: number, height: number, text: string, style: LabelStyle) {
  const texture = createLabelTexture(width, height, text, style)
  const geometry = new THREE.PlaneGeometry(width, height)
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: !style.background,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  const mesh = new THREE.Mesh(geometry, material)

  const dispose = () => {
    geometry.dispose()
    material.dispose()
    texture.dispose()
  }

  return { mesh, dispose }
}
