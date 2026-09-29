import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { parse, type Font } from 'opentype.js'
import fontUrl from './fonts/CirrusCumulus.woff?url'
import { buildLetterField, letterSprouts } from './letterField.ts'
import { growScrolls, makeRng, packCircles, type Circle, type Point } from './scrollGrowth.ts'
import { catmullRomPath } from './skeleton.ts'
import config from './scroll.json'
import SliderGroup from './SliderGroup.tsx'
import { lerp, resolveSliders, sliderDefaults } from './sliderValues.ts'
import './ScrollLetters.css'

const { canvas, letters, sliders, growthSliders, hover: hoverConfig } = config
const W = canvas.width
const H = canvas.height
const FIELD = { width: W, height: H, margin: letters.margin, pocketDepth: letters.pocketDepth }
const BODY_STEP = 3
const BLUE = '#2b3bd6'
const RED = '#e0473f'
const GREEN = '#2e9d57'

type Grown = ReturnType<typeof growScrolls>
type Reveal = { start: number; delay: number }
type Revealed = { grown: Grown | null; active: Map<number, Reveal>; leaving: Map<number, number> }
const NOTHING_REVEALED: Revealed = { grown: null, active: new Map(), leaving: new Map() }

type PathProps = { d: string; len: number; width: number }

const dash = (len: number, width: number) => ({ array: `${len} ${len + 2 * width}`, hidden: len + width })

function DrawnPath({ d, len, width, delay }: PathProps & { delay: number }) {
  const { array, hidden } = dash(len, width)
  return (
    <path
      className="scroll-letters__path"
      d={d}
      fill="none"
      stroke="#000000"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        strokeDasharray: array,
        strokeDashoffset: hidden,
        animationDuration: `${len / config.drawSpeed}s`,
        animationDelay: `${delay}s`,
      }}
    />
  )
}

function RevealPath({ d, len, width, shown, delay }: PathProps & { shown: boolean; delay: number }) {
  const { array, hidden } = dash(len, width)
  return (
    <path
      d={d}
      fill="none"
      stroke="#000000"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        strokeDasharray: array,
        strokeDashoffset: shown ? 0 : hidden,
        transition: `stroke-dashoffset ${len / config.drawSpeed}s linear ${delay}s`,
      }}
    />
  )
}

function ScrollLetters() {
  const [font, setFont] = useState<Font | null>(null)
  const [text, setText] = useState(letters.text)
  const [seed, setSeed] = useState(1)
  const [letterValues, setLetterValues] = useState(() => sliderDefaults(letters.sliders))
  const [values, setValues] = useState(() => sliderDefaults(sliders))
  const [growValues, setGrowValues] = useState(() => sliderDefaults(growthSliders))
  const [debug, setDebug] = useState(false)
  const [newShapes, setNewShapes] = useState(config.newShapes.default)
  const [hover, setHover] = useState(hoverConfig.default)
  const [hoverValues, setHoverValues] = useState(() => sliderDefaults(hoverConfig.sliders))
  const [revealed, setRevealed] = useState<Revealed>(NOTHING_REVEALED)
  const svgRef = useRef<SVGSVGElement>(null)
  const pending = useRef<Point | null>(null)
  const frame = useRef(0)

  useEffect(() => {
    let cancelled = false
    fetch(fontUrl)
      .then((response) => response.arrayBuffer())
      .then((buffer) => {
        if (!cancelled) setFont(parse(buffer))
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const p = resolveSliders(sliders, values)
  const { radius } = resolveSliders(hoverConfig.sliders, hoverValues)
  const sizeValue = letterValues.size
  const field = useMemo(
    () =>
      font && text.trim()
        ? buildLetterField(font, text, { ...FIELD, size: lerp(letters.sliders.size.range, sizeValue) })
        : null,
    [font, text, sizeValue],
  )

  const body = useMemo(
    () =>
      field
        ? field.chains.map((c) => catmullRomPath(c.filter((_, i) => i % BODY_STEP === 0 || i === c.length - 1)))
        : [],
    [field],
  )

  const packing = useMemo(() => {
    if (!field) return null
    const l = resolveSliders(letters.sliders, letterValues)
    const p = resolveSliders(sliders, values)
    const minRadius = Math.max(p.minRadius, p.thickness * config.growth.minCurlScale)
    const rng = makeRng(seed)
    const sprouts = letterSprouts(field, rng, {
      spacing: l.sprouts,
      minR: Math.max(minRadius, letters.minSproutRadius),
      maxR: p.maxRadius,
      gap: p.gap,
      margin: canvas.margin,
    })
    const circles = packCircles(rng, {
      count: Math.round(p.count),
      minRadius,
      maxRadius: p.maxRadius,
      gap: p.gap,
      initial: sprouts,
      tries: letters.tries,
      accept: (x, y, r) => {
        const d = field.distAt(x, y)
        return d >= r + p.gap && d <= r + l.spread && field.isOutside(x, y)
      },
    })
    return { sprouts, circles, rngState: rng.state() }
  }, [field, seed, letterValues, values])

  const grown = useMemo(() => {
    if (!field || !packing) return null
    const p = resolveSliders(sliders, values)
    const g = resolveSliders(growthSliders, growValues)
    return growScrolls(packing.circles, makeRng(packing.rngState), {
      ...g,
      depth: Math.round(g.depth),
      maxSteps: Math.round(g.maxSteps),
      reach: p.gap + g.reach,
      startSweep: p.startSweep,
      newShapes,
      spiralTurns: p.spiralTurns,
      spiralTightness: p.spiralTightness,
      flow: p.flow,
      thickness: p.thickness,
      pointBlocked: (x, y, clear) => field.distAt(x, y) < clear,
      seeds: packing.sprouts.map((c, id) => ({ id, s: c.s, from: c.from })),
      lineBlocked: (line) => field.lineHits(line.a, line.b, p.thickness + letters.clearance),
    })
  }, [field, packing, values, growValues, newShapes])

  const circles: Circle[] = packing?.circles ?? []
  const sproutCount = packing?.sprouts.length ?? 0
  const current = revealed.grown === grown ? revealed : NOTHING_REVEALED
  const children = useMemo(() => {
    const out: number[][] = grown ? grown.strokes.map(() => []) : []
    grown?.strokes.forEach((s, i) => {
      if (s.parent != null) out[s.parent].push(i)
    })
    return out
  }, [grown])

  const hoverAt = (pt: Point | null) => {
    if (!grown) return
    const now = performance.now() / 1000
    const speed = config.drawSpeed
    setRevealed((prev) => {
      const same = prev.grown === grown
      const was = same ? prev.active : new Map<number, Reveal>()
      const want = new Set<number>()
      if (pt) {
        grown.strokes.forEach((s, i) => {
          const near = s.steps.some((k) => {
            const c = circles[k.id]
            return Math.hypot(c.x - pt.x, c.y - pt.y) < radius + c.r
          })
          if (!near) return
          for (let j: number | null = i; j != null && !want.has(j); j = grown.strokes[j].parent) want.add(j)
        })
      }
      const entering = [...want].filter((i) => !was.has(i))
      const exiting = new Set([...was.keys()].filter((i) => !want.has(i)))
      if (!entering.length && !exiting.size) return prev

      const active = new Map(was)
      const leaving = new Map(same ? prev.leaving : [])
      for (const i of exiting) active.delete(i)

      const forkAt = (child: number, parent: number) => grown.strokes[child].revealAt - grown.strokes[parent].revealAt
      const startOf = (i: number): number => {
        const known = active.get(i)
        if (known) return known.start
        const s = grown.strokes[i]
        const start = s.parent == null ? now : Math.max(now, startOf(s.parent) + forkAt(i, s.parent) / speed)
        active.set(i, { start, delay: start - now })
        leaving.delete(i)
        return start
      }
      entering.forEach(startOf)

      const retractDelay = (i: number): number => {
        let wait = 0
        for (const c of children[i]) {
          if (!exiting.has(c)) continue
          const goneAt = retractDelay(c) + grown.strokes[c].len / speed
          wait = Math.max(wait, goneAt - (grown.strokes[i].len - forkAt(c, i)) / speed)
        }
        return wait
      }
      for (const i of exiting) leaving.set(i, retractDelay(i))
      return { grown, active, leaving }
    })
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!hover || !svgRef.current) return
    const overHud = e.target instanceof Element && e.target.closest('.scroll-letters__hud')
    const rect = svgRef.current.getBoundingClientRect()
    pending.current = overHud
      ? null
      : { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H }
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      hoverAt(pending.current)
    })
  }

  const onPointerLeave = () => {
    if (!hover) return
    cancelAnimationFrame(frame.current)
    frame.current = 0
    pending.current = null
    hoverAt(null)
  }

  const animKey = JSON.stringify([text, seed, newShapes, letterValues, values, growValues])
  const bodyEnd = Math.max(0, ...body.map((b) => b.len)) / config.drawSpeed
  const ds = Math.min(1, (window.innerWidth * 0.96) / W, (window.innerHeight * 0.9) / H)
  const circleColor = (c: Circle) => (c.id < sproutCount ? GREEN : grown?.used.has(c.id) ? BLUE : RED)

  return (
    <div className="scroll-letters" onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={W * ds} height={H * ds}>
        {body.map((b, i) => (
          <DrawnPath key={`${animKey}-body-${i}`} d={b.d} len={b.len} width={p.thickness} delay={0} />
        ))}
        {grown?.strokes.map((s, i) =>
          hover ? (
            <RevealPath
              key={`${animKey}-${i}`}
              d={s.d}
              len={s.len}
              width={p.thickness}
              shown={current.active.has(i)}
              delay={current.active.get(i)?.delay ?? current.leaving.get(i) ?? 0}
            />
          ) : (
            <DrawnPath
              key={`${animKey}-${i}`}
              d={s.d}
              len={s.len}
              width={p.thickness}
              delay={bodyEnd + s.revealAt / config.drawSpeed}
            />
          ),
        )}
        {debug && (
          <g className="scroll-letters__debug">
            {circles.map((c) => (
              <circle
                key={c.id}
                cx={c.x}
                cy={c.y}
                r={c.r}
                fill="none"
                stroke={circleColor(c)}
                strokeWidth={c.id < sproutCount ? 1 : 0.6}
                opacity={grown?.used.has(c.id) ? 1 : 0.6}
              />
            ))}
          </g>
        )}
      </svg>

      <div className="scroll-letters__hud">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="type a word" />
        <SliderGroup group={letters.sliders} values={letterValues} setValues={setLetterValues} />
        <SliderGroup group={sliders} values={values} setValues={setValues} />
        <SliderGroup group={growthSliders} values={growValues} setValues={setGrowValues} />
        <label className="scroll-letters__toggle">
          <span>{hoverConfig.label}</span>
          <input
            type="checkbox"
            checked={hover}
            onChange={(e) => {
              setHover(e.target.checked)
              setRevealed(NOTHING_REVEALED)
            }}
          />
        </label>
        {hover && <SliderGroup group={hoverConfig.sliders} values={hoverValues} setValues={setHoverValues} />}
        <label className="scroll-letters__toggle">
          <span>{config.newShapes.label}</span>
          <input type="checkbox" checked={newShapes} onChange={(e) => setNewShapes(e.target.checked)} />
        </label>
        <label className="scroll-letters__toggle">
          <span>debug</span>
          <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} />
        </label>
        <div className="scroll-letters__buttons">
          <button type="button" onClick={() => setSeed((s) => s + 1)}>
            regrow
          </button>
        </div>
        <p className="scroll-letters__hint">
          {!font ? (
            'loading font…'
          ) : grown ? (
            <>
              {sproutCount} sprouts · {grown.strokes.length} strokes
              <br />
              {circles.length - grown.used.size} empty circles
              {hover && (
                <>
                  <br />
                  {current.active.size} / {grown.strokes.length} grown · hover to grow
                </>
              )}
            </>
          ) : null}
        </p>
      </div>
    </div>
  )
}

export default ScrollLetters
