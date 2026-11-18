import type { Expr } from './expr.ts'
import { containsDo } from './expr.ts'
import type { Evaluation, Interventions } from './evaluate.ts'
import { evaluate } from './evaluate.ts'
import { holdsIn, toFormula } from './formula.ts'
import type { CausalModel } from './model.ts'
import { getVariable } from './model.ts'
import type { Assignment, Value } from './types.ts'
import { problem } from './errors.ts'
import { ModelError, coerceToDomain, domainValues, enumerateAssignments, requireValue, subsetsBySize, valuesEqual } from './values.ts'

/**
 * Actual causation in a deterministic context (M, u).
 *
 * - `butfor`: X⃗=x⃗ and φ hold, and some x⃗' gives (M,u) ⊨ [X⃗←x⃗']¬φ (no minimality).
 * - `hp-modified`: Halpern's modified definition (Halpern 2015; Actual Causality, 2016, Def. 2.2.1
 *   with AC2(a^m)): AC1 X⃗=x⃗ and φ hold; AC2(a^m) there are W⃗ ⊆ V∖X⃗ and x⃗' such that, with W⃗
 *   held at its actual values w⃗*, (M,u) ⊨ [X⃗←x⃗', W⃗←w⃗*]¬φ; AC3 no strict subset of X⃗ satisfies
 *   AC1 and AC2(a^m).
 * - `hp-original` / `hp-updated`: Halpern, Actual Causality (2016), §2.2, Def. 2.2.1 with AC2(a)
 *   and AC2(b^o) (original, Halpern & Pearl 2001) or AC2(b^u) (updated, Halpern & Pearl 2005,
 *   Def. 3.1). Quoting §2.2:
 *     "AC2(a). There is a partition of V (the set of endogenous variables) into two disjoint
 *      subsets Z⃗ and W⃗ (so that Z⃗ ∩ W⃗ = ∅) with X⃗ ⊆ Z⃗ and a setting x⃗' and w⃗ of the variables
 *      in X⃗ and W⃗, respectively, such that (M,u) ⊨ [X⃗←x⃗', W⃗←w⃗]¬φ."
 *     "AC2(b^o). If z⃗* is such that (M,u) ⊨ Z⃗=z⃗*, then for all subsets Z⃗' of Z⃗ − X⃗, we have
 *      (M,u) ⊨ [X⃗←x⃗, W⃗←w⃗, Z⃗'←z⃗*]φ."
 *     "AC2(b^u). If z⃗* is such that (M,u) ⊨ Z⃗=z⃗*, then for all subsets W⃗' of W⃗ and subsets Z⃗'
 *      of Z⃗ − X⃗, we have (M,u) ⊨ [X⃗←x⃗, W⃗'←w⃗, Z⃗'←z⃗*]φ."
 *   AC3 minimality is checked against the same AC1 + AC2 variant. Unlike AC2(a^m), w⃗ ranges over
 *   all settings of W⃗, not only the actual ones.
 * - `hp-normality`: as `hp-modified`, but the witness world s_{X⃗←x⃗',W⃗←w⃗*,u} must be at least as
 *   normal as the actual world s_u (AC2+(a^m), Halpern & Hitchcock 2015; Actual Causality §3.2).
 *   See `atLeastAsNormal` for the ordering used here.
 *
 * Causes are conjunctions of primitive events over endogenous variables; the effect φ is an
 * intervention-free boolean combination of primitive events.
 *
 * Cost: the search tries subsets W⃗ of the other endogenous variables, and under hp-original and
 * hp-updated also every setting w⃗ of W⃗ and every subset inside AC2(b), so it grows faster than
 * 5^n in the number n of other endogenous variables (hp-modified and but-for stay near 2^n). A
 * search may therefore make at most MAX_EVALUATIONS model evaluations, counting each enumerated
 * subset or setting as one; past that it throws a ModelError after about a second instead of
 * running on. On a chain of boolean variables where every candidate fails (the worst case) that
 * leaves room for about six endogenous variables under hp-original and hp-updated and about nine
 * under hp-modified and hp-normality; models that find a witness early get further. MAX_ENDOGENOUS
 * is a hard ceiling on top of the budget.
 */

export type CausalTheory = 'butfor' | 'hp-original' | 'hp-updated' | 'hp-modified' | 'hp-normality'

/**
 * `cause`: X⃗=x⃗ is a cause. `part-of-cause`: not itself a cause, but its conjuncts are part of
 * a (larger) cause, as with each single fire source in the disjunctive forest fire.
 * `not-cause`: neither. `butfor` only returns `cause` or `not-cause`.
 */
export type CausalVerdict = 'cause' | 'part-of-cause' | 'not-cause'

/** Default (normal) value per variable. Variables without an entry are never deviant. */
export type Normality = Assignment

/**
 * Evidence for AC2: hold W⃗ at w⃗, set X⃗ to x⃗', and φ fails. Under hp-modified and hp-normality
 * w⃗ is W⃗'s actual value; under hp-original and hp-updated it may be any setting passing AC2(b).
 */
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

/** The work one `actualCause` call may do, counted in model evaluations and enumerated subsets or settings. */
export const MAX_EVALUATIONS = 1_000_000

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
        throw new ModelError(problem('cause-not-conjunction', { cause }))
      }
      if (Object.hasOwn(raw, id)) throw new ModelError(problem('cause-repeats', { id }))
      raw[id] = value
    }
  } else {
    Object.assign(raw, cause)
  }
  const out: Record<string, Value> = {}
  for (const [id, value] of Object.entries(raw)) {
    const variable = getVariable(model, id)
    if (variable.kind !== 'endogenous') throw new ModelError(problem('cause-not-endogenous', { id }))
    out[id] = coerceToDomain(variable, value)
  }
  if (Object.keys(out).length === 0) throw new ModelError(problem('cause-empty', {}))
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
  /** AC2 variant: `m` = AC2(a^m); `o`/`u` = AC2(a) with AC2(b^o)/AC2(b^u). */
  readonly ac2: 'm' | 'o' | 'u'
  readonly theory: CausalTheory
  /** Work left, in evaluations; see MAX_EVALUATIONS. */
  readonly budget: { left: number }
}

/** A fresh work budget of MAX_EVALUATIONS; one call, or one `blame` over all its contexts, shares one. */
export function newBudget(): { left: number } {
  return { left: MAX_EVALUATIONS }
}

function charge(setup: Setup, units: number): void {
  setup.budget.left -= units
  if (setup.budget.left < 0) {
    throw new ModelError(problem('search-budget', { theory: setup.theory, limit: MAX_EVALUATIONS }))
  }
}

/** One counted evaluation. */
function run(setup: Setup, interventions: Interventions): Evaluation {
  charge(setup, 1)
  return evaluate(setup.model, setup.context, interventions)
}

/** Subsets of `items`, charged before they are built. */
function subsets<T>(setup: Setup, items: readonly T[]): T[][] {
  charge(setup, 2 ** items.length)
  return subsetsBySize(items)
}

/** Every setting of the given variables, charged before they are built. */
function settings(setup: Setup, ids: readonly string[]): Record<string, Value>[] {
  const variables = ids.map((id) => getVariable(setup.model, id))
  charge(setup, variables.reduce((n, v) => n * domainValues(v.domain).length, 1))
  return [...enumerateAssignments(variables)]
}

/** All settings x⃗' of the variables in `cause` other than the actual x⃗. */
function alternatives(setup: Setup, cause: Assignment): Record<string, Value>[] {
  const ids = Object.keys(cause)
  return settings(setup, ids).filter(
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

/** AC2(b^o) / AC2(b^u): φ survives X⃗←x⃗ with (subsets of) W⃗←w⃗ and any Z⃗'⊆Z⃗−X⃗ at actual values. */
function sufficient(setup: Setup, cause: Assignment, W: readonly string[], w: Assignment): boolean {
  const { model, actual, effect } = setup
  const zRest = model.endogenous.filter((id) => !Object.hasOwn(cause, id) && !W.includes(id))
  const wSubsets = setup.ac2 === 'u' ? subsets(setup, W) : [W]
  for (const Wp of wSubsets) {
    for (const Zp of subsets(setup, zRest)) {
      const world = run(setup, { ...restrict(actual, Zp), ...restrict(w, Wp), ...cause }).values
      if (!holdsIn(world, effect)) return false
    }
  }
  return true
}

/**
 * AC2(a^m) or AC2(a)+AC2(b), optionally with W⃗ forced empty (but-for). With `maxW`, only sets W⃗
 * of at most that size are tried (and charged); W⃗ is still tried smallest first.
 */
function findWitness(setup: Setup, cause: Assignment, allowW: boolean, maxW?: number): Witness | undefined {
  const { model } = setup
  const others = model.endogenous.filter((id) => !Object.hasOwn(cause, id))
  let candidates: string[][]
  if (!allowW) candidates = [[]]
  else if (maxW === undefined || maxW >= others.length) candidates = subsets(setup, others)
  else {
    candidates = subsetsBySize(others).filter((s) => s.length <= maxW)
    charge(setup, candidates.length)
  }
  const alts = alternatives(setup, cause)
  for (const W of candidates) {
    const choices = setup.ac2 === 'm' ? [restrict(setup.actual, W)] : settings(setup, W)
    for (const w of choices) {
      if (setup.ac2 !== 'm' && !sufficient(setup, cause, W, w)) continue
      for (const xPrime of alts) {
        const world = run(setup, { ...w, ...xPrime }).values
        if (!holdsIn(world, setup.effect) && setup.admissible(world)) return { W, w, xPrime, world }
      }
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
  for (const subset of subsets(setup, ids)) {
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

/** The parsed query and search state `actualCause` and `responsibility` share. */
function prepare(
  model: CausalModel,
  context: Assignment,
  query: ActualCauseQuery,
  theory: CausalTheory,
  options: ActualCauseOptions,
  budget: { left: number },
): { readonly setup: Setup; readonly cause: Record<string, Value> } {
  if (model.endogenous.length > MAX_ENDOGENOUS) {
    throw new ModelError(problem('too-many-endogenous', { limit: MAX_ENDOGENOUS }))
  }
  const cause = parseCause(model, query.cause)
  const effect = toFormula(model, query.effect)
  if (containsDo(effect)) throw new ModelError(problem('effect-has-intervention', {}))
  const actual = evaluate(model, context).values

  let admissible: (world: Assignment) => boolean = () => true
  if (theory === 'hp-normality') {
    const normality = options.normality
    if (normality === undefined) throw new ModelError(problem('normality-missing', {}))
    for (const [id, value] of Object.entries(normality)) coerceToDomain(getVariable(model, id), value)
    admissible = (world) => atLeastAsNormal(world, actual, normality)
  }
  const ac2 = theory === 'hp-original' ? 'o' : theory === 'hp-updated' ? 'u' : 'm'
  return { setup: { model, context, effect, actual, admissible, ac2, theory, budget }, cause }
}

export function actualCause(
  model: CausalModel,
  context: Assignment,
  query: ActualCauseQuery,
  theory: CausalTheory,
  options: ActualCauseOptions = {},
): ActualCauseResult {
  const { setup, cause } = prepare(model, context, query, theory, options, newBudget())
  const { actual } = setup

  if (theory === 'butfor') {
    const check = checkButFor(setup, cause)
    return { theory, verdict: check.isCause ? 'cause' : 'not-cause', actual, check }
  }

  const check = checkHp(setup, cause)
  if (check.isCause) return { theory, verdict: 'cause', actual, check }
  if (!check.ac1 || check.smallerCause !== undefined) return { theory, verdict: 'not-cause', actual, check }

  // Part of a cause: some cause X⃗=x⃗ ∧ Y⃗=y⃗* extends it (Y⃗ held at actual values).
  const rest = model.endogenous.filter((id) => !Object.hasOwn(cause, id))
  for (const extra of subsets(setup, rest)) {
    if (extra.length === 0) continue
    const larger = checkHp(setup, { ...cause, ...restrict(actual, extra) })
    if (larger.isCause) return { theory, verdict: 'part-of-cause', actual, check, containedIn: larger }
  }
  return { theory, verdict: 'not-cause', actual, check }
}

/** The HP definitions, which are the ones degree of responsibility is defined for. */
export type ResponsibilityTheory = Exclude<CausalTheory, 'butfor'>

export interface ResponsibilityResult {
  readonly theory: ResponsibilityTheory
  /** 0, or 1/k. */
  readonly degree: number
  /**
   * |W⃗| + |X⃗| minimized over causes X⃗=x⃗ that contain X=x as a conjunct and their witnesses; for
   * the single event itself this is |W⃗| + 1, Halpern's k + 1 in Def. 6.1.1. Absent when the degree is 0.
   */
  readonly k?: number
  /** The cause X⃗=x⃗ attaining k: X=x itself, or X=x with other variables at their actual values. */
  readonly cause?: Assignment
  /** A witness of that cause with the smallest W⃗. */
  readonly witness?: Witness
  /** The same verdict `actualCause` gives for X=x. */
  readonly verdict: CausalVerdict
  readonly actual: Assignment
}

const causeKey = (cause: Assignment): string => Object.keys(cause).sort().join('\u0000')

/**
 * Degree of responsibility in one setting (M, u) of an already prepared single-event query, using
 * (and charging) `setup.budget`.
 *
 * Halpern, Actual Causality (2016), Def. 6.1.1 (original) and Def. 6.1.6 (updated, modified): dr is
 * 0 when X=x is not (part of) a cause, else 1/k with k = |W⃗| + |X⃗| minimal over causes X⃗=x⃗
 * containing X=x and their witnesses (W⃗, w⃗, x⃗'). Under the original definition every cause is a
 * single conjunct (Halpern 2016, Theorem 2.2.3(d)), so k = |W⃗| + 1 for the minimal witness of X=x and
 * this is Def. 6.1.1. hp-normality uses the modified definition with witnesses restricted to worlds
 * at least as normal as the actual one, as Halpern suggests after Def. 6.1.1 (p. 171).
 *
 * Search: X=x alone first (the witness search tries W⃗ smallest first, so the first witness is
 * minimal); when X=x alone satisfies AC2, AC3 rules out every larger cause containing it. Otherwise
 * extensions X=x ∧ Y⃗=y⃗* by increasing |Y⃗|, stopping once |X⃗| alone reaches the best k, and asking
 * each extension only for witnesses small enough to improve on it.
 */
function responsibilityIn(setup: Setup, cause: Record<string, Value>, theory: ResponsibilityTheory): ResponsibilityResult {
  const { model, actual } = setup
  const none = (verdict: CausalVerdict): ResponsibilityResult => ({ theory, degree: 0, verdict, actual })
  if (!ac1(setup, cause)) return none('not-cause')

  // AC2 with W⃗ unrestricted, per conjunction (all at actual values, so keyed by variables).
  const ac2Memo = new Map<string, Witness | null>()
  const ac2 = (c: Assignment): Witness | undefined => {
    const key = causeKey(c)
    const known = ac2Memo.get(key)
    if (known !== undefined) return known ?? undefined
    const found = findWitness(setup, c, true)
    ac2Memo.set(key, found ?? null)
    return found
  }
  // AC3: no strict, non-empty sub-conjunction satisfies AC2 (AC1 is inherited).
  const minimal = (c: Assignment): boolean => {
    const ids = Object.keys(c)
    for (const subset of subsets(setup, ids)) {
      if (subset.length === 0 || subset.length === ids.length) continue
      if (ac2(restrict(c, subset)) !== undefined) return false
    }
    return true
  }

  // X=x alone satisfies AC2: it is a cause, and no larger conjunction containing it is one (AC3).
  const alone = ac2(cause)
  if (alone !== undefined) {
    const k = alone.W.length + 1
    return { theory, degree: 1 / k, k, cause, witness: alone, verdict: 'cause', actual }
  }

  // Halpern Thm 2.2.3(d): under the original definition part of a cause is a cause, so no larger X⃗ can be one.
  if (setup.ac2 === 'o') return none('not-cause')

  let best: { k: number; cause: Assignment; witness: Witness } | undefined
  const rest = model.endogenous.filter((id) => !Object.hasOwn(cause, id))
  const extensions = subsetsBySize(rest)
  for (const extra of extensions) {
    if (extra.length === 0) continue
    // |X⃗| = 1 + |extra| alone already reaches the best k: no larger extension can improve on it.
    if (best !== undefined && 1 + extra.length >= best.k) break
    charge(setup, 1)
    const larger = { ...cause, ...restrict(actual, extra) }
    const witness =
      best === undefined ? ac2(larger) : findWitness(setup, larger, true, best.k - 2 - extra.length)
    if (witness === undefined || !minimal(larger)) continue
    const k = witness.W.length + 1 + extra.length
    if (best === undefined || k < best.k) best = { k, cause: larger, witness }
  }
  if (best === undefined) return none('not-cause')
  return { theory, degree: 1 / best.k, k: best.k, cause: best.cause, witness: best.witness, verdict: 'part-of-cause', actual }
}

/** Parse and check a responsibility query: an HP theory and a single event X=x. */
function prepareResponsibility(
  model: CausalModel,
  context: Assignment,
  query: ActualCauseQuery,
  theory: ResponsibilityTheory,
  options: ActualCauseOptions,
  budget: { left: number },
): { readonly setup: Setup; readonly cause: Record<string, Value>; readonly theory: ResponsibilityTheory } {
  // The type excludes but-for; the check is for JS callers.
  if ((theory as CausalTheory) === 'butfor') throw new ModelError(problem('responsibility-butfor', {}))
  const prepared = prepare(model, context, query, theory, options, budget)
  if (Object.keys(prepared.cause).length !== 1) {
    const text = typeof query.cause === 'string' ? query.cause : Object.entries(query.cause).map(([id, v]) => `${id}=${String(v)}`).join(' and ')
    throw new ModelError(problem('responsibility-single-event', { cause: text }))
  }
  return { ...prepared, theory }
}

/**
 * Degree of responsibility of a single event X=x for φ in (M, u): Halpern, Actual Causality (2016),
 * Def. 6.1.1 and 6.1.6; see `responsibilityIn` for the search. Its verdict is `actualCause`'s. The
 * work is bounded by MAX_EVALUATIONS as in `actualCause`; past it a ModelError (`search-budget`).
 */
export function responsibility(
  model: CausalModel,
  context: Assignment,
  query: ActualCauseQuery,
  theory: ResponsibilityTheory,
  options: ActualCauseOptions = {},
): ResponsibilityResult {
  const prepared = prepareResponsibility(model, context, query, theory, options, newBudget())
  return responsibilityIn(prepared.setup, prepared.cause, prepared.theory)
}

/** `responsibility` charging a budget shared with other calls (one `blame` over many contexts). */
export function responsibilityWithBudget(
  model: CausalModel,
  context: Assignment,
  query: ActualCauseQuery,
  theory: ResponsibilityTheory,
  options: ActualCauseOptions,
  budget: { left: number },
): ResponsibilityResult {
  const prepared = prepareResponsibility(model, context, query, theory, options, budget)
  return responsibilityIn(prepared.setup, prepared.cause, prepared.theory)
}

/** Why a world is not a witness; see `witnessStatus`. */
export type WitnessFailure =
  /** AC1 fails: the cause or the effect does not hold in the actual world. */
  | 'not-actual'
  /** Not every cause variable is set, or each is set at its actual value. */
  | 'cause-not-changed'
  /** But-for allows no held variables. */
  | 'holds-others'
  /** hp-modified, hp-normality: a held variable is not at its actual value (`ids`). */
  | 'not-at-actual'
  /** The effect still holds in this world. */
  | 'effect-holds'
  /** hp-original, hp-updated: AC2(b^o) or AC2(b^u) fails for these held values. */
  | 'not-sufficient'
  /** hp-normality: this world is not at least as normal as the actual one. */
  | 'less-normal'

export interface WitnessStatus {
  readonly witness: boolean
  readonly failure?: WitnessFailure
  /** For `not-at-actual`: the held variables away from their actual values. */
  readonly ids?: readonly string[]
  /** The cause variables' setting x⃗′ in this world (those of them that are set). */
  readonly xPrime: Assignment
  /** The other set variables, W⃗ held at w⃗. */
  readonly held: Assignment
  /** The world s_{X⃗←x⃗′, W⃗←w⃗, u}. */
  readonly world: Assignment
  readonly actual: Assignment
}

/**
 * Whether the world `interventions` sets is a witness for AC2 of `query` under `theory`: the cause
 * variables set to x⃗′ (not all at their actual values), every other set variable read as W⃗ held at
 * w⃗, and φ failing there; hp-modified and hp-normality need w⃗ = w⃗* (actual values), hp-original
 * and hp-updated need AC2(b^o) / AC2(b^u) for that W⃗ and w⃗, hp-normality needs the world at least
 * as normal as the actual one, and but-for holds nothing. It is the check `actualCause` makes for
 * each candidate it tries, so a world it accepts is one `actualCause` could have found.
 */
export function witnessStatus(
  model: CausalModel,
  context: Assignment,
  query: ActualCauseQuery,
  theory: CausalTheory,
  interventions: Assignment,
  normality?: Normality,
): WitnessStatus {
  const cause = parseCause(model, query.cause)
  const effect = toFormula(model, query.effect)
  if (containsDo(effect)) throw new ModelError(problem('effect-has-intervention', {}))
  const actual = evaluate(model, context).values
  const xPrime: Record<string, Value> = {}
  const held: Record<string, Value> = {}
  for (const [id, raw] of Object.entries(interventions)) {
    const value = coerceToDomain(getVariable(model, id), raw)
    if (Object.hasOwn(cause, id)) xPrime[id] = value
    else held[id] = value
  }
  const world = evaluate(model, context, interventions).values
  const out = (failure?: WitnessFailure, ids?: readonly string[]): WitnessStatus => ({
    witness: failure === undefined,
    failure,
    ids,
    xPrime,
    held,
    world,
    actual,
  })
  let admissible: (w: Assignment) => boolean = () => true
  if (theory === 'hp-normality') {
    if (normality === undefined) throw new ModelError(problem('normality-missing', {}))
    admissible = (w) => atLeastAsNormal(w, actual, normality)
  }
  const ac2 = theory === 'hp-original' ? 'o' : theory === 'hp-updated' ? 'u' : 'm'
  const setup: Setup = { model, context, effect, actual, admissible, ac2, theory, budget: { left: MAX_EVALUATIONS } }
  if (!ac1(setup, cause)) return out('not-actual')
  const ids = Object.keys(cause)
  if (!ids.every((id) => Object.hasOwn(xPrime, id)) || ids.every((id) => valuesEqual(xPrime[id], cause[id]))) return out('cause-not-changed')
  const W = Object.keys(held)
  if (theory === 'butfor' && W.length > 0) return out('holds-others')
  if (ac2 === 'm') {
    const off = W.filter((id) => !valuesEqual(held[id], requireValue(actual, id)))
    if (off.length > 0) return out('not-at-actual', off)
  }
  if (holdsIn(world, effect)) return out('effect-holds')
  if (ac2 !== 'm' && !sufficient(setup, cause, W, held)) return out('not-sufficient')
  if (!admissible(world)) return out('less-normal')
  return out()
}
