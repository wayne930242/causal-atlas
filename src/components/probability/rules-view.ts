import type { LoadedCase } from '../../data/load.ts'
import type { DSeparationResult, Edge, Interventions, Prior } from '../../engine/index.ts'
import { dSeparation, getVariable, probability } from '../../engine/index.ts'
import type { PathMarks } from '../model/dsep-view.ts'
import { doText } from '../model/wording.ts'
import { latentArcs } from '../graph/graph-layout.ts'

/** Pure helpers for the probability panel's do-calculus view (lesson 06). */

/** One side of a step's equation: P(event | given, do(…)). */
export interface RuleSide {
  readonly event: string
  readonly given?: string
  readonly do?: Interventions
}

/**
 * One step of a derivation: which rule, the pair whose separation it needs, the known set, how
 * the graph is cut (as the lesson writes it; the view does not derive it from the rule), and the
 * equation the rule licenses, checked on the full model.
 */
export interface RuleStep {
  /** The step button's label, e.g. `5a`. */
  readonly label: string
  readonly rule: 1 | 2 | 3
  readonly pair: readonly [string, string]
  /** The known set the step starts with. */
  readonly given: readonly string[]
  /** Variables whose incoming arrows are cut (G with X overlined). */
  readonly cutIn?: readonly string[]
  /** Variables whose outgoing arrows are cut (G with X underlined). */
  readonly cutOut?: readonly string[]
  /** The two sides the rule makes equal. */
  readonly equal?: readonly [RuleSide, RuleSide]
}

export interface RuleView {
  readonly result: DSeparationResult
  readonly removed: readonly Edge[]
  readonly marks: PathMarks
  /** Both sides' values on the full model, when the step has an equation. */
  readonly sides?: readonly [number, number]
}

export const SIDE_TOLERANCE = 1e-9

/** The step's cut graph with `known` as the known set: d-separation of the pair, the cut edges, the marks, both sides. */
export function ruleView(c: LoadedCase, prior: Prior, step: RuleStep, known: readonly string[]): RuleView {
  const [x, y] = step.pair
  const cutIn = step.cutIn ?? []
  const cutOut = step.cutOut ?? []
  for (const id of [x, y, ...known, ...cutIn, ...cutOut]) getVariable(c.model, id)
  const result = dSeparation(c.model, x, y, known, cutIn, cutOut)
  const removed = c.model.edges.filter((e) => cutIn.includes(e.to) || cutOut.includes(e.from))
  const key = (e: { from: string; to: string }): string => `${e.from}>${e.to}`
  const open = new Set(result.paths.filter((p) => p.open).flatMap((p) => p.edges.map(key)))
  const blocked = new Set(result.paths.filter((p) => !p.open).flatMap((p) => p.edges.map(key)).filter((k) => !open.has(k)))
  const value = (s: RuleSide): number => probability(c.model, prior, s).value
  const sides = step.equal === undefined ? undefined : ([value(step.equal[0]), value(step.equal[1])] as const)
  return { result, removed, marks: { open, blocked, ends: [x, y], paths: result.paths }, sides }
}

/** A mark the cut graph can draw, in the legend's order. */
export type RuleMark = 'pair' | 'known' | 'clamp' | 'cut' | 'open' | 'blocked'

/** What a node is in a step: one of the pair, known, set by do() (arrows into it cut), its arrows out cut. */
export type RuleRole = 'pair' | 'known' | 'set' | 'cutOut'

/** The roles of `id` at `step` with `known` as the known set, in a fixed order; empty when it has none. */
export function nodeRoles(step: RuleStep, known: readonly string[], id: string): readonly RuleRole[] {
  const roles: RuleRole[] = []
  if (step.pair.includes(id)) roles.push('pair')
  if (known.includes(id)) roles.push('known')
  if ((step.cutIn ?? []).includes(id)) roles.push('set')
  if ((step.cutOut ?? []).includes(id)) roles.push('cutOut')
  return roles
}

/** The marks drawn on the graph of `shown` nodes: only those present, so the legend names nothing that is not there. */
export function presentMarks(c: LoadedCase, step: RuleStep, view: RuleView, known: readonly string[], shown: readonly string[]): readonly RuleMark[] {
  const drawn = (id: string): boolean => shown.includes(id)
  const { open, blocked } = view.marks
  const onPath = (k: string): boolean => open.has(k) || blocked.has(k)
  const cut = new Set(view.removed.map((e) => `${e.from}>${e.to}`))
  const cutIn = step.cutIn ?? []
  // A latent cause's arc is drawn unless an end is cut, and is marked when both its arrows are on a path.
  const arcs = latentArcs(c, shown)
    .filter((a) => [a.a, a.b].every((id) => !cut.has(`${a.via}>${id}`) && !cutIn.includes(id)))
    .map((a) => [`${a.via}>${a.a}`, `${a.via}>${a.b}`])
  const edgeKeys = (set: ReadonlySet<string>): boolean =>
    [...set].some((k) => {
      const [from = '', to = ''] = k.split('>')
      return drawn(from) && drawn(to)
    })
  const marks: RuleMark[] = []
  if (step.pair.some(drawn)) marks.push('pair')
  if (known.some(drawn)) marks.push('known')
  if (cutIn.some(drawn)) marks.push('clamp')
  if (view.removed.some((e) => drawn(e.from) && drawn(e.to))) marks.push('cut')
  if (edgeKeys(open) || arcs.some((ks) => ks.every((k) => open.has(k)))) marks.push('open')
  if (edgeKeys(blocked) || arcs.some((ks) => ks.every(onPath) && !ks.every((k) => open.has(k)))) marks.push('blocked')
  return marks
}

/** `P(Y=1 | Z=1, do(X=1))`: the observation first, then the do(). */
export function sideText(s: RuleSide): string {
  const parts = [(s.given ?? '').replace(/\s+and\s+/g, ', '), s.do === undefined || Object.keys(s.do).length === 0 ? '' : doText(s.do)].filter((p) => p !== '')
  return parts.length === 0 ? `P(${s.event})` : `P(${s.event} | ${parts.join(', ')})`
}
