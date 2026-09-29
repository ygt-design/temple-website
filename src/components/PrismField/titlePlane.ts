import * as THREE from 'three'

export function createTitlePlane(pxPerUnit: number) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const geometry = new THREE.PlaneGeometry(1, 1)
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  const mesh = new THREE.Mesh(geometry, material)

  const paint = (element: HTMLElement, pixelRatio: number, font: string, style: CSSStyleDeclaration) => {
    if (!ctx) return
    const fontSize = parseFloat(style.fontSize)
    const lineHeight = style.lineHeight === 'normal' ? fontSize * 1.2 : parseFloat(style.lineHeight)
    const lines = element.children.length
      ? [...element.children].map((child) => child.textContent ?? '')
      : [element.textContent ?? '']
    ctx.font = font
    const pad = fontSize * 0.25
    const width = Math.ceil(Math.max(...lines.map((line) => ctx.measureText(line).width)) + pad * 2)
    const height = Math.ceil(lines.length * lineHeight + pad * 2)

    canvas.width = width * pixelRatio
    canvas.height = height * pixelRatio
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.font = font
    ctx.fillStyle = style.color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    lines.forEach((line, i) => ctx.fillText(line, width / 2, pad + (i + 0.5) * lineHeight))

    texture.dispose()
    texture.needsUpdate = true
    mesh.scale.set(width / pxPerUnit, height / pxPerUnit, 1)
  }

  const draw = (element: HTMLElement, pixelRatio: number) => {
    const style = getComputedStyle(element)
    const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    document.fonts.load(font).finally(() => paint(element, pixelRatio, font, style))
  }

  const dispose = () => {
    geometry.dispose()
    material.dispose()
    texture.dispose()
  }

  return { mesh, draw, dispose }
}
