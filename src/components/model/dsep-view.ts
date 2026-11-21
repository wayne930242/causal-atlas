import type { LoadedCase } from '../../data/load.ts'
import type { Assignment, DPath, DSeparationResult } from '../../engine/index.ts'
import { dSeparation, dependence } from '../../engine/index.ts'
import type { Messages } from '../i18n/messages.ts'
import type { Stochastic } from './assignments.ts'
import { fixed } from './wording.ts'

/** Pure helpers for the playground's d-separation line. */

/** A pair of variables whose paths the playground lights. */
export type DsepPair = readonly [string, string]

/** At most this many paths are listed under the graph; the rest are counted. */
export const MAX_PATHS = 3

/** What the graph draws for a pair: each edge on an open path, each on a blocked one, the two ends, and the marked paths. */
export interface PathMarks {
  readonly open: ReadonlySet<string>
  readonly blocked: ReadonlySet<string>
  readonly ends: readonly string[]
  /** The paths whose edges are marked, so an edge's tip can name them. */
  readonly paths: readonly DPath[]
}

/** At most this many paths are named in an edge's tip; the rest are counted. */
export const TIP_PATHS = 2

export interface DsepView {
  readonly result: DSeparationResult
  /** δ given the observed values, after do(). */
  readonly delta: number
  readonly marks: PathMarks
}

/** The pair's paths in the graph after do(), with the observations as the known set, and δ. */
export function dsepView(c: LoadedCase, pair: DsepPair, observed: Assignment, interventions: Assignment, stochastic: Stochastic): DsepView {
  if (c.prior === undefined) throw new Error(`${c.data.id}: dsep needs probabilities`)
  const [x, y] = pair
  const cut = [...Object.keys(interventions), ...Object.keys(stochastic)]
  const result = dSeparation(c.model, x, y, Object.keys(observed), cut)
  const delta = dependence(c.model, c.prior, x, y, observed, interventions, stochastic)
  const key = (e: { from: string; to: string }): string => `${e.from}>${e.to}`
  const open = new Set(result.paths.filter((p) => p.open).flatMap((p) => p.edges.map(key)))
  const blocked = new Set(result.paths.filter((p) => !p.open).flatMap((p) => p.edges.map(key)).filter((k) => !open.has(k)))
  return { result, delta, marks: { open, blocked, ends: [x, y], paths: result.paths } }
}

/** δ as the lesson writes it: 0.000 for none, else up to four decimals (0.12, 0.1225). */
export function deltaText(delta: number): string {
  if (Number.isNaN(delta)) return '—'
  if (delta < 1e-12) return '0.000'
  return fixed(delta, 4).replace(/(\.\d\d\d*?)0+$/, '$1')
}

/** `G→A←M`: the path with each edge's own direction. */
export function pathText(p: DPath): string {
  return p.nodes.reduce((acc, id, i) => (i === 0 ? id : `${acc}${p.edges[i - 1].from === p.nodes[i - 1] ? '→' : '←'}${id}`), '')
}


/** Why a path is open or blocked, in the dsep line's words. */
export function pathReason(t: Messages, p: DPath): string {
  const d = t.dsep
  if (!p.open) return p.kind === 'collider' ? d.colliderUnknown(p.blockedBy ?? '') : d.middleKnown(p.blockedBy ?? '')
  const opened = p.opened ?? []
  if (opened.length === 0) return p.nodes.length === 2 ? d.adjacent : d.middlesUnknown
  return t.list(opened.map((o) => (o.by === o.collider ? d.colliderKnown(o.collider) : d.descendantKnown(o.collider, o.by))))
}

/** `S → W ← R`: the path with each edge's own direction, spaced for a sentence. */
export function pathSentence(p: DPath): string {
  return p.nodes.reduce((acc, id, i) => (i === 0 ? id : `${acc} ${p.edges[i - 1].from === p.nodes[i - 1] ? '→' : '←'} ${id}`), '')
}

/** One path in an edge's tip: where and why it is blocked, or why it is open, in the lesson's words (chain, fork, collider). */
export function pathTipSentence(t: Messages, p: DPath): string {
  const e = t.edgeTip
  const path = pathSentence(p)
  if (!p.open) {
    const at = p.blockedBy ?? ''
    if (p.kind === 'collider') return e.pathBlocked(path, at, e.colliderUnknown(at, p.descendants ?? []))
    const i = p.nodes.indexOf(at)
    const fork = i > 0 && p.edges[i - 1].from === at && p.edges[i].from === at
    return e.pathBlocked(path, at, fork ? e.forkKnown(at) : e.chainKnown(at))
  }
  if (p.nodes.length === 2) return e.pathOpen(path, e.adjacent)
  const opened = p.opened ?? []
  const colliders = new Set(opened.map((o) => o.collider))
  const middles = p.nodes.slice(1, -1).filter((id) => !colliders.has(id))
  const why = [
    ...opened.map((o) => (o.by === o.collider ? e.colliderKnown(o.collider) : e.descendantKnown(o.collider, o.by))),
    ...(middles.length === 0 ? [] : [e.middlesUnknown(middles)]),
  ]
  return e.pathOpen(path, t.list(why))
}

/** The tip of a marked edge: the marked paths through it in its own state, at most {@link TIP_PATHS}, then how many in all. */
export function edgeTipText(t: Messages, marks: PathMarks, key: string, onPath: 'open' | 'blocked'): string {
  const through = marks.paths.filter((p) => p.open === (onPath === 'open') && p.edges.some((e) => `${e.from}>${e.to}` === key))
  const named = through.slice(0, TIP_PATHS).map((p) => pathTipSentence(t, p))
  const parts = through.length > TIP_PATHS ? [...named, t.edgeTip.more(through.length)] : named
  return onPath === 'open' ? t.edgeTip.open(parts) : t.edgeTip.blocked(parts)
}
