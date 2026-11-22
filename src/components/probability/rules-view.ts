import type { LoadedCase } from '../../data/load.ts'
import type { Assignment, DSeparationResult, Edge, Interventions, Prior, Value } from '../../engine/index.ts'
import { ModelError, dSeparation, domainValues, formatValue, getVariable, probability, switchId, valuesEqual, withSwitches } from '../../engine/index.ts'
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
  /** The arrows drawn cut: the step's, then those into a variable its switch sets (not the switch's own arrow). */
  readonly removed: readonly Edge[]
  readonly marks: PathMarks
  /** Both sides' values on the full model, when the step has an equation. */
  readonly sides?: readonly [number, number]
  /** The equation shown: the step's, with each switched variable a click set taking its set value (see {@link equationUnder}). */
  readonly equation?: readonly [RuleSide, RuleSide]
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

/**
 * The step's graph with `known` as the known set: d-separation of the pair, the cut edges, the
 * marks, both sides, the verdict. `setting` holds the switched variables a click set (`{ Z: 1 }`,
 * the switch on): their incoming arrows are drawn cut, except the switch's own; the test and the
 * verdict stay those of the switch graph, which holds both regimes.
 */
export function ruleView(c: LoadedCase, prior: Prior, step: RuleStep, known: readonly string[], setting: Assignment = {}): RuleView {
  const [x, y] = step.pair
  const cutIn = step.cutIn ?? []
  const cutOut = step.cutOut ?? []
  const switches = step.switches ?? []
  const where = `case ${c.data.id}, rule step ${step.label}`
  const model = withSwitches(c.model, switches)
  const switchNodes = switches.map(switchId)
  const switchTest = step.pair.some((id) => switchNodes.includes(id))
  for (const id of [x, y, ...known, ...cutIn, ...cutOut]) getVariable(model, id)
  for (const id of known) {
    if (switchNodes.includes(id)) throw new Error(`${where}: switch ${id} cannot be in the known set`)
  }
  for (const id of Object.keys(setting)) {
    if (!switches.includes(id)) throw new Error(`${where}: ${id} has no switch to set it`)
  }
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
  const removed = model.edges.filter(
    (e) => cutIn.includes(e.to) || cutOut.includes(e.from) || (e.to in setting && e.from !== switchId(e.to)),
  )
  const key = (e: { from: string; to: string }): string => `${e.from}>${e.to}`
  const open = new Set(result.paths.filter((p) => p.open).flatMap((p) => p.edges.map(key)))
  const blocked = new Set(result.paths.filter((p) => !p.open).flatMap((p) => p.edges.map(key)).filter((k) => !open.has(k)))
  const value = (s: RuleSide): number => probability(c.model, prior, s).value
  const equation = equationUnder(step, setting)
  const sides = equation === undefined ? undefined : ([value(equation[0]), value(equation[1])] as const)
  const own = known.length === step.given.length && step.given.every((id) => known.includes(id))
  const differ = own && sides !== undefined && Math.abs(sides[0] - sides[1]) >= SIDE_TOLERANCE
  const verdict: RuleVerdict = result.separated ? (differ ? 'mismatch' : switchTest ? 'swap' : 'applies') : switchTest ? 'noSwap' : 'notApplies'
  return { graph, switchNodes, switchTest, result, removed, marks: { open, blocked, ends: [x, y], paths: result.paths }, sides, equation, equationShown: own, verdict }
}

/** A mark the step's graph can draw, in the legend's order. */
export type RuleMark = 'pair' | 'switch' | 'known' | 'clamp' | 'testClamp' | 'switchSet' | 'cut' | 'open' | 'blocked'

/**
 * What a node is in a step, by its part in the test: one of the pair, a switch, given (known), set
 * by the expression's do() (arrows into it cut), its arrows in cut for the test only (the
 * expression does not set it), its arrows out cut for the test, set by its switch (a click).
 */
export type RuleRole = 'pair' | 'switch' | 'known' | 'set' | 'testCut' | 'cutOut' | 'switchSet'

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

/** The roles of `id` at `step` with `known` as the known set and `setting` the switched variables set, in a fixed order; empty when it has none. */
export function nodeRoles(step: RuleStep, known: readonly string[], id: string, setting: Assignment = {}): readonly RuleRole[] {
  const roles: RuleRole[] = []
  const { set, test } = clampSplit(step)
  if (step.pair.includes(id)) roles.push('pair')
  if ((step.switches ?? []).map(switchId).includes(id)) roles.push('switch')
  if (known.includes(id)) roles.push('known')
  if (set.includes(id)) roles.push('set')
  if (test.includes(id)) roles.push('testCut')
  if ((step.cutOut ?? []).includes(id)) roles.push('cutOut')
  if (id in setting) roles.push('switchSet')
  return roles
}

/** The marks drawn on the graph of `shown` nodes (switches included): only those present, so the legend names nothing that is not there. */
export function presentMarks(step: RuleStep, view: RuleView, known: readonly string[], shown: readonly string[], setting: Assignment = {}): readonly RuleMark[] {
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
  if (Object.keys(setting).some(drawn)) marks.push('switchSet')
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

/** The next state of the switch on `id`: off, then each value of the variable's domain in turn (0, 1), then off again (undefined). */
export function nextSwitchValue(c: LoadedCase, id: string, now: Value | undefined): Value | undefined {
  const values = domainValues(getVariable(c.model, id).domain)
  if (now === undefined) return values[0]
  const i = values.findIndex((v) => valuesEqual(v, now))
  return i < 0 || i === values.length - 1 ? undefined : values[i + 1]
}

/** One reading of the switch test's target: the query and its value on the full model (undefined when the evidence has probability 0). */
export interface SwitchQuery {
  readonly side: RuleSide
  readonly value: number | undefined
}

/**
 * What the switch does to the prediction of the pair's other end, on the full model: off (the
 * known set observed, the switched variable at the value it is set to, else 1) and, once a click
 * set it, on (the switched variable set by do(), the rest of the known set observed). `same` says
 * whether the two agree; the d-separation verdict says whether they must.
 */
export interface SwitchReading {
  readonly switches: readonly string[]
  readonly off: SwitchQuery
  readonly on?: SwitchQuery
  readonly same?: boolean
  /** The prediction at every setting of the switches, the current one marked, so a reader sees whether 0 → 1 moves it. */
  readonly settings: readonly SwitchSetting[]
  /** Whether every setting gives the same prediction (undefined with fewer than two, or one without data). */
  readonly settingsSame?: boolean
}

/** One setting of the switches and the prediction under it. */
export interface SwitchSetting {
  readonly setting: Assignment
  readonly query: SwitchQuery
  readonly current: boolean
}

/** A variable's value in the step's equation (`W=1` in a side's `given`), else undefined. */
function equationValue(step: RuleStep, id: string): string | undefined {
  for (const s of step.equal ?? []) {
    for (const part of (s.given ?? '').split(/\s+and\s+/)) {
      const [k, v] = part.split('=').map((x) => x.trim())
      if (k === id && v !== undefined && v !== '') return v
    }
  }
  return undefined
}

/** `text` (`1`, `0`, a finite value) as a value of `id`; fails fast when it is not one. */
function valueOfText(c: LoadedCase, id: string, text: string): Value {
  const values = domainValues(getVariable(c.model, id).domain)
  const found = values.find((v) => formatValue(v) === text || String(v) === text)
  if (found === undefined) throw new Error(`case ${c.data.id}: ${id}=${text} is not a value of ${id}`)
  return found
}

/** The value a known variable is read at: its value in the step's equation, else 1. */
function knownText(step: RuleStep, id: string): string {
  return equationValue(step, id) ?? '1'
}

/**
 * The values written inside the step's nodes: each known variable at the value it is read at
 * (its value in the equation, else 1), and each variable a switch sets at its set value. No other
 * node gets one: the graph draws no probabilities.
 */
export function nodeValues(c: LoadedCase, step: RuleStep, known: readonly string[], setting: Assignment = {}): Assignment {
  const out: Record<string, Value> = {}
  for (const id of known) out[id] = valueOfText(c, id, knownText(step, id))
  return { ...out, ...setting }
}

/**
 * The step's equation with each switched variable a click set taking its set value, in do() and in
 * the observation alike: rule 3's `P(Y=1 | W=1, do(Z=1))` reads `do(Z=0)` while the switch sets
 * Z=0, so the page never shows two settings at once. With the switch off, the equation as written.
 */
export function equationUnder(step: RuleStep, setting: Assignment): readonly [RuleSide, RuleSide] | undefined {
  if (step.equal === undefined) return undefined
  const set = Object.keys(setting)
  if (set.length === 0) return step.equal
  const side = (s: RuleSide): RuleSide => {
    const given =
      s.given === undefined
        ? undefined
        : s.given
            .split(/\s+and\s+/)
            .map((part) => {
              const k = part.split('=')[0]?.trim() ?? ''
              return k in setting ? `${k}=${formatValue(setting[k])}` : part
            })
            .join(' and ')
    const doPart = s.do === undefined ? undefined : Object.fromEntries(Object.entries(s.do).map(([k, v]) => [k, k in setting ? setting[k] : v]))
    return { event: s.event, ...(given === undefined ? {} : { given }), ...(doPart === undefined ? {} : { do: doPart }) }
  }
  return [side(step.equal[0]), side(step.equal[1])]
}

/** Every setting of the step's switches, each switch at each value of its variable, in domain order. */
function allSettings(c: LoadedCase, switches: readonly string[]): readonly Assignment[] {
  let out: Assignment[] = [{}]
  for (const id of switches) {
    const values = domainValues(getVariable(c.model, id).domain)
    out = out.flatMap((a) => values.map((v) => ({ ...a, [id]: v })))
  }
  return out
}

/** The switch test's reading under `setting`, or undefined when the step tests no switch. */
export function switchReading(c: LoadedCase, prior: Prior, step: RuleStep, known: readonly string[], setting: Assignment): SwitchReading | undefined {
  const switches = step.switches ?? []
  const nodes = switches.map(switchId)
  const target = step.pair.find((id) => !nodes.includes(id))
  if (target === undefined || !step.pair.some((id) => nodes.includes(id))) return undefined
  const first = step.equal?.[0].event
  const event = first !== undefined && first.split('=')[0]?.trim() === target ? first : `${target}=1`
  const valueOf = (id: string): string => (id in setting ? formatValue(setting[id]) : knownText(step, id))
  const given = (ids: readonly string[]): string | undefined => (ids.length === 0 ? undefined : ids.map((id) => `${id}=${valueOf(id)}`).join(' and '))
  const read = (side: RuleSide): SwitchQuery => {
    try {
      return { side, value: probability(c.model, prior, side).value }
    } catch (error) {
      if (error instanceof ModelError && error.problem.code === 'zero-probability-evidence') return { side, value: undefined }
      throw error
    }
  }
  const off = read({ event, given: given(known) })
  const under = (a: Assignment): SwitchQuery => {
    const ids = Object.keys(a)
    return read({ event, given: given(known.filter((id) => !ids.includes(id))), do: a })
  }
  const key = (a: Assignment): string => switches.map((id) => (id in a ? formatValue(a[id]) : '-')).join('|')
  const settings = allSettings(c, switches).map((a) => ({ setting: a, query: under(a), current: key(a) === key(setting) }))
  const values = settings.map((s) => s.query.value)
  const settingsSame =
    values.length < 2 || values.some((v) => v === undefined) ? undefined : values.every((v) => Math.abs((v ?? 0) - (values[0] ?? 0)) < SIDE_TOLERANCE)
  const set = Object.keys(setting)
  if (set.length === 0) return { switches: nodes, off, settings, settingsSame }
  const on = under(setting)
  const same = off.value !== undefined && on.value !== undefined ? Math.abs(off.value - on.value) < SIDE_TOLERANCE : undefined
  return { switches: nodes, off, on, same, settings, settingsSame }
}
