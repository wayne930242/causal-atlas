import type { Expr } from './expr.ts'
import { containsDo } from './expr.ts'
import { evaluate } from './evaluate.ts'
import { holdsIn, toFormula } from './formula.ts'
import type { CausalModel } from './model.ts'
import { getVariable } from './model.ts'
import type { Assignment, Value } from './types.ts'
import { ModelError, coerceToDomain, enumerateAssignments, requireValue, subsetsBySize, valuesEqual } from './values.ts'

/**
 * Actual causation in a deterministic context (M, u).
 *
 * - `butfor`: X⃗=x⃗ and φ hold, and some x⃗' gives (M,u) ⊨ [X⃗←x⃗']¬φ (no minimality).
 * - `hp-modified`: Halpern's modified definition (Halpern 2015; Actual Causality, 2016, Def. 2.2.1
 *   with AC2(a^m)): AC1 X⃗=x⃗ and φ hold; AC2(a^m) there are W⃗ ⊆ V∖X⃗ and x⃗' such that, with W⃗
 *   held at its actual values w⃗*, (M,u) ⊨ [X⃗←x⃗', W⃗←w⃗*]¬φ; AC3 no strict subset of X⃗ satisfies
 *   AC1 and AC2(a^m).
 * - `hp-normality`: as `hp-modified`, but the witness world s_{X⃗←x⃗',W⃗←w⃗*,u} must be at least as
 *   normal as the actual world s_u (AC2+(a^m), Halpern & Hitchcock 2015; Actual Causality §3.2).
 *   See `atLeastAsNormal` for the ordering used here.
 *
 * Causes are conjunctions of primitive events over endogenous variables; the effect φ is an
 * intervention-free boolean combination of primitive events.
 */

export type CausalTheory = 'butfor' | 'hp-modified' | 'hp-normality'

/**
 * `cause`: X⃗=x⃗ is a cause. `part-of-cause`: not itself a cause, but its conjuncts are part of
 * a (larger) cause, as with each single fire source in the disjunctive forest fire.
 * `not-cause`: neither. `butfor` only returns `cause` or `not-cause`.
 */
export type CausalVerdict = 'cause' | 'part-of-cause' | 'not-cause'

/** Default (normal) value per variable. Variables without an entry are never deviant. */
export type Normality = Assignment

/** Evidence for AC2: hold W⃗ at w⃗ (its actual values), set X⃗ to x⃗', and φ fails. */
export interface Witness {
  readonly W: readonly string[]
  readonly w: Assignment
  readonly xPrime: Assignment
  /** The witness world s_{X⃗←x⃗', W⃗←w⃗, u}. */
  readonly world: Assignment
}

export interface CauseCheck {
  readonly cause: Assignment
  readonly ac1: boolean
  /** A witness for AC2 (smallest W⃗ first), if any. */
  readonly witness?: Witness
  /** A strict sub-conjunction that already satisfies AC1 and AC2, violating AC3. */
  readonly smallerCause?: { readonly cause: Assignment; readonly witness: Witness }
  readonly isCause: boolean
}

export interface ActualCauseResult {
  readonly theory: CausalTheory
  readonly verdict: CausalVerdict
  readonly actual: Assignment
  readonly check: CauseCheck
  /** For `part-of-cause`: the smallest cause found that contains X⃗=x⃗. */
  readonly containedIn?: CauseCheck
}

export interface ActualCauseQuery {
  /** Conjunction of events, as `{ L: 1, MD: 1 }` or `L=1 and MD=1`. */
  readonly cause: Assignment | string
  /** The effect φ, e.g. `BS=1`. */
  readonly effect: Expr | string
}

const MAX_ENDOGENOUS = 16

/** Parse `X1=x1 and X2=x2 …` into an assignment over endogenous variables. */
export function parseCause(model: CausalModel, cause: Assignment | string): Record<string, Value> {
  const raw: Record<string, Value> = {}
  if (typeof cause === 'string') {
    const expr = toFormula(model, cause)
    const conjuncts = expr.op === 'and' ? expr.args : [expr]
    for (const c of conjuncts) {
      let id: string
      let value: Value
      if (c.op === 'var') {
        id = c.name
        value = true
      } else if (c.op === 'eq' && !c.negated && c.left.op === 'var' && c.right.op === 'const') {
        id = c.left.name
        value = c.right.value
      } else {
        throw new ModelError(`cause ${JSON.stringify(cause)} must be a conjunction of events X=x`)
      }
      if (id in raw) throw new ModelError(`cause mentions ${id} twice`)
      raw[id] = value
    }
  } else {
    Object.assign(raw, cause)
  }
  const out: Record<string, Value> = {}
  for (const [id, value] of Object.entries(raw)) {
    const variable = getVariable(model, id)
    if (variable.kind !== 'endogenous') throw new ModelError(`cause variable ${id} must be endogenous`)
    out[id] = coerceToDomain(variable, value)
  }
  if (Object.keys(out).length === 0) throw new ModelError('cause is empty')
  return out
}

function deviantSet(world: Assignment, normality: Normality): Set<string> {
  const out = new Set<string>()
  for (const [id, normal] of Object.entries(normality)) {
    const value = world[id]
    if (value !== undefined && !valuesEqual(value, normal)) out.add(id)
  }
  return out
}

/**
 * World s is at least as normal as world t iff every variable deviant in s (taking a value other
 * than its declared default) is also deviant in t: deviant(s) ⊆ deviant(t).
 *
 * Simplification: Halpern & Hitchcock (2015) take normality as a partial preorder on worlds
 * supplied with the model (typicality of values, norms, statistical defaults). We induce it from a
 * single default value per variable and compare deviant sets only, so two worlds that deviate on
 * the same variable but with different non-default values count as equally normal, and degrees
 * of deviance are ignored.
 */
export function atLeastAsNormal(s: Assignment, t: Assignment, normality: Normality): boolean {
  const deviantT = deviantSet(t, normality)
  for (const id of deviantSet(s, normality)) if (!deviantT.has(id)) return false
  return true
}

interface Setup {
  readonly model: CausalModel
  readonly context: Assignment
  readonly effect: Expr
  readonly actual: Assignment
  /** Extra constraint on witness worlds (normality); always true for hp-modified. */
  readonly admissible: (world: Assignment) => boolean
}

/** All settings x⃗' of the variables in `cause` other than the actual x⃗. */
function alternatives(model: CausalModel, cause: Assignment): Record<string, Value>[] {
  const ids = Object.keys(cause)
  return [...enumerateAssignments(ids.map((id) => getVariable(model, id)))].filter(
    (alt) => !ids.every((id) => valuesEqual(requireValue(alt, id), requireValue(cause, id))),
  )
}

function restrict(assignment: Assignment, ids: readonly string[]): Record<string, Value> {
  const out: Record<string, Value> = {}
  for (const id of ids) out[id] = requireValue(assignment, id)
  return out
}

function ac1(setup: Setup, cause: Assignment): boolean {
  return (
    Object.entries(cause).every(([id, v]) => valuesEqual(requireValue(setup.actual, id), v)) &&
    holdsIn(setup.actual, setup.effect)
  )
}

/** AC2(a^m), optionally with W⃗ forced empty (but-for). */
function findWitness(setup: Setup, cause: Assignment, allowW: boolean): Witness | undefined {
  const { model, context } = setup
  const others = model.endogenous.filter((id) => !(id in cause))
  const candidates = allowW ? subsetsBySize(others) : [[]]
  const alts = alternatives(model, cause)
  for (const W of candidates) {
    const w = restrict(setup.actual, W)
    for (const xPrime of alts) {
      const world = evaluate(model, context, { ...w, ...xPrime }).values
      if (!holdsIn(world, setup.effect) && setup.admissible(world)) return { W, w, xPrime, world }
    }
  }
  return undefined
}

function checkHp(setup: Setup, cause: Assignment): CauseCheck {
  if (!ac1(setup, cause)) return { cause, ac1: false, isCause: false }
  const witness = findWitness(setup, cause, true)
  if (witness === undefined) return { cause, ac1: true, isCause: false }
  // AC3: no strict, non-empty sub-conjunction satisfies AC1 and AC2 (AC1 is inherited).
  const ids = Object.keys(cause)
  for (const subset of subsetsBySize(ids)) {
    if (subset.length === 0 || subset.length === ids.length) continue
    const sub = restrict(cause, subset)
    const subWitness = findWitness(setup, sub, true)
    if (subWitness !== undefined) {
      return { cause, ac1: true, witness, smallerCause: { cause: sub, witness: subWitness }, isCause: false }
    }
  }
  return { cause, ac1: true, witness, isCause: true }
}

function checkButFor(setup: Setup, cause: Assignment): CauseCheck {
  if (!ac1(setup, cause)) return { cause, ac1: false, isCause: false }
  const witness = findWitness(setup, cause, false)
  return { cause, ac1: true, witness, isCause: witness !== undefined }
}

export interface ActualCauseOptions {
  /** Required for `hp-normality`. */
  readonly normality?: Normality
}

export function actualCause(
  model: CausalModel,
  context: Assignment,
  query: ActualCauseQuery,
  theory: CausalTheory,
  options: ActualCauseOptions = {},
): ActualCauseResult {
  if (model.endogenous.length > MAX_ENDOGENOUS) {
    throw new ModelError(`actual causation search is limited to ${MAX_ENDOGENOUS} endogenous variables`)
  }
  const cause = parseCause(model, query.cause)
  const effect = toFormula(model, query.effect)
  if (containsDo(effect)) throw new ModelError('the effect must not contain interventions')
  const actual = evaluate(model, context).values

  let admissible: (world: Assignment) => boolean = () => true
  if (theory === 'hp-normality') {
    const normality = options.normality
    if (normality === undefined) throw new ModelError('hp-normality needs default (normal) values')
    for (const [id, value] of Object.entries(normality)) coerceToDomain(getVariable(model, id), value)
    admissible = (world) => atLeastAsNormal(world, actual, normality)
  }
  const setup: Setup = { model, context, effect, actual, admissible }

  if (theory === 'butfor') {
    const check = checkButFor(setup, cause)
    return { theory, verdict: check.isCause ? 'cause' : 'not-cause', actual, check }
  }

  const check = checkHp(setup, cause)
  if (check.isCause) return { theory, verdict: 'cause', actual, check }
  if (!check.ac1 || check.smallerCause !== undefined) return { theory, verdict: 'not-cause', actual, check }

  // Part of a cause: some cause X⃗=x⃗ ∧ Y⃗=y⃗* extends it (Y⃗ held at actual values).
  const rest = model.endogenous.filter((id) => !(id in cause))
  for (const extra of subsetsBySize(rest)) {
    if (extra.length === 0) continue
    const larger = checkHp(setup, { ...cause, ...restrict(actual, extra) })
    if (larger.isCause) return { theory, verdict: 'part-of-cause', actual, check, containedIn: larger }
  }
  return { theory, verdict: 'not-cause', actual, check }
}
