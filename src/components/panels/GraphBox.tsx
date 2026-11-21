import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { LoadedCase } from '../../data/load.ts'
import type { Assignment, Value } from '../../engine/index.ts'
import { formatValue, getVariable } from '../../engine/index.ts'
import { singleGraphSource } from '../export/export-render.tsx'
import type { ExportSource, ExportTag } from '../export/export-image.ts'
import { ExportMenu } from '../export/ExportMenu.tsx'
import type { Locale, Messages } from '../i18n/messages.ts'
import { useMessages } from '../i18n/messages.ts'
import { useDigits } from '../shared/digits.ts'
import type { PathMarks } from '../model/dsep-view.ts'
import type { DoState, ModelWorld, Reading } from '../model/model-state.ts'
import { solve, withProbability, withValue } from '../model/model-state.ts'
import type { FigureBlock } from '../shared/FigureTabs.tsx'
import { FigureTabs } from '../shared/FigureTabs.tsx'
import { useNarrow } from '../shared/use-narrow.ts'
import { Tag } from '../shared/parts.tsx'
import type { EdgeTip } from '../graph/SignalGraph.tsx'
import { SignalGraph } from '../graph/SignalGraph.tsx'
import type { Rect } from './menu-place.ts'
import { placeMenu, placeTip } from './menu-place.ts'
import { NodeMenu } from './NodeMenu.tsx'
import { Formula, Rich } from '../text/typeset.tsx'
import { originCitations } from '../model/verdict-rows.ts'
import type { Stochastic } from '../model/assignments.ts'
import { assignmentText, changeNotes, probLegend, readingText } from '../model/wording.ts'

export interface GraphBoxProps {
  readonly c: LoadedCase
  readonly world: ModelWorld
  readonly interventions: Assignment
  /** Stochastic interventions, P*(X=1) per boolean node (probability mode only). */
  readonly stochastic?: Stochastic
  /** A click on a node: the new do() state. */
  readonly onDo?: (next: DoState) => void
  /** Observations the probabilities are conditioned on (probability mode only). */
  readonly observed?: Assignment
  /**
   * The new observations, chosen in a node's menu. Given in probability mode, the menu observes
   * as well as intervenes.
   */
  readonly onObserve?: (next: Assignment) => void
  /** Under the actions of a node's menu: the node's own probability sliders, if any. */
  readonly menuExtra?: (id: string) => ReactNode
  /** Nodes drawn with a soft halo (the ones a hovered slider moves). */
  readonly lit?: readonly string[]
  /** A node is hovered or keyboard-focused, or left (undefined). */
  readonly onHover?: (id: string | undefined) => void
  readonly witness?: Assignment
  /** Held variables say 固定（實際 v） beside them instead of the hull's 見證 tag (see SignalGraph). */
  readonly holdNotes?: boolean
  readonly legend?: boolean
  readonly title?: string
  /** Link in the exported image's watermark. */
  readonly exportUrl?: string
  /** Node drag in the editor: grid offset in columns and rows. */
  readonly onMove?: (id: string, dCol: number, dRow: number) => void
  /** Builds the embed code (iframe and citation) for the figure as it stands; the export menu offers it when given. */
  readonly embedCode?: () => string
  /** Drawn inside the graph's frame under the legend (the playground's hint and step buttons); not exported. */
  readonly foot?: ReactNode
  /** The blocks under the graph (verdicts, a table, the equations), behind one row of tab buttons (see `FigureTabs`). */
  readonly blocks?: readonly FigureBlock[]
  /** The block open at first, one of `blocks`' ids; none by default. */
  readonly initialBlock?: string
  /** Called when the reader asks for the prior or actual world back (「回到原本」 or the chip's ×). */
  readonly onReset?: () => void
  /** Notes under nodes that replace the 原本 v notes of a probability graph. */
  readonly notes?: Readonly<Record<string, string>>
  /**
   * How a probability graph reads what is set (see `Reading`). `counterfactual`: the menu's
   * observations are evidence about the actual world and its do() the hypothetical action; a node
   * may be both; evidence nodes read 實際 v instead of a tag.
   */
  readonly reading?: Reading
  /** Controls in the head, before 「回到原本」 (the playground's reading switch). */
  readonly actions?: ReactNode
  /** Default values: deviant nodes say 偏離（預設 v） (graphs with values). */
  readonly defaults?: Assignment
  /** d-separation marks for a pair (the playground's `dsep`). */
  readonly paths?: PathMarks
}

const NONE: Stochastic = {}

const NO_OBSERVATION: Assignment = {}

/** `do` without `id`, hard or stochastic. */
function withoutDo(state: DoState, id: string): DoState {
  const interventions: Record<string, Assignment[string]> = { ...state.interventions }
  const stochastic: Record<string, number> = { ...state.stochastic }
  delete interventions[id]
  delete stochastic[id]
  return { interventions, stochastic }
}

function withoutKey(a: Assignment, id: string): Assignment {
  const next: Record<string, Assignment[string]> = { ...a }
  delete next[id]
  return next
}

/**
 * The graph with its world tags. A click on a node opens its menu beside it: do() at each value or
 * release (with a slider for P*(X=1) on a probability graph), and with `onObserve` observing at each
 * value; an observation that cannot happen under what is set is refused with a note. Marked edges
 * (on a d-separation path, cut by do()) explain themselves on hover, focus or a tap.
 */
export function GraphBox({
  c,
  world,
  interventions,
  stochastic = NONE,
  onDo,
  observed = NO_OBSERVATION,
  onObserve,
  witness,
  holdNotes,
  legend,
  title,
  exportUrl,
  onMove,
  embedCode,
  foot,
  blocks,
  initialBlock,
  onReset,
  notes,
  reading = 'interventional',
  actions,
  defaults,
  paths,
  menuExtra,
  lit,
  onHover,
}: GraphBoxProps) {
  const t = useMessages()
  const digits = useDigits()
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const hasDo = Object.keys(interventions).length > 0 || Object.keys(stochastic).length > 0
  const hasObs = Object.keys(observed).length > 0
  const hasSet = hasDo || hasObs
  const state: DoState = { interventions, stochastic }
  const prob = world.probs !== undefined
  const cf = reading === 'counterfactual' && prob
  const setNow = readingText(t, cf, interventions, stochastic, observed)
  const wrap = useRef<HTMLDivElement>(null)
  const narrow = useNarrow(wrap, 560)
  const observes = prob && onObserve !== undefined
  const editable = onDo !== undefined || onObserve !== undefined
  const [menuAt, setMenu] = useState<string | undefined>(undefined)
  const menu = menuAt !== undefined && world.shown.includes(menuAt) ? menuAt : undefined
  // A menu whose node is no longer drawn is closed, so it does not come back when the node does
  // (state adjusted while rendering, React's pattern for state derived from props).
  if (menuAt !== undefined && menu === undefined) setMenu(undefined)
  const [tip, setTip] = useState<EdgeTip | undefined>(undefined)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({ visibility: 'hidden' })
  const [tipStyle, setTipStyle] = useState<CSSProperties>({ visibility: 'hidden' })
  const focusNode = (id: string): void => wrap.current?.querySelector<SVGGElement>(`[data-node="${id}"]`)?.focus()
  const closeMenu = (): void => {
    if (menu !== undefined) focusNode(menu)
    setMenu(undefined)
  }
  /** `el`'s box relative to the wrapper. */
  const relative = (el: Element | null | undefined): Rect | undefined => {
    const box = wrap.current?.getBoundingClientRect()
    const r = el?.getBoundingClientRect()
    if (box === undefined || r === undefined) return undefined
    return { left: r.left - box.left, top: r.top - box.top, right: r.right - box.left, bottom: r.bottom - box.top }
  }
  // The menu and the tip sit beside what they belong to, measured once drawn (and again on resize).
  useLayoutEffect(() => {
    const place = (): void => {
      const width = wrap.current?.clientWidth ?? 0
      if (menu !== undefined) {
        const at = relative(wrap.current?.querySelector(`[data-node="${menu}"] .ca-focus-ring`))
        setMenuStyle(at === undefined ? {} : (() => {
          const p = placeMenu(at, width)
          return { left: p.left, top: p.top, width: p.width }
        })())
      }
      if (tip !== undefined) {
        const at = relative(wrap.current?.querySelector(`[data-edge="${tip.key}"]`))
        setTipStyle(at === undefined ? {} : (() => {
          const p = placeTip(at, width)
          return { left: p.left, top: p.top, width: p.width }
        })())
      }
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [menu, tip, world, narrow])
  // A press outside the menu closes it (a press on a node is that node's own click); one outside
  // the edges hides a tapped edge's explanation; Esc closes either.
  useEffect(() => {
    if (menu === undefined && tip === undefined) return
    const outside = (e: Event): void => {
      const target = e.target
      if (!(target instanceof Element)) return
      // Only this graph's own nodes and edges count as inside: another graph on the page is outside.
      const own = wrap.current?.contains(target) === true
      if (menu !== undefined && menuRef.current?.contains(target) !== true && !(own && target.closest('[data-node]') !== null)) setMenu(undefined)
      if (tip !== undefined && !(own && target.closest('[data-edge]') !== null)) setTip(undefined)
    }
    const escape = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      setTip(undefined)
      if (menu !== undefined) {
        // Focus goes back to the node only from inside this graph: Esc in another control keeps its focus.
        const active = document.activeElement
        if (active === null || active === document.body || wrap.current?.contains(active) === true) focusNode(menu)
        setMenu(undefined)
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [menu, tip])
  const legendFor = (m: Messages): string => (world.probs !== undefined ? probLegend(m, c.model, world.shown) : m.valueLegend)
  const headTag = (m: Messages): string => (cf && hasDo ? m.cf.kicker : hasDo && hasObs ? m.afterDoObserve : hasObs ? m.afterObserve : m.afterDo)
  const chipText = (m: Messages): string => readingText(m, cf, interventions, stochastic, observed)
  /** Commit do() and observations together, unless the observations cannot happen under that do(). */
  const commit = (next: DoState, nextObserved: Assignment): void => {
    if (Object.keys(nextObserved).length > 0 && prob) {
      // Counterfactual evidence is about the actual world: it must be possible without the do().
      const evidence = (cf ? solve(c, {}, {}, nextObserved) : solve(c, next.interventions, next.stochastic, nextObserved)).evidence ?? 1
      if (!(evidence > 0)) {
        setNotice(t.observeImpossible(assignmentText(nextObserved)))
        return
      }
    }
    setNotice(undefined)
    if (nextObserved !== observed) onObserve?.(nextObserved)
    if (next.interventions !== interventions || next.stochastic !== stochastic) onDo?.(next)
  }
  // A do() on a node first drops its observation: the node keeps the value, now set by intervention.
  // Read as a counterfactual, the observation stays: what happened, and what is supposed instead.
  const doing = (next: DoState, id: string): void => commit(next, !cf && id in observed ? withoutKey(observed, id) : observed)
  const clearAll = (): void => {
    commit({ interventions: {}, stochastic: NONE }, NO_OBSERVATION)
    onReset?.()
  }
  // A probability graph keeps 原本 v under each 0/1 node whose number moved from the prior.
  const prior = useMemo(() => (prob ? solve(c, {}).probs : undefined), [c, prob])
  const twoValued = world.shown.filter((id) => getVariable(c.model, id).domain.kind === 'boolean')
  // Read as a counterfactual: 實際 v under each evidence node, and under each other node whose
  // number moved from the actual world's (the abduced one).
  const abduced = useMemo(() => (cf ? solve(c, {}, {}, observed).probs : undefined), [c, cf, observed])
  const cfNotes = (m: Messages): Record<string, string> => {
    if (abduced === undefined || world.probs === undefined) return {}
    const out: Record<string, string> = { ...changeNotes(m, abduced, world.probs, twoValued, m.actually, digits) }
    for (const [id, v] of Object.entries(observed)) out[id] = m.actually(formatValue(v))
    return out
  }
  const probNotes =
    prior === undefined || world.probs === undefined
      ? undefined
      : { ...(cf ? cfNotes(t) : changeNotes(t, prior, world.probs, twoValued, undefined, digits)), ...notes }
  const graph = (m: Messages, interactive: boolean) => (
    <SignalGraph
      compact={narrow}
      c={c}
      shown={world.shown}
      values={world.values}
      original={world.original}
      probs={world.probs}
      dists={world.dists}
      probNotes={probNotes}
      observed={Object.keys(observed)}
      observedValues={observed}
      evidence={cf}
      interventions={interventions}
      stochastic={stochastic}
      removedEdges={world.removedEdges}
      witness={witness}
      holdNotes={holdNotes}
      defaults={defaults}
      paths={paths}
      onOpen={!interactive || !editable ? undefined : (id) => setMenu(menu === id ? undefined : id)}
      observable={observes}
      open={interactive ? menu : undefined}
      lit={interactive ? lit : undefined}
      onHover={interactive ? onHover : undefined}
      edgeTip={interactive ? tip?.key : undefined}
      onEdgeTip={interactive ? setTip : undefined}
      title={title ?? m.graphTitle(c.data.title[m.locale])}
      onMove={interactive ? onMove : undefined}
    />
  )
  const exportSource = (locale: Locale): ExportSource | undefined =>
    singleGraphSource(c, locale, t, wrap, digits, (m) => graph(m, false), (svg, m) => {
      const tags: ExportTag[] = hasSet
        ? [
            { text: headTag(m), tone: 'slate' },
            { text: chipText(m), tone: 'accent', mono: true },
          ]
        : [{ text: world.probs !== undefined ? m.probability : m.actualWorld, tone: 'fg' }]
      return {
        name: `${c.data.id}-graph`,
        panels: [{ svg, tags, tint: hasSet }],
        legend: legendFor(m),
      }
    })
  /** The menu's observation of `id` at `value` (undefined: no longer observed). */
  const observe = (id: string, value: Value | undefined): void => {
    if (value === undefined) commit(state, withoutKey(observed, id))
    // Observing an intervened node: the value is now observed instead of set.
    else if (!cf && (id in interventions || id in stochastic)) commit(withoutDo(state, id), { ...observed, [id]: value })
    else commit(state, { ...observed, [id]: value })
  }
  /** The menu's do() of `id` at `value` (undefined: released). */
  const intervene = (id: string, value: Value | undefined): void => {
    if (prob && getVariable(c.model, id).domain.kind === 'boolean') doing(withProbability(state, id, value === undefined ? undefined : value === true || value === 1 ? 1 : 0), id)
    else doing({ stochastic, interventions: withValue(interventions, id, value) }, id)
  }
  return (
    <div className={`ca-box ca-graph-box${hasSet ? ' is-cf' : ''}`} data-world={cf && hasDo ? 'counterfactual' : hasDo ? 'do' : hasObs ? 'observed' : 'actual'}>
      <div className="ca-box-head">
        <div className="ca-tags">
          {hasSet ? (
            <>
              <Tag tone="slate">{headTag(t)}</Tag>
              <span className="ca-do-chip ca-mono" data-text={setNow}>
                {cf ? <Rich text={setNow} ids={c.model.byId} /> : <Formula text={setNow} />}
                {editable && (
                  <button type="button" className="ca-do-clear" aria-label={hasObs ? t.clearSettings(setNow) : t.removeDo(setNow)} onClick={clearAll}>
                    ×
                  </button>
                )}
              </span>
            </>
          ) : (
            <Tag tone="fg">{world.probs !== undefined ? t.probability : t.actualWorld}</Tag>
          )}
        </div>
        <div className="ca-box-actions">
          {actions}
          {hasSet && editable && (
            <button type="button" className="ca-link" onClick={clearAll}>
              {prob ? t.backToPrior : t.backToActual}
            </button>
          )}
          <ExportMenu source={exportSource} url={exportUrl} origins={originCitations(c)} embedCode={embedCode} />
        </div>
      </div>
      <div className="ca-graph-wrap" ref={wrap}>
        {graph(t, true)}
        {menu !== undefined && (
          <NodeMenu
            c={c}
            id={menu}
            world={world}
            interventions={interventions}
            stochastic={stochastic}
            observed={observed}
            observes={observes}
            intervenes={onDo !== undefined}
            counterfactual={cf}
            pair={paths?.ends}
            extra={menuExtra?.(menu)}
            onObserve={(v) => observe(menu, v)}
            onDo={(v) => intervene(menu, v)}
            onDoProbability={(p) => doing(withProbability(state, menu, p), menu)}
            onClose={closeMenu}
            style={menuStyle}
            menuRef={menuRef}
          />
        )}
        {tip !== undefined && (
          <div className="ca-edge-tip" role="tooltip" data-edge-tip={tip.key} style={tipStyle}>
            {tip.text}
          </div>
        )}
      </div>
      {notice !== undefined && (
        <p className="ca-notice" role="status">
          <Rich text={notice} ids={c.model.byId} />
        </p>
      )}
      {legend === true && <p className="ca-legend">{legendFor(t)}</p>}
      {foot}
      {blocks !== undefined && <FigureTabs blocks={blocks} initial={initialBlock} />}
    </div>
  )
}
