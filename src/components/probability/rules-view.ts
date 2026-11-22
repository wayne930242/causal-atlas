import type { LoadedCase } from '../../data/load.ts'
import type { Assignment, CalculusKind, CausalModel, DSeparationResult, DerivationStep, DoExpr, Edge, ExprComparison, Interventions, Prior, Value } from '../../engine/index.ts'
import { ModelError, coerceToDomain, compareDoExprs, dSeparation, domainValues, formatValue, getVariable, probability, switchId, valuesEqual, withSwitches } from '../../engine/index.ts'
import { observationFormula } from '../model/assignments.ts'
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
  /**
   * The two sets whose d-separation the step tests, [Z, Y] in the order of `pair`, when either has
   * more than one variable; `pair` then names their first members.
   */
  readonly sets?: readonly [readonly string[], readonly string[]]
  /**
   * The two sides as expressions with free variables, such as P(y | do(x), z) = P(y | do(x, z)),
   * in place of `equal`: they are compared on the full model at every assignment of their free
   * variables. The variables both sides set by do() are the expression's own interventions.
   */
  readonly symbolic?: readonly [DoExpr, DoExpr]
}

/**
 * A probability-calculus step of a derivation (chain rule, Σ-expansion, a conditional's
 * definition, substitution, simplification): no graph test; its two sides are compared on the full
 * model at every assignment of their free variables.
 */
export interface CalculusStep {
  readonly label: string
  readonly calculus: CalculusKind
  readonly symbolic: readonly [DoExpr, DoExpr]
}

/** A step of a derivation as the rules view shows it. */
export type DerivationViewStep = RuleStep | CalculusStep

export function isCalculus(step: DerivationViewStep): step is CalculusStep {
  return 'calculus' in step
}

/**
 * The engine's derivation (see `derive`) as view steps labelled 1, 2, …: a rule step tests its
 * moved variables Z against the term's Y given its do() and observed variables, on the graph with
 * the cuts the rule computes; its sides are the term before and after.
 */
export function derivationSteps(steps: readonly DerivationStep[]): readonly DerivationViewStep[] {
  return steps.map((s, i): DerivationViewStep => {
    const label = String(i + 1)
    if (s.kind !== 'rule') return { label, calculus: s.kind, symbolic: [s.left, s.right] }
    const { moved, head, given, cutIn, cutOut } = s.test
    const single = moved.length === 1 && head.length === 1
    return {
      label,
      rule: s.rule,
      pair: [moved[0], head[0]],
      ...(single ? {} : { sets: [moved, head] as const }),
      given,
      ...(cutIn.length > 0 ? { cutIn } : {}),
      ...(cutOut.length > 0 ? { cutOut } : {}),
      symbolic: [s.left, s.right],
    }
  })
}

/** The sets the step tests, [Z, Y]: `sets`, else the pair's two variables. */
export function pairSets(step: RuleStep): readonly [readonly string[], readonly string[]] {
  return step.sets ?? [[step.pair[0]], [step.pair[1]]]
}

/** A symbolic step's two sides compared on the full model. */
export interface SymbolicCheck {
  readonly left: DoExpr
  readonly right: DoExpr
  readonly comparison: ExprComparison
}

const symbolicChecks = new WeakMap<readonly [DoExpr, DoExpr], WeakMap<CausalModel, Map<Prior, ExprComparison>>>()

/** `sides` compared on `model` at every assignment of their free variables (remembered per step, model and prior). */
export function symbolicCheck(model: CausalModel, prior: Prior, sides: readonly [DoExpr, DoExpr]): SymbolicCheck {
  let byModel = symbolicChecks.get(sides)
  if (byModel === undefined) symbolicChecks.set(sides, (byModel = new WeakMap()))
  let byPrior = byModel.get(model)
  if (byPrior === undefined) byModel.set(model, (byPrior = new Map()))
  let comparison = byPrior.get(prior)
  if (comparison === undefined) byPrior.set(prior, (comparison = compareDoExprs(model, prior, sides[0], sides[1], SIDE_TOLERANCE)))
  return { left: sides[0], right: sides[1], comparison }
}

/** A calculus step's check: `holds` when the sides agree at every assignment where both are defined. */
export type ComparisonVerdict = 'holds' | 'mismatch' | 'unavailable'

export function comparisonVerdict(check: SymbolicCheck | undefined): ComparisonVerdict {
  if (check === undefined || check.comparison.rows === 0) return 'unavailable'
  return check.comparison.differsAt === undefined ? 'holds' : 'mismatch'
}

export interface CalculusView {
  readonly check: SymbolicCheck | undefined
  readonly verdict: ComparisonVerdict
}

export function calculusView(c: LoadedCase, prior: Prior | undefined, step: CalculusStep, comparisonModel = c.model): CalculusView {
  const check = prior === undefined ? undefined : symbolicCheck(comparisonModel, prior, step.symbolic)
  return { check, verdict: comparisonVerdict(check) }
}

/** d-separation of two sets: separated when every pair is, with every pair's paths. */
function setSeparation(model: CausalModel, a: readonly string[], b: readonly string[], known: readonly string[], cutIn: readonly string[], cutOut: readonly string[]): DSeparationResult {
  if (a.length === 1 && b.length === 1) return dSeparation(model, a[0], b[0], known, cutIn, cutOut)
  const results = a.flatMap((x) => b.map((y) => dSeparation(model, x, y, known, cutIn, cutOut)))
  return { separated: results.every((r) => r.separated), paths: results.flatMap((r) => r.paths) }
}

/**
 * What the step's line says, from the d-separation test alone. A switch test: `swap` when the
 * switch and the outcome are d-separated, else `noSwap`. A cut graph: `applies` when separated,
 * `notApplies` when not. On either graph, `mismatch` means the pair is separated but the two
 * computed sides still differ, so the line never licenses a swap while its numbers disagree.
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
  /** The arrows drawn cut: the test's cuts and those into a switch-set variable (not the switch's own arrow). */
  readonly removed: readonly Edge[]
  readonly marks: PathMarks
  /** Both queries on the full model, when the step has an equation. */
  readonly equation?: readonly [SwitchQuery, SwitchQuery]
  /** The symbolic sides compared on the full model, when the step has them. */
  readonly symbolic?: SymbolicCheck
  /** The observed or intervened variables; a switch setting is neither. */
  readonly known: readonly string[]
  readonly verdict: RuleVerdict
  /** A switch test's reading in the current state (undefined for a cut-graph step). */
  readonly reading?: SwitchReading
}

export const SIDE_TOLERANCE = 1e-9

/** The variables set by do() on both sides of the step's equation: the expression's own interventions. */
export function setInExpression(step: RuleStep): readonly string[] | undefined {
  if (step.symbolic !== undefined) {
    const [a, b] = step.symbolic
    if (a.kind !== 'p' || b.kind !== 'p') return []
    return (a.do ?? []).filter((id) => (b.do ?? []).includes(id))
  }
  if (step.equal === undefined) return undefined
  const [a, b] = step.equal
  return Object.entries(a.do ?? {}).filter(([id, v]) => b.do?.[id] !== undefined && valuesEqual(v, b.do[id])).map(([id]) => id)
}

/**
 * The cut edges, d-separation test and equation under the reader's settings. Switch settings cut
 * the drawn arrows into their nodes (except the switch's own), not the edges used for the test.
 */
export function ruleView(c: LoadedCase, prior: Prior | undefined, step: RuleStep, state: RuleState, comparisonModel = c.model): RuleView {
  const { observed, interventions, setting } = state
  const [x, y] = step.pair
  const [xs, ys] = pairSets(step)
  const writtenCut = step.cutIn ?? []
  const cutIn = [...new Set([...Object.keys(interventions), ...clampSplit(step).test])]
  const known = [...new Set([...step.given, ...Object.keys(interventions), ...Object.keys(observed)])].filter((id) => id in interventions || id in observed)
  const cutOut = step.cutOut ?? []
  const switches = step.switches ?? []
  const where = `case ${c.data.id}, rule step ${step.label}`
  const model = withSwitches(c.model, switches)
  const switchNodes = switches.map(switchId)
  const switchTest = step.pair.some((id) => switchNodes.includes(id))
  for (const id of [x, y, ...xs, ...ys, ...known, ...writtenCut, ...cutIn, ...cutOut]) getVariable(model, id)
  if (step.sets !== undefined && (xs[0] !== x || ys[0] !== y)) throw new Error(`${where}: pair names the first members of sets`)
  if (step.symbolic !== undefined && step.equal !== undefined) throw new Error(`${where}: a step has symbolic sides or an equation, not both`)
  for (const id of known) {
    if (switchNodes.includes(id)) throw new Error(`${where}: switch ${id} cannot be in the known set`)
  }
  for (const id of Object.keys(setting)) {
    if (!switches.includes(id)) throw new Error(`${where}: ${id} has no switch to set it`)
  }
  for (const id of switches) {
    if (writtenCut.includes(id)) throw new Error(`${where}: ${id} has a switch, so the arrows into it are not cut (drop it from cutIn)`)
  }
  if (switchTest) {
    if (cutOut.length > 0) throw new Error(`${where}: a switch test cuts no arrows out (drop cutOut)`)
    const set = setInExpression(step)
    const extra = set === undefined ? [] : writtenCut.filter((id) => !set.includes(id))
    if (extra.length > 0) throw new Error(`${where}: a switch test cuts only the arrows into the variables both sides set by do(); ${extra.join(', ')} is not`)
  }
  const graph: LoadedCase = switches.length === 0 ? c : { ...c, model }
  const result = setSeparation(model, xs, ys, known, cutIn, cutOut)
  const removed = model.edges.filter(
    (e) => cutIn.includes(e.to) || cutOut.includes(e.from) || (e.to in setting && e.from !== switchId(e.to)),
  )
  const key = (e: { from: string; to: string }): string => `${e.from}>${e.to}`
  const open = new Set(result.paths.filter((p) => p.open).flatMap((p) => p.edges.map(key)))
  const blocked = new Set(result.paths.filter((p) => !p.open).flatMap((p) => p.edges.map(key)).filter((k) => !open.has(k)))
  const sides = equationUnder(step, state)
  const equation = sides === undefined || prior === undefined ? undefined : ([readQuery(c, prior, sides[0]), readQuery(c, prior, sides[1])] as const)
  const [left, right] = equation ?? []
  const reading = prior === undefined ? undefined : switchReading(c, prior, step, state)
  const symbolic = step.symbolic === undefined || prior === undefined ? undefined : symbolicCheck(comparisonModel, prior, step.symbolic)
  // A switch test compares setting with not setting at every value; a cut graph compares its two sides, a symbolic step at every assignment.
  const differ = reading !== undefined
    ? reading.differs
    : symbolic !== undefined
      ? symbolic.comparison.differsAt !== undefined
      : left?.value !== undefined && right?.value !== undefined && Math.abs(left.value - right.value) >= SIDE_TOLERANCE
  const verdict: RuleVerdict = result.separated ? (differ ? 'mismatch' : switchTest ? 'swap' : 'applies') : switchTest ? 'noSwap' : 'notApplies'
  return { graph, switchNodes, switchTest, result, removed, marks: { open, blocked, ends: [...new Set([...xs, ...ys])], paths: result.paths }, equation, ...(symbolic === undefined ? {} : { symbolic }), known, verdict, reading }
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
export function nodeRoles(step: RuleStep, known: readonly string[], id: string, { interventions, setting }: RuleState): readonly RuleRole[] {
  const roles: RuleRole[] = []
  const { test } = clampSplit(step)
  if (pairSets(step).some((set) => set.includes(id))) roles.push('pair')
  if ((step.switches ?? []).map(switchId).includes(id)) roles.push('switch')
  if (known.includes(id)) roles.push('known')
  if (id in interventions) roles.push('set')
  if (test.includes(id)) roles.push('testCut')
  if ((step.cutOut ?? []).includes(id)) roles.push('cutOut')
  if (id in setting) roles.push('switchSet')
  return roles
}

/** The marks drawn on the graph of `shown` nodes (switches included): only those present, so the legend names nothing that is not there. */
export function presentMarks(step: RuleStep, view: RuleView, shown: readonly string[], { interventions, setting }: RuleState): readonly RuleMark[] {
  const c = view.graph
  const drawn = (id: string): boolean => shown.includes(id)
  const { open, blocked } = view.marks
  const onPath = (k: string): boolean => open.has(k) || blocked.has(k)
  const cut = new Set(view.removed.map((e) => `${e.from}>${e.to}`))
  const { test } = clampSplit(step)
  // A latent cause's arc is drawn unless an end is cut, and is marked when both its arrows are on a path.
  const arcs = latentArcs(c, shown)
    .filter((a) => [a.a, a.b].every((id) => !cut.has(`${a.via}>${id}`)))
    .map((a) => [`${a.via}>${a.a}`, `${a.via}>${a.b}`])
  const edgeKeys = (keys: ReadonlySet<string>): boolean =>
    [...keys].some((k) => {
      const [from = '', to = ''] = k.split('>')
      return drawn(from) && drawn(to)
    })
  const marks: RuleMark[] = []
  if (pairSets(step).some((set) => set.some(drawn))) marks.push('pair')
  if (view.switchNodes.some(drawn)) marks.push('switch')
  if (view.known.some(drawn)) marks.push('known')
  if (Object.keys(interventions).some(drawn)) marks.push('clamp')
  if (test.some((id) => drawn(id) && !(id in interventions))) marks.push('testClamp')
  if (Object.keys(setting).some(drawn)) marks.push('switchSet')
  if (view.removed.some((e) => drawn(e.from) && drawn(e.to))) marks.push('cut')
  if (edgeKeys(open) || arcs.some((ks) => ks.every((k) => open.has(k)))) marks.push('open')
  if (edgeKeys(blocked) || arcs.some((ks) => ks.every(onPath) && !ks.every((k) => open.has(k)))) marks.push('blocked')
  return marks
}

/** `P(Y=1 | Z=1, do(X=1))`: the observation first, then the do(). */
export function sideText(s: RuleSide): string {
  const parts = [conditions(s).join(', '), s.do === undefined || Object.keys(s.do).length === 0 ? '' : doText(s.do)].filter((p) => p !== '')
  return parts.length === 0 ? `P(${s.event})` : `P(${s.event} | ${parts.join(', ')})`
}

/** A query and its value on the full model (undefined when the evidence has probability 0). */
export interface SwitchQuery {
  readonly side: RuleSide
  readonly value: number | undefined
}

function readQuery(c: LoadedCase, prior: Prior, side: RuleSide): SwitchQuery {
  try {
    return { side, value: probability(c.model, prior, side).value }
  } catch (error) {
    if (error instanceof ModelError && error.problem.code === 'zero-probability-evidence') return { side, value: undefined }
    throw error
  }
}

/**
 * What the switch does to the prediction of the pair's other end (`target`), on the full model, in
 * the current state only. `off`: the switch not set, the switched variable seen at the switch's
 * value when it is observed (rule 2: P(Y | X, Z=v)), else unknown (rule 3: P(X)). `on`: the same
 * with the switched variables set by do() instead (P(Y | X, do(Z=v))). `now` is what the target's
 * node shows. `differs` says whether some setting moves the prediction away from its unswitched
 * counterpart at the same value; the d-separation verdict says whether it may.
 */
export interface SwitchReading {
  /** The switch nodes, by id (`F_Z`). */
  readonly switches: readonly string[]
  /** The pair's other end, whose prediction the switch may move. */
  readonly target: string
  readonly off: SwitchQuery
  /** The switched variables observed in `off`, at the value they are compared at. */
  readonly seen: Assignment
  readonly on?: SwitchQuery
  readonly same?: boolean
  /** The current prediction: `on` when a switch is set, else `off`. */
  readonly now: SwitchQuery
  readonly differs: boolean
}

/** Split a written conjunction without touching parentheses or quoted finite values. */
function conditions({ given }: RuleSide): readonly string[] {
  if (given === undefined || given.trim() === '') return []
  const parts: string[] = []
  let start = 0
  let depth = 0
  for (const { 0: token, index } of given.matchAll(/'[^']*'|"[^"]*"|\(|\)|\band\b/g)) {
    if (token === '(') depth += 1
    else if (token === ')') depth -= 1
    else if (token === 'and' && depth === 0) {
      parts.push(given.slice(start, index).trim())
      start = index + token.length
    }
  }
  return [...parts, given.slice(start).trim()]
}

/** A condition written as one variable's value, as opposed to a formula kept as written. */
function conditionAssignment(part: string): readonly [string, string] | undefined {
  const match = /^([A-Za-z_]\w*)\s*==?\s*(-?\d+(?:\.\d+)?|true|false|'[^']*'|"[^"]*")$/.exec(part)
  return match === null ? undefined : [match[1], match[2]]
}

/** A variable's value in the step's equation (`W=1` in a side's `given`), else undefined. */
function equationValue(step: RuleStep, id: string): string | undefined {
  for (const s of step.equal ?? []) {
    for (const part of conditions(s)) {
      const a = conditionAssignment(part)
      if (a?.[0] === id) return a[1].replace(/^(['"])(.*)\1$/, '$2')
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

/** Observations, ordinary do()s, and switch settings (which do not count as known). */
export interface RuleState {
  readonly observed: Assignment
  readonly interventions: Assignment
  readonly setting: Assignment
}

export function initialRuleState(c: LoadedCase, step: RuleStep): RuleState {
  const set = clampSplit(step).set
  // A symbolic step holds at every value: a known variable starts at 1, or at its first value when 1 is not one.
  const symbolicValue = (id: string): Value => {
    const values = domainValues(getVariable(c.model, id).domain)
    return values.find((v) => formatValue(v) === '1' || String(v) === '1') ?? values[0]
  }
  const initialValue = (id: string): Value => (step.symbolic !== undefined ? symbolicValue(id) : valueOfText(c, id, equationValue(step, id) ?? '1'))
  const doValue = (id: string): Value => {
    const v = step.equal?.[0].do?.[id]
    if (v === undefined) return initialValue(id)
    return coerceToDomain(getVariable(c.model, id), v)
  }
  return {
    observed: Object.fromEntries(step.given.filter((id) => !set.includes(id)).map((id) => [id, initialValue(id)])),
    interventions: Object.fromEntries(set.map((id) => [id, doValue(id)])),
    setting: {},
  }
}

/** Values drawn inside the nodes, not their probabilities. A switch setting wins over observation. */
export function nodeValues({ observed, interventions, setting }: RuleState): Assignment {
  return { ...observed, ...interventions, ...setting }
}

/**
 * Rebuild the common conditions and do()s from the menu, retaining the written order. The item
 * compared by the rule stays where it was written (e.g. do(Z) on one side, observed Z on the other).
 */
export function equationUnder(step: RuleStep, { observed, interventions, setting }: RuleState): readonly [RuleSide, RuleSide] | undefined {
  if (step.equal === undefined) return undefined
  const [left, right] = step.equal
  const givenParts = [conditions(left), conditions(right)] as const
  const variable = (part: string): string | undefined => conditionAssignment(part)?.[0]
  const commonActs = new Set(setInExpression(step))
  const compared = new Set([
    ...givenParts.flatMap((parts, i) => parts.filter((part) => !givenParts[1 - i].includes(part)).map(variable).filter((id) => id !== undefined)),
    ...[left, right].flatMap((s) => Object.keys(s.do ?? {}).filter((id) => !commonActs.has(id))),
  ])
  const comparedValue = (id: string): Value | undefined => setting[id] ?? observed[id]
  const commonGiven = Object.entries(observed).filter(([id]) => !(id in interventions) && !compared.has(id))
  const commonDo = Object.entries(interventions).filter(([id]) => !compared.has(id))
  const assignment = (id: string, v: Value): string => observationFormula({ [id]: v })!
  const side = (s: RuleSide, parts: readonly string[]): RuleSide => {
    const given = parts.flatMap((part) => {
      const id = variable(part)
      if (id === undefined) return [part]
      if (compared.has(id)) {
        const v = comparedValue(id)
        return [v === undefined ? part : assignment(id, v)]
      }
      return id in observed && !(id in interventions) ? [assignment(id, observed[id])] : []
    })
    for (const [id, v] of commonGiven) if (!parts.some((part) => variable(part) === id)) given.push(assignment(id, v))
    const acts: Record<string, Value> = {}
    for (const [id, v] of Object.entries(s.do ?? {})) {
      if (compared.has(id)) acts[id] = comparedValue(id) ?? v
      else if (id in interventions) acts[id] = interventions[id]
    }
    for (const [id, v] of commonDo) if (!(id in acts)) acts[id] = v
    return { event: s.event, ...(given.length === 0 ? {} : { given: given.join(' and ') }), ...(Object.keys(acts).length === 0 ? {} : { do: acts }) }
  }
  return [side(left, givenParts[0]), side(right, givenParts[1])]
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

/** The switch test's reading under the current state, or undefined when the step tests no switch. */
export function switchReading(c: LoadedCase, prior: Prior, step: RuleStep, { observed, interventions, setting }: RuleState): SwitchReading | undefined {
  const switches = step.switches ?? []
  const nodes = switches.map(switchId)
  const target = step.pair.find((id) => !nodes.includes(id))
  if (target === undefined || !step.pair.some((id) => nodes.includes(id))) return undefined
  const first = step.equal?.[0].event
  const event = first !== undefined && first.split('=')[0]?.trim() === target ? first : `${target}=1`
  /** The prediction with `acts` set by do() on top of the expression's, observed switched variables read at `at`. */
  const read = (acts: Assignment, at: Assignment): SwitchQuery => {
    const doAll = { ...interventions, ...acts }
    const given = observationFormula(Object.fromEntries(Object.entries(observed).filter(([id]) => !(id in doAll)).map(([id, v]) => [id, at[id] ?? v])))
    return readQuery(c, prior, { event, given, ...(Object.keys(doAll).length === 0 ? {} : { do: doAll }) })
  }
  const close = (a: SwitchQuery, b: SwitchQuery): boolean | undefined =>
    a.value === undefined || b.value === undefined ? undefined : Math.abs(a.value - b.value) < SIDE_TOLERANCE
  const off = read({}, setting)
  const seen = Object.fromEntries(switches.filter((id) => id in observed && !(id in interventions)).map((id) => [id, setting[id] ?? observed[id]]))
  const differs = allSettings(c, switches).some((a) => close(read(a, a), read({}, a)) === false)
  if (Object.keys(setting).length === 0) return { switches: nodes, target, off, seen, now: off, differs }
  const on = read(setting, setting)
  return { switches: nodes, target, off, seen, on, same: close(off, on), now: on, differs }
}
