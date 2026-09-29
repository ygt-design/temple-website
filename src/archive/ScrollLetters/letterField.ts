import type { Font } from 'opentype.js'
import type { Point, Rng } from './scrollGrowth.ts'
import { tracePolylines, zhangSuenThin, type SkeletonPoint } from './skeleton.ts'

const DIAG = Math.SQRT2

export type LetterField = {
  width: number
  height: number
  chains: SkeletonPoint[][]
  distAt: (x: number, y: number) => number
  degree: (x: number, y: number) => number
  isOutside: (x: number, y: number) => boolean
  lineHits: (a: Point, b: Point, clear: number) => boolean
}

export type Sprout = Point & { r: number; s: number; from: number }

function chamfer(skel: Uint8Array, w: number, h: number) {
  const d = new Float32Array(w * h).fill(Infinity)
  for (let i = 0; i < w * h; i++) if (skel[i]) d[i] = 0
  const relax = (i: number, j: number, cost: number) => {
    if (d[j] + cost < d[i]) d[i] = d[j] + cost
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (x > 0) relax(i, i - 1, 1)
      if (y > 0) {
        relax(i, i - w, 1)
        if (x > 0) relax(i, i - w - 1, DIAG)
        if (x < w - 1) relax(i, i - w + 1, DIAG)
      }
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      if (x < w - 1) relax(i, i + 1, 1)
      if (y < h - 1) {
        relax(i, i + w, 1)
        if (x < w - 1) relax(i, i + w + 1, DIAG)
        if (x > 0) relax(i, i + w - 1, DIAG)
      }
    }
  }
  return d
}

function outsideMask(dist: Float32Array, w: number, h: number) {
  const out = new Uint8Array(w * h)
  const open = (i: number) => dist[i] > 1.5 && !out[i]
  const queue: number[] = []
  for (let x = 0; x < w; x++) queue.push(x, (h - 1) * w + x)
  for (let y = 0; y < h; y++) queue.push(y * w, y * w + w - 1)
  const seeds = queue.filter(open)
  for (const i of seeds) out[i] = 1
  for (let q = 0; q < seeds.length; q++) {
    const i = seeds[q]
    const x = i % w
    const next = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]
    for (const j of next) {
      if (j < 0 || j >= w * h || !open(j)) continue
      out[j] = 1
      seeds.push(j)
    }
  }
  return out
}

function pocketMask(skel: Uint8Array, w: number, h: number, depth: number) {
  const hits = new Uint8Array(w * h)
  const scan = (count: number, length: number, at: (line: number, k: number) => number) => {
    for (let line = 0; line < count; line++) {
      for (const dir of [1, -1]) {
        let last = -Infinity
        for (let k = dir > 0 ? 0 : length - 1; k >= 0 && k < length; k += dir) {
          const i = at(line, k)
          if (skel[i]) last = k
          else if (Math.abs(k - last) <= depth) hits[i]++
        }
      }
    }
  }
  scan(h, w, (y, x) => y * w + x)
  scan(w, h, (x, y) => y * w + x)
  const pocket = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) pocket[i] = hits[i] >= 3 ? 1 : 0
  return pocket
}

type FieldOptions = {
  width: number
  height: number
  size: number
  margin: number
  pocketDepth: number
}

export function buildLetterField(
  font: Font,
  text: string,
  { width, height, size, margin, pocketDepth }: FieldOptions,
): LetterField | null {
  const probe = font.getPath(text, 0, 0, size).getBoundingBox()
  if (!Number.isFinite(probe.x1) || probe.x2 <= probe.x1 || probe.y2 <= probe.y1) return null
  const fit = Math.min(
    1,
    (width - 2 * margin) / (probe.x2 - probe.x1),
    (height - 2 * margin) / (probe.y2 - probe.y1),
  )
  const fontSize = size * fit
  const box = font.getPath(text, 0, 0, fontSize).getBoundingBox()
  const ox = (width - (box.x2 - box.x1)) / 2 - box.x1
  const oy = (height - (box.y2 - box.y1)) / 2 - box.y1

  const raster = document.createElement('canvas')
  raster.width = width
  raster.height = height
  const ctx = raster.getContext('2d')
  if (!ctx) return null
  font.getPath(text, ox, oy, fontSize).draw(ctx)
  const alpha = ctx.getImageData(0, 0, width, height).data
  const skel = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) skel[i] = alpha[i * 4 + 3] > 127 ? 1 : 0
  zhangSuenThin(skel, width, height)

  const chains = tracePolylines(skel, width, height, new Float32Array(width * height))
  const dist = chamfer(skel, width, height)
  const outside = outsideMask(dist, width, height)
  const pocket = pocketMask(skel, width, height, fontSize * pocketDepth)
  const index = (x: number, y: number) => {
    const ix = Math.round(x)
    const iy = Math.round(y)
    return ix < 0 || iy < 0 || ix >= width || iy >= height ? -1 : iy * width + ix
  }
  const distAt = (x: number, y: number) => {
    const i = index(x, y)
    return i < 0 ? Infinity : dist[i]
  }
  const degree = (x: number, y: number) => {
    let n = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && skel[index(x + dx, y + dy)]) n++
    }
    return n
  }
  return {
    width,
    height,
    chains,
    distAt,
    degree,
    isOutside: (x, y) => {
      const i = index(x, y)
      return outside[i] === 1 && pocket[i] === 0
    },
    lineHits: (a, b, clear) => {
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2))
      for (let k = 0; k <= steps; k++) {
        if (distAt(a.x + ((b.x - a.x) * k) / steps, a.y + ((b.y - a.y) * k) / steps) < clear) return true
      }
      return false
    },
  }
}

const unit = (a: Point, b: Point) => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l = Math.hypot(dx, dy) || 1
  return { x: dx / l, y: dy / l }
}
const TANGENT_SPAN = 6
const SPROUT_SIZES = 5

type SproutOptions = {
  spacing: number
  minR: number
  maxR: number
  gap: number
  margin: number
}

export function letterSprouts(field: LetterField, rng: Rng, { spacing, minR, maxR, gap, margin }: SproutOptions) {
  const out: Sprout[] = []
  const tryAt = (P: Point, u: Point, sides: number[]) => {
    const n = { x: -u.y, y: u.x }
    for (const s of sides) {
      const fits: Sprout[] = []
      for (let k = 0; k < SPROUT_SIZES; k++) {
        const r = maxR - ((maxR - minR) * k) / (SPROUT_SIZES - 1)
        const x = P.x + s * r * n.x
        const y = P.y + s * r * n.y
        if (x < r + margin || y < r + margin || x > field.width - r - margin || y > field.height - r - margin) continue
        if (!field.isOutside(x, y) || field.distAt(x, y) < r - 1.5) continue
        if (out.some((c) => Math.hypot(c.x - x, c.y - y) < c.r + r + gap)) continue
        fits.push({ x, y, r, s, from: Math.atan2(P.y - y, P.x - x) })
      }
      if (fits.length) {
        out.push(fits[Math.floor(rng() * fits.length)])
        return true
      }
    }
    return false
  }

  const K = TANGENT_SPAN
  for (const c of field.chains) {
    if (c.length < 2 * K + 1) continue
    for (const end of [c, [...c].reverse()]) {
      const P = end[end.length - 1]
      if (field.degree(P.x, P.y) !== 1) continue
      const before = unit(end[end.length - 1 - 2 * K], end[end.length - 1 - K])
      const u = unit(end[end.length - 1 - K], P)
      const turn = before.x * u.y - before.y * u.x
      const s = turn === 0 ? (rng() < 0.5 ? 1 : -1) : Math.sign(turn)
      tryAt(P, u, [s, -s])
    }
    let run = spacing / 2
    for (let i = K; i < c.length - K; i++) {
      run += Math.hypot(c[i].x - c[i - 1].x, c[i].y - c[i - 1].y)
      if (run < spacing) continue
      const along = unit(c[i - K], c[i + K])
      const dir = rng() < 0.5 ? 1 : -1
      const s = rng() < 0.5 ? 1 : -1
      if (tryAt(c[i], { x: along.x * dir, y: along.y * dir }, [s, -s])) run = 0
    }
  }
  return out
}
