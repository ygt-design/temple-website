import config from './scroll.json'

export type Point = { x: number; y: number }
export type Circle = Point & { id: number; r: number }
export type Step = { id: number; s: number }
export type Seed = Step & { from: number }
export type Line = { a: Point; b: Point }
export type Rng = () => number

type Traveler = Circle & { s: number }
type Arc = {
  id: number
  s: number
  x: number
  y: number
  from: number
  sweep: number
  startIdx: number
  startLen: number
}
type Shape = {
  leadSweep: number
  startAngle?: number
  spiralTurns: number
  spiralTightness: number
}
type Geometry = { d: string; pts: Point[]; len: number; start: Point; lines: Line[]; arcs: Arc[] }
export type Stroke = Geometry & {
  depth: number
  revealAt: number
  parent: number | null
  steps: Step[]
  shape: Shape
}

const { canvas } = config
const TAU = Math.PI * 2
const mod = (x: number, m: number) => ((x % m) + m) % m
const angleOf = (c: Point, p: Point) => Math.atan2(p.y - c.y, p.x - c.x)
const DEG = Math.PI / 180
const MAX_STEP_ANGLE = 3 * DEG

export function makeRng(seed: number): Rng & { state: () => number } {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return Object.assign(next, { state: () => a })
}

type PackOptions = {
  count: number
  minRadius: number
  maxRadius: number
  gap: number
  initial?: (Point & { r: number })[]
  accept?: (x: number, y: number, r: number) => boolean
  tries: number
}

export function packCircles(rng: Rng, { count, minRadius, maxRadius, gap, initial = [], accept, tries }: PackOptions) {
  const { width, height, margin } = canvas
  const lo = Math.min(minRadius, maxRadius)
  const hi = Math.max(minRadius, maxRadius)
  const radii = Array.from({ length: count }, () => lo + (hi - lo) * rng() ** 3).sort((a, b) => b - a)
  const circles: Circle[] = initial.map((c, id) => ({ id, x: c.x, y: c.y, r: c.r }))
  for (const r of radii) {
    const spanX = width - 2 * r - 2 * margin
    const spanY = height - 2 * r - 2 * margin
    if (spanX < 0 || spanY < 0) continue
    for (let t = 0; t < tries; t++) {
      const x = r + margin + rng() * spanX
      const y = r + margin + rng() * spanY
      let free = !accept || accept(x, y, r)
      for (const c of free ? circles : []) {
        const min = c.r + r + gap
        if ((c.x - x) ** 2 + (c.y - y) ** 2 < min * min) {
          free = false
          break
        }
      }
      if (free) {
        circles.push({ id: circles.length, x, y, r })
        break
      }
    }
  }
  return circles
}

const gapBetween = (a: Circle, b: Circle) => Math.hypot(b.x - a.x, b.y - a.y) - a.r - b.r

function tangentLine(A: Traveler, B: Traveler): Line | null {
  const dx = B.x - A.x
  const dy = B.y - A.y
  const D = Math.hypot(dx, dy)
  const delta = B.s * B.r - A.s * A.r
  if (Math.abs(delta) >= D) return null
  const a = Math.atan2(dy, dx) + Math.acos(delta / D)
  const nx = Math.cos(a)
  const ny = Math.sin(a)
  return {
    a: { x: A.x - A.s * A.r * nx, y: A.y - A.s * A.r * ny },
    b: { x: B.x - B.s * B.r * nx, y: B.y - B.s * B.r * ny },
  }
}

function segmentHitsCircle(p: Point, q: Point, c: Point & { r: number }) {
  const vx = q.x - p.x
  const vy = q.y - p.y
  const t = Math.max(0, Math.min(1, ((c.x - p.x) * vx + (c.y - p.y) * vy) / (vx * vx + vy * vy)))
  return Math.hypot(p.x + vx * t - c.x, p.y + vy * t - c.y) < c.r
}

function pushArc(pts: Point[], c: Circle, from: number, sweep: number, s: number) {
  const steps = Math.max(1, Math.ceil((sweep * c.r) / config.sampleStep), Math.ceil(sweep / MAX_STEP_ANGLE))
  for (let k = 0; k <= steps; k++) {
    const th = from + (s * sweep * k) / steps
    pts.push({ x: c.x + c.r * Math.cos(th), y: c.y + c.r * Math.sin(th) })
  }
}

function pushSpiral(pts: Point[], c: Circle, from: number, s: number, turns: number, tightness: number) {
  const total = turns * TAU
  const rhoAt = (phi: number) => c.r * (1 - (1 - tightness) * (phi / total) ** config.spiralEase)
  for (let phi = 0; ; ) {
    const rho = rhoAt(phi)
    const th = from + s * phi
    pts.push({ x: c.x + rho * Math.cos(th), y: c.y + rho * Math.sin(th) })
    if (phi >= total) break
    phi = Math.min(total, phi + Math.min(MAX_STEP_ANGLE, config.sampleStep / rho))
  }
}

function strokeGeometry(
  circles: Circle[],
  steps: Step[],
  { leadSweep, startAngle, spiralTurns, spiralTightness, flow = 0 }: Shape & { flow?: number },
): Geometry | null {
  if (steps.length < 2) return null
  const A = config.growth
  const cs: Traveler[] = steps.map((k) => ({ ...circles[k.id], s: k.s }))
  const n = cs.length
  const lines: Line[] = []
  for (let i = 0; i < n - 1; i++) {
    const line = tangentLine(cs[i], cs[i + 1])
    if (!line) return null
    lines.push(line)
  }

  const enter: number[] = []
  const leave: number[] = []
  leave[0] = angleOf(cs[0], lines[0].a)
  enter[0] = startAngle ?? leave[0] - cs[0].s * leadSweep
  for (let i = 1; i < n; i++) {
    enter[i] = angleOf(cs[i], lines[i - 1].b)
    if (i < n - 1) leave[i] = angleOf(cs[i], lines[i].a)
  }
  const sweepOf = (i: number) => mod(cs[i].s * (leave[i] - enter[i]), TAU)

  const bIn = new Array<number>(n).fill(0)
  const bOut = new Array<number>(n).fill(0)
  for (let j = 0; j < n - 1; j++) {
    const len = Math.hypot(lines[j].b.x - lines[j].a.x, lines[j].b.y - lines[j].a.y)
    const want = flow * (len + A.blendRadius * Math.min(cs[j].r, cs[j + 1].r))
    bOut[j] = want / cs[j].r
    bIn[j + 1] = want / cs[j + 1].r
  }
  for (let i = 0; i < n - 1; i++) {
    const room = sweepOf(i) > 0 ? A.blendShare * sweepOf(i) : A.branchMarginDeg * DEG * 0.9
    const total = bIn[i] + bOut[i]
    if (total > room) {
      bIn[i] *= room / total
      bOut[i] *= room / total
    }
  }
  bIn[n - 1] = Math.min(bIn[n - 1], A.spiralBlendMax)

  const pts: Point[] = []
  const arcs: Arc[] = []
  const on = (c: Circle, a: number) => ({ x: c.x + c.r * Math.cos(a), y: c.y + c.r * Math.sin(a) })
  const heading = (c: Traveler, a: number) => ({ x: -c.s * Math.sin(a), y: c.s * Math.cos(a) })
  for (let i = 0; i < n - 1; i++) {
    const c = cs[i]
    const from = enter[i] + c.s * bIn[i]
    const sweep = sweepOf(i) - bIn[i] - bOut[i]
    if (sweep > 0) {
      arcs.push({ id: c.id, s: c.s, x: c.x, y: c.y, from, sweep, startIdx: pts.length, startLen: 0 })
      pushArc(pts, c, from, sweep, c.s)
    } else {
      pts.push(on(c, leave[i] - c.s * bOut[i]))
    }

    const a1 = leave[i] - c.s * bOut[i]
    const a2 = enter[i + 1] + cs[i + 1].s * bIn[i + 1]
    const P1 = on(c, a1)
    const P2 = on(cs[i + 1], a2)
    const T1 = heading(c, a1)
    const T2 = heading(cs[i + 1], a2)
    const span = Math.hypot(P2.x - P1.x, P2.y - P1.y)
    const h = span * A.blendHandle
    const c1 = { x: P1.x + T1.x * h, y: P1.y + T1.y * h }
    const c2 = { x: P2.x - T2.x * h, y: P2.y - T2.y * h }
    const count = Math.max(2, Math.ceil(span / config.sampleStep))
    for (let k = 1; k < count; k++) {
      const t = k / count
      const m = 1 - t
      pts.push({
        x: m * m * m * P1.x + 3 * m * m * t * c1.x + 3 * m * t * t * c2.x + t * t * t * P2.x,
        y: m * m * m * P1.y + 3 * m * m * t * c1.y + 3 * m * t * t * c2.y + t * t * t * P2.y,
      })
    }
  }
  const last = cs[n - 1]
  pushSpiral(pts, last, enter[n - 1] + last.s * bIn[n - 1], last.s, spiralTurns, spiralTightness)

  const cum = [0]
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  }
  for (const a of arcs) a.startLen = cum[a.startIdx]
  return { d, pts, len: cum[cum.length - 1], start: pts[0], lines, arcs }
}

function segmentsCross(p1: Point, p2: Point, q1: Point, q2: Point) {
  const side = (a: Point, b: Point, c: Point) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
  return side(p1, p2, q1) !== side(p1, p2, q2) && side(q1, q2, p1) !== side(q1, q2, p2)
}

export type GrowOptions = {
  depth: number
  branching: number
  mirror: number
  reverse: number
  maxSteps: number
  reach: number
  tolerance: number
  startSweep: number
  spiralTurns: number
  spiralTightness: number
  flow: number
  thickness: number
  newShapes: boolean
  seeds: Seed[]
  pointBlocked?: (x: number, y: number, clear: number) => boolean
  lineBlocked?: (line: Line) => boolean
}

type Move = { B: Traveler; line: Line; score: number }

export function growScrolls(circles: Circle[], rng: Rng, o: GrowOptions) {
  const A = config.growth
  if (!circles.length) return { strokes: [] as Stroke[], used: new Set<number>() }
  const radii = circles.map((c) => c.r)
  const lo = Math.min(...radii)
  const hi = Math.max(...radii)
  const terminalR = lo + (hi - lo) * A.terminalRadius
  const minSweep = A.minSweepDeg * DEG
  const maxSweep = A.maxSweepDeg * DEG
  const idealSweep = A.idealSweepDeg * DEG
  const margin = A.branchMarginDeg * DEG
  const within = (reach: number) => circles.map((a) => circles.filter((b) => b !== a && gapBetween(a, b) <= reach))
  const neighbors = within(o.reach)
  const wideNeighbors = within(o.reach * A.fillReachScale)
  const used = new Set<number>()
  const segs: Line[] = []
  const strokes: Stroke[] = []

  const pad = o.thickness
  const lineOk = (line: Line, a: Circle, b: Circle) =>
    Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y) <= A.maxLineRatio * Math.sqrt(a.r * b.r) &&
    !circles.some((c) => c.id !== a.id && c.id !== b.id && segmentHitsCircle(line.a, line.b, { ...c, r: c.r + pad })) &&
    !segs.some((sg) => segmentsCross(line.a, line.b, sg.a, sg.b)) &&
    !o.lineBlocked?.(line)

  const moves = (C: Traveler, pool: Circle[][], accept: (line: Line) => number | null) => {
    const out: Move[] = []
    for (const N of pool[C.id]) {
      if (used.has(N.id)) continue
      for (const sN of [1, -1]) {
        const B = { ...N, s: sN }
        const line = tangentLine(C, B)
        if (!line) continue
        const fit = accept(line)
        if (fit == null) continue
        const straight = Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y) / (A.maxLineRatio * Math.sqrt(C.r * N.r))
        const awkward = fit + A.lineWeight * straight + A.growWeight * Math.max(0, Math.log(N.r / C.r))
        if (awkward > o.tolerance || !lineOk(line, C, B)) continue
        const score = rng() + (sN !== C.s ? o.reverse : 1 - o.reverse) + (N.r < C.r ? A.shrinkBias : 0) - awkward
        out.push({ B, line, score })
      }
    }
    return out.sort((a, b) => b.score - a.score)
  }

  const take = (steps: Step[], m: Move) => {
    segs.push(m.line)
    used.add(m.B.id)
    steps.push({ id: m.B.id, s: m.B.s })
    return angleOf(m.B, m.line.b)
  }

  const walk = (steps: Step[], thetaIn: number | null, maxSteps: number, pool: Circle[][]) => {
    while (steps.length < maxSteps) {
      const cur = steps[steps.length - 1]
      const C = { ...circles[cur.id], s: cur.s }
      if (steps.length >= 2 && C.r <= terminalR) break
      const [best] = moves(C, pool, (line) => {
        if (thetaIn == null) return 0
        const sweep = mod(C.s * (angleOf(C, line.a) - thetaIn), TAU)
        if (sweep < minSweep || sweep > maxSweep) return null
        return Math.abs(sweep - idealSweep) / Math.PI
      })
      if (!best) break
      thetaIn = take(steps, best)
    }
    return steps
  }

  const addStroke = (
    steps: Step[],
    depth: number,
    leadSweep: number,
    revealAt: number,
    parent: number | null,
    startAngle?: number,
  ) => {
    const shape: Shape = {
      leadSweep,
      startAngle,
      spiralTurns: o.spiralTurns * (1 - A.spiralJitter / 2 + rng() * A.spiralJitter),
      spiralTightness: o.spiralTightness,
    }
    const geom = strokeGeometry(circles, steps, { ...shape, flow: o.flow })
    if (geom) strokes.push({ ...geom, depth, revealAt, parent, steps, shape })
  }

  const growStem = (start: Circle, maxSteps: number, pool: Circle[][]) => {
    used.add(start.id)
    const steps = walk([{ id: start.id, s: rng() < 0.5 ? 1 : -1 }], null, maxSteps, pool)
    if (steps.length < 2) {
      used.delete(start.id)
      return false
    }
    addStroke(steps, 0, o.startSweep * DEG, 0, null)
    return true
  }

  const forkArc = (parentIdx: number, arc: Arc, pool: Circle[][], chance: number, maxSteps: number) => {
    if (arc.sweep < 2 * margin) return 0
    const parent = strokes[parentIdx]
    const P = circles[arc.id]
    const along = (line: Line) => mod(arc.s * (angleOf(P, line.a) - arc.from), TAU)
    let added = 0
    const chances = Math.max(1, Math.round(arc.sweep / (A.branchEveryDeg * DEG)))
    for (let k = 0; k < chances; k++) {
      if (rng() > chance) continue
      const dirs = rng() < o.mirror ? [arc.s, -arc.s] : [arc.s]
      for (const s of dirs) {
        const [best] = moves({ ...P, s }, pool, (line) => {
          const t = along(line)
          return t < margin || t > arc.sweep - margin ? null : 0
        })
        if (!best) continue
        const steps = [{ id: P.id, s }]
        const thetaIn = take(steps, best)
        walk(steps, thetaIn, maxSteps, pool)
        addStroke(steps, parent.depth + 1, 0, parent.revealAt + arc.startLen + along(best.line) * P.r, parentIdx)
        added++
      }
    }
    return added
  }

  const childSteps = (depth: number) => Math.max(2, Math.round(o.maxSteps * A.childStepFalloff ** (depth + 1)))

  for (const seed of o.seeds) {
    used.add(seed.id)
    const steps = walk([{ id: seed.id, s: seed.s }], seed.from, o.maxSteps, neighbors)
    if (steps.length < 2) used.delete(seed.id)
    else addStroke(steps, 0, 0, 0, null, seed.from)
  }

  const branchFrom = (start: number) => {
    for (let i = start; i < strokes.length; i++) {
      const parent = strokes[i]
      if (parent.depth >= o.depth) continue
      for (const arc of parent.arcs) forkArc(i, arc, neighbors, o.branching, childSteps(parent.depth))
    }
  }

  const fill = () => {
    for (let progress = true; progress && used.size < circles.length; ) {
      progress = false
      for (let i = 0; i < strokes.length; i++) {
        for (const arc of strokes[i].arcs) {
          if (forkArc(i, arc, wideNeighbors, 1, A.fillSteps)) progress = true
        }
      }
    }
  }

  branchFrom(0)
  fill()

  while (o.newShapes && used.size < circles.length) {
    let kept = false
    for (const c of circles.filter((c) => !used.has(c.id)).slice(0, A.stemPool)) {
      const before = { strokes: strokes.length, segs: segs.length, used: [...used] }
      if (!growStem(c, A.shapeSteps, neighbors)) continue
      branchFrom(before.strokes)
      fill()
      if (used.size - before.used.length >= A.minCluster && strokes.length - before.strokes >= A.minShapeStrokes) {
        kept = true
        break
      }
      strokes.length = before.strokes
      segs.length = before.segs
      used.clear()
      for (const id of before.used) used.add(id)
    }
    if (!kept) break
  }

  return { strokes: settleFlow(circles, strokes, o), used }
}

function settleFlow(circles: Circle[], strokes: Stroke[], o: GrowOptions) {
  const A = config.growth
  if (!o.flow) return strokes
  const clear = o.thickness + A.strokeClearance
  const near = Math.max(A.forkIgnore, 4 * o.thickness)
  type Stamp = Point & { id: number }
  const grid = new Map<string, Stamp[]>()
  const key = (x: number, y: number) => `${Math.floor(x / clear)},${Math.floor(y / clear)}`
  const place = (id: number, pts: Point[]) => {
    const start = pts[0]
    for (const p of pts) {
      if (Math.hypot(p.x - start.x, p.y - start.y) < near) continue
      const k = key(p.x, p.y)
      const bucket = grid.get(k)
      if (bucket) bucket.push({ x: p.x, y: p.y, id })
      else grid.set(k, [{ x: p.x, y: p.y, id }])
    }
  }
  const remove = (id: number, pts: Point[]) => {
    for (const p of pts) {
      const k = key(p.x, p.y)
      const bucket = grid.get(k)
      if (bucket) grid.set(k, bucket.filter((q) => q.id !== id))
    }
  }
  const hits = (id: number, x: number, y: number) => {
    const gx = Math.floor(x / clear)
    const gy = Math.floor(y / clear)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bucket = grid.get(`${gx + dx},${gy + dy}`)
        if (bucket?.some((q) => q.id !== id && (q.x - x) ** 2 + (q.y - y) ** 2 < clear * clear)) return true
      }
    }
    return false
  }
  const collides = (id: number, pts: Point[]) => {
    const start = pts[0]
    return pts.some(
      (p) => Math.hypot(p.x - start.x, p.y - start.y) > near && (hits(id, p.x, p.y) || o.pointBlocked?.(p.x, p.y, clear)),
    )
  }

  const settled: Stroke[] = strokes.map((stroke) => ({
    ...stroke,
    ...strokeGeometry(circles, stroke.steps, { ...stroke.shape, flow: 0 }),
  }))
  settled.forEach((s, id) => place(id, s.pts))
  strokes.forEach((stroke, id) => {
    for (const f of [o.flow, o.flow / 2]) {
      const geom = f === o.flow ? stroke : strokeGeometry(circles, stroke.steps, { ...stroke.shape, flow: f })
      if (!geom || collides(id, geom.pts)) continue
      remove(id, settled[id].pts)
      settled[id] = { ...stroke, ...geom }
      place(id, geom.pts)
      break
    }
  })
  return settled
}
