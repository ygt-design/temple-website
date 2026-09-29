declare module 'opentype.js' {
  export interface BoundingBox {
    x1: number
    y1: number
    x2: number
    y2: number
  }

  export interface Path {
    getBoundingBox(): BoundingBox
    draw(ctx: CanvasRenderingContext2D): void
  }

  export interface Font {
    getPath(text: string, x: number, y: number, fontSize: number): Path
  }

  export function parse(buffer: ArrayBuffer): Font
}
