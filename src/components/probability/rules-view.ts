import type { LoadedCase } from '../../data/load.ts'
import type { DSeparationResult, Edge, Interventions, Prior } from '../../engine/index.ts'
import { dSeparation, getVariable, probability, switchId, withSwitches } from '../../engine/index.ts'
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
 *
 * With `switches`, the graph also draws an intervention switch `F_v → v` for each listed variable
 * (Pearl 2009, §3.2.2), and `pair` may name one (`["F_Z", "Y"]`): then the step tests the
 * switch, on the graph of the expression with only the arrows into the variables it already sets
 * (`cutIn`) cut, and nothing cut for the test. Rule 2 gives `Z` (the switched variable), rule 3
 * does not.
 */
export interface RuleStep {
  /** The step button's label, e.g. `5a`. */
  readonly label: string
  readonly rule: 1 | 2 | 3
  /** The two whose d-separation the step tests; a switch by its id `F_Z`. */
  readonly pair: readonly [string, string]
  /** The known set the step starts with. */
  readonly given: readonly string[]
  /** Variables whose incoming arrows are cut (G with X overlined). */
  readonly cutIn?: readonly string[]
  /** Variables whose outgoing arrows are cut (G with X underlined). */
  readonly cutOut?: readonly string[]
  /** Variables given an intervention switch `F_v → v` on the graph; no arrow into them is cut by it. */
  readonly switches?: readonly string[]
  /** The two sides the rule makes equal. */
  readonly equal?: readonly [RuleSide, RuleSide]
}

/**
 * What the step's line says, from the d-separation test alone. A switch test: `swap` when the
 * switch and the outcome are d-separated, else `noSwap`. A cut graph: `applies` when separated,
 * `notApplies` when not; but `mismatch` when separated, with the step's own known set, while the
 * equation's two sides differ (a cut the rule does not license), so the line never says a rule
 * applies while its numbers disagree. With another known set the equation is not shown (see
 * {@link RuleView.equationShown}).
 */
export type RuleVerdict = 'swap' | 'noSwap' | 'applies' | 'notApplies' | 'mismatch'

export interface RuleView {
  /** The case drawn: the step's model with its switches added (the same case without switches). */
  readonly graph: LoadedCase
  /** The switch nodes drawn, by id (`F_Z`). */
  readonly switchNodes: readonly string[]
  /** The step tests a switch (its pair names one): no arrow is cut for the test. */
  readonly switchTest: boolean
  readonly result: DSeparationResult
  readonly removed: readonly Edge[]
  readonly marks: PathMarks
  /** Both sides' values on the full model, when the step has an equation. */
  readonly sides?: readonly [number, number]
  /** The known set is the step's own, so its equation is the one tested (shown); a click moved it off, so not. */
  readonly equationShown: boolean
  readonly verdict: RuleVerdict
}

export const SIDE_TOLERANCE = 1e-9

/** The variables set by do() on both sides of the step's equation: the expression's own interventions. */
export function setInExpression(step: RuleStep): readonly string[] | undefined {
  if (step.equal === undefined) return undefined
  const [a, b] = step.equal
  const right = Object.keys(b.do ?? {})
  return Object.keys(a.do ?? {}).filter((id) => right.includes(id))
}

/** The step's graph with `known` as the known set: d-separation of the pair, the cut edges, the marks, both sides, the verdict. */
export function ruleView(c: LoadedCase, prior: Prior, step: RuleStep, known: readonly string[]): RuleView {
  const [x, y] = step.pair
  const cutIn = step.cutIn ?? []
  const cutOut = step.cutOut ?? []
  const switches = step.switches ?? []
  const where = `case ${c.data.id}, rule step ${step.label}`
  const model = withSwitches(c.model, switches)
  const switchNodes = switches.map(switchId)
  const switchTest = step.pair.some((id) => switchNodes.includes(id))
  for (const id of [x, y, ...known, ...cutIn, ...cutOut]) getVariable(model, id)
  for (const id of switches) {
    if (cutIn.includes(id)) throw new Error(`${where}: ${id} has a switch, so the arrows into it are not cut (drop it from cutIn)`)
  }
  if (switchTest) {
    if (cutOut.length > 0) throw new Error(`${where}: a switch test cuts no arrows out (drop cutOut)`)
    const set = setInExpression(step)
    const extra = set === undefined ? [] : cutIn.filter((id) => !set.includes(id))
    if (extra.length > 0) throw new Error(`${where}: a switch test cuts only the arrows into the variables both sides set by do(); ${extra.join(', ')} is not`)
  }
  const graph: LoadedCase = switches.length === 0 ? c : { ...c, model }
  const result = dSeparation(model, x, y, known, cutIn, cutOut)
  const removed = model.edges.filter((e) => cutIn.includes(e.to) || cutOut.includes(e.from))
  const key = (e: { from: string; to: string }): string => `${e.from}>${e.to}`
  const open = new Set(result.paths.filter((p) => p.open).flatMap((p) => p.edges.map(key)))
  const blocked = new Set(result.paths.filter((p) => !p.open).flatMap((p) => p.edges.map(key)).filter((k) => !open.has(k)))
  const value = (s: RuleSide): number => probability(c.model, prior, s).value
  const sides = step.equal === undefined ? undefined : ([value(step.equal[0]), value(step.equal[1])] as const)
  const own = known.length === step.given.length && step.given.every((id) => known.includes(id))
  const differ = own && sides !== undefined && Math.abs(sides[0] - sides[1]) >= SIDE_TOLERANCE
  const verdict: RuleVerdict = result.separated ? (differ ? 'mismatch' : switchTest ? 'swap' : 'applies') : switchTest ? 'noSwap' : 'notApplies'
  return { graph, switchNodes, switchTest, result, removed, marks: { open, blocked, ends: [x, y], paths: result.paths }, sides, equationShown: own, verdict }
}

/** A mark the step's graph can draw, in the legend's order. */
export type RuleMark = 'pair' | 'switch' | 'known' | 'clamp' | 'testClamp' | 'cut' | 'open' | 'blocked'

/**
 * What a node is in a step, by its part in the test: one of the pair, a switch, given (known), set
 * by the expression's do() (arrows into it cut), its arrows in cut for the test only (the
 * expression does not set it), its arrows out cut for the test.
 */
export type RuleRole = 'pair' | 'switch' | 'known' | 'set' | 'testCut' | 'cutOut'

/**
 * The variables of `cutIn` the expression sets by do() on both sides (drawn with the do() clamp),
 * and those cut only for the test (a dashed clamp). With no equation every one counts as set.
 */
export function clampSplit(step: RuleStep): { readonly set: readonly string[]; readonly test: readonly string[] } {
  const cutIn = step.cutIn ?? []
  const inExpr = setInExpression(step)
  if (inExpr === undefined) return { set: cutIn, test: [] }
  return { set: cutIn.filter((id) => inExpr.includes(id)), test: cutIn.filter((id) => !inExpr.includes(id)) }
}

/** The roles of `id` at `step` with `known` as the known set, in a fixed order; empty when it has none. */
export function nodeRoles(step: RuleStep, known: readonly string[], id: string): readonly RuleRole[] {
  const roles: RuleRole[] = []
  const { set, test } = clampSplit(step)
  if (step.pair.includes(id)) roles.push('pair')
  if ((step.switches ?? []).map(switchId).includes(id)) roles.push('switch')
  if (known.includes(id)) roles.push('known')
  if (set.includes(id)) roles.push('set')
  if (test.includes(id)) roles.push('testCut')
  if ((step.cutOut ?? []).includes(id)) roles.push('cutOut')
  return roles
}

/** The marks drawn on the graph of `shown` nodes (switches included): only those present, so the legend names nothing that is not there. */
export function presentMarks(step: RuleStep, view: RuleView, known: readonly string[], shown: readonly string[]): readonly RuleMark[] {
  const c = view.graph
  const drawn = (id: string): boolean => shown.includes(id)
  const { open, blocked } = view.marks
  const onPath = (k: string): boolean => open.has(k) || blocked.has(k)
  const cut = new Set(view.removed.map((e) => `${e.from}>${e.to}`))
  const cutIn = step.cutIn ?? []
  const { set, test } = clampSplit(step)
  // A latent cause's arc is drawn unless an end is cut, and is marked when both its arrows are on a path.
  const arcs = latentArcs(c, shown)
    .filter((a) => [a.a, a.b].every((id) => !cut.has(`${a.via}>${id}`) && !cutIn.includes(id)))
    .map((a) => [`${a.via}>${a.a}`, `${a.via}>${a.b}`])
  const edgeKeys = (keys: ReadonlySet<string>): boolean =>
    [...keys].some((k) => {
      const [from = '', to = ''] = k.split('>')
      return drawn(from) && drawn(to)
    })
  const marks: RuleMark[] = []
  if (step.pair.some(drawn)) marks.push('pair')
  if (view.switchNodes.some(drawn)) marks.push('switch')
  if (known.some(drawn)) marks.push('known')
  if (set.some(drawn)) marks.push('clamp')
  if (test.some(drawn)) marks.push('testClamp')
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
