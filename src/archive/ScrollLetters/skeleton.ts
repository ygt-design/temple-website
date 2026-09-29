import type { Point } from './scrollGrowth.ts'

export type SkeletonPoint = Point & { d: number }

export function zhangSuenThin(grid: Uint8Array, w: number, h: number) {
  const idx = (x: number, y: number) => y * w + x
  const toDelete: number[] = []
  const pass = (variant: number) => {
    toDelete.length = 0
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (!grid[idx(x, y)]) continue
        const p2 = grid[idx(x, y - 1)]
        const p3 = grid[idx(x + 1, y - 1)]
        const p4 = grid[idx(x + 1, y)]
        const p5 = grid[idx(x + 1, y + 1)]
        const p6 = grid[idx(x, y + 1)]
        const p7 = grid[idx(x - 1, y + 1)]
        const p8 = grid[idx(x - 1, y)]
        const p9 = grid[idx(x - 1, y - 1)]
        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
        if (b < 2 || b > 6) continue
        const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
        let a = 0
        for (let k = 0; k < 8; k++) if (seq[k] === 0 && seq[k + 1] === 1) a++
        if (a !== 1) continue
        if (variant === 0) {
          if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue
        } else if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue
        toDelete.push(idx(x, y))
      }
    }
    for (const i of toDelete) grid[i] = 0
    return toDelete.length > 0
  }
  let changed = true
  while (changed) changed = pass(0) || pass(1)
}

export function tracePolylines(skel: Uint8Array, gw: number, gh: number, dist: Float32Array) {
  const idx = (x: number, y: number) => y * gw + x
  const neighbors = (x: number, y: number) => {
    const out: [number, number][] = []
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && skel[idx(nx, ny)]) out.push([nx, ny])
      }
    }
    return out
  }

  const pixels: [number, number][] = []
  const deg = new Map<number, number>()
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (!skel[idx(x, y)]) continue
      pixels.push([x, y])
      deg.set(idx(x, y), neighbors(x, y).length)
    }
  }

  const usedEdge = new Set<string>()
  const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`)
  const chains: SkeletonPoint[][] = []
  const withD = (x: number, y: number) => ({ x, y, d: dist[idx(x, y)] })

  const walk = (sx: number, sy: number, nx: number, ny: number) => {
    const pts = [withD(sx, sy)]
    let px = sx
    let py = sy
    let cx = nx
    let cy = ny
    while (true) {
      usedEdge.add(edgeKey(idx(px, py), idx(cx, cy)))
      pts.push(withD(cx, cy))
      if (deg.get(idx(cx, cy)) !== 2) break
      let advanced = false
      for (const [ax, ay] of neighbors(cx, cy)) {
        if (ax === px && ay === py) continue
        if (usedEdge.has(edgeKey(idx(cx, cy), idx(ax, ay)))) continue
        px = cx
        py = cy
        cx = ax
        cy = ay
        advanced = true
        break
      }
      if (!advanced) break
    }
    return pts
  }

  for (const [x, y] of pixels) {
    if (deg.get(idx(x, y)) === 2) continue
    for (const [nx, ny] of neighbors(x, y)) {
      if (usedEdge.has(edgeKey(idx(x, y), idx(nx, ny)))) continue
      chains.push(walk(x, y, nx, ny))
    }
  }
  for (const [x, y] of pixels) {
    for (const [nx, ny] of neighbors(x, y)) {
      if (usedEdge.has(edgeKey(idx(x, y), idx(nx, ny)))) continue
      chains.push(walk(x, y, nx, ny))
    }
  }

  const result: SkeletonPoint[][] = []
  for (const c of chains) {
    if (c.length < 2) continue
    if (c[0].d > c[c.length - 1].d) c.reverse()
    result.push(c)
  }
  return result
}

const SPLINE_SAMPLES = 8
export function catmullRomPath(P: Point[]) {
  let d = `M ${P[0].x.toFixed(2)} ${P[0].y.toFixed(2)}`
  if (P.length < 2) return { d, len: 0 }
  let len = 0
  let prev = P[0]
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i]
    const p1 = P[i]
    const p2 = P[i + 1]
    const p3 = P[i + 2] || P[i + 1]
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
    for (let s = 1; s <= SPLINE_SAMPLES; s++) {
      const t = s / SPLINE_SAMPLES
      const mt = 1 - t
      const bx = mt * mt * mt * p1.x + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * p2.x
      const by = mt * mt * mt * p1.y + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * p2.y
      len += Math.hypot(bx - prev.x, by - prev.y)
      prev = { x: bx, y: by }
    }
  }
  return { d, len }
}
