import { ModalError, modalProblem } from './errors.ts'
import type { Formula } from './formula.ts'
import type { ModalModel } from './model.ts'

/**
 * Truth at a world, by Garson's truth conditions (Modal Logic for Philosophers, 2nd ed., pp. 59–66),
 * and the counterfactual `>` on systems of spheres (pp. 455–459):
 *
 * - a_w(□A) = T iff a_v(A) = T for every v with wRv; a_w(◇A) = T iff a_v(A) = T for some such v.
 * - Lewis: A > B is true at w iff no sphere around w holds an A-world (vacuously), or the smallest
 *   sphere S that does has every A-world in it a B-world. Finite systems always have that smallest
 *   sphere, so the limit assumption holds.
 * - Stalnaker: the same, but S ∩ |A| must be one world; when it is several, the selection is
 *   undefined and the engine reports `not-unique` with the candidates instead of choosing.
 */

export type ConditionalSemantics = 'lewis' | 'stalnaker'

export interface EvalOptions {
  /** How `>` is read; default `lewis`. */
  readonly semantics?: ConditionalSemantics
}

/** How a counterfactual A > B came out at one world. */
export interface CounterfactualStep {
  /** The A-worlds any sphere around the world reaches, in world order. */
  readonly antecedentWorlds: readonly string[]
  /** Index (0 = innermost) of the smallest sphere holding an A-world; undefined when none does. */
  readonly sphere: number | undefined
  /** The selection f(|A|, w) = S ∩ |A|: the closest A-worlds. Empty when vacuous. */
  readonly selected: readonly string[]
  /** The selected worlds where B is false. */
  readonly failures: readonly string[]
  /** No sphere holds an A-world, so A > B is true vacuously. */
  readonly vacuous: boolean
  readonly value: boolean
}

/** Why a formula has its value at a world: the values of its parts, and the worlds that decide modal steps. */
export interface Explanation {
  readonly formula: Formula
  readonly world: string
  readonly value: boolean
  /** The parts' explanations: for □ and ◇ the argument at every accessible world; for > the consequent at every selected world. */
  readonly children: readonly Explanation[]
  /** □ and ◇: the worlds this world can see. */
  readonly accessible?: readonly string[]
  /** □ false: an accessible world where the argument is false; ◇ true: one where it is true. */
  readonly witness?: string
  readonly counterfactual?: CounterfactualStep
}

/** Evaluates formulas on one model, remembering each (formula, world) value. */
export class ModalEvaluator {
  private readonly memo = new Map<Formula, Map<string, boolean>>()
  private readonly atomSets: ReadonlyMap<string, ReadonlySet<string>>
  readonly semantics: ConditionalSemantics
  readonly model: ModalModel

  constructor(model: ModalModel, options: EvalOptions = {}) {
    this.model = model
    this.semantics = options.semantics ?? 'lewis'
    this.atomSets = new Map(model.worlds.map((w) => [w, new Set(model.valuation[w] ?? [])]))
  }

  /** The worlds `world` can see; throws when R is not defined there. */
  accessible(world: string): readonly string[] {
    this.known(world)
    const succ = this.model.access[world]
    if (succ === undefined) throw new ModalError(modalProblem('no-sphere-system', { world }))
    return succ
  }

  /** The spheres around `world`, innermost first; throws when it has none. */
  spheres(world: string): readonly (readonly string[])[] {
    this.known(world)
    const system = this.model.spheres?.[world]
    if (system === undefined) throw new ModalError(modalProblem('no-sphere-system', { world }))
    return system
  }

  holds(f: Formula, world: string): boolean {
    let byWorld = this.memo.get(f)
    if (byWorld === undefined) {
      byWorld = new Map()
      this.memo.set(f, byWorld)
    }
    const cached = byWorld.get(world)
    if (cached !== undefined) return cached
    const value = this.compute(f, world)
    byWorld.set(world, value)
    return value
  }

  /** The worlds where `f` is true, in world order: |f|. */
  truthSet(f: Formula): string[] {
    return this.model.worlds.filter((w) => this.holds(f, w))
  }

  counterfactual(a: Formula, b: Formula, world: string): CounterfactualStep {
    const system = this.spheres(world)
    const outer = system[system.length - 1] as readonly string[]
    const antecedentWorlds = this.model.worlds.filter((v) => outer.includes(v) && this.holds(a, v))
    const sphere = system.findIndex((s) => s.some((v) => antecedentWorlds.includes(v)))
    if (sphere < 0) return { antecedentWorlds, sphere: undefined, selected: [], failures: [], vacuous: true, value: true }
    const s = system[sphere] as readonly string[]
    const selected = antecedentWorlds.filter((v) => s.includes(v))
    if (this.semantics === 'stalnaker' && selected.length > 1) {
      throw new ModalError(modalProblem('not-unique', { world, candidates: selected }))
    }
    const failures = selected.filter((v) => !this.holds(b, v))
    return { antecedentWorlds, sphere, selected, failures, vacuous: false, value: failures.length === 0 }
  }

  explain(f: Formula, world: string): Explanation {
    const value = this.holds(f, world)
    switch (f.kind) {
      case 'atom':
      case 'top':
      case 'bot':
        return { formula: f, world, value, children: [] }
      case 'not':
        return { formula: f, world, value, children: [this.explain(f.arg, world)] }
      case 'box':
      case 'dia': {
        const accessible = this.accessible(world)
        const children = accessible.map((v) => this.explain(f.arg, v))
        const deciding = f.kind === 'box' ? (value ? undefined : children.find((c) => !c.value)) : value ? children.find((c) => c.value) : undefined
        return deciding === undefined ? { formula: f, world, value, children, accessible } : { formula: f, world, value, children, accessible, witness: deciding.world }
      }
      case 'cf': {
        const step = this.counterfactual(f.left, f.right, world)
        return { formula: f, world, value, children: step.selected.map((v) => this.explain(f.right, v)), counterfactual: step }
      }
      default:
        return { formula: f, world, value, children: [this.explain(f.left, world), this.explain(f.right, world)] }
    }
  }

  private known(world: string): void {
    if (!this.atomSets.has(world)) throw new ModalError(modalProblem('unknown-world', { world }))
  }

  private compute(f: Formula, world: string): boolean {
    switch (f.kind) {
      case 'atom': {
        const set = this.atomSets.get(world)
        if (set === undefined) throw new ModalError(modalProblem('unknown-world', { world }))
        if (!this.model.atoms.includes(f.id)) throw new ModalError(modalProblem('unknown-atom', { atom: f.id }))
        return set.has(f.id)
      }
      case 'top':
        return true
      case 'bot':
        return false
      case 'not':
        return !this.holds(f.arg, world)
      case 'and':
        return this.holds(f.left, world) && this.holds(f.right, world)
      case 'or':
        return this.holds(f.left, world) || this.holds(f.right, world)
      case 'imp':
        return !this.holds(f.left, world) || this.holds(f.right, world)
      case 'iff':
        return this.holds(f.left, world) === this.holds(f.right, world)
      case 'box':
        return this.accessible(world).every((v) => this.holds(f.arg, v))
      case 'dia':
        return this.accessible(world).some((v) => this.holds(f.arg, v))
      case 'cf':
        return this.counterfactual(f.left, f.right, world).value
    }
  }
}

/** a_w(f): whether `f` is true at `world`. */
export function holds(model: ModalModel, f: Formula, world: string, options?: EvalOptions): boolean {
  return new ModalEvaluator(model, options).holds(f, world)
}

/** The intension of `f`: each world with the truth value `f` has there. */
export function intension(model: ModalModel, f: Formula, options?: EvalOptions): Record<string, boolean> {
  const ev = new ModalEvaluator(model, options)
  return Object.fromEntries(model.worlds.map((w) => [w, ev.holds(f, w)]))
}

/** |f|: the worlds where `f` is true. */
export function truthSet(model: ModalModel, f: Formula, options?: EvalOptions): string[] {
  return new ModalEvaluator(model, options).truthSet(f)
}

/** The value of `f` at `world` with its explanation tree. */
export function explain(model: ModalModel, f: Formula, world: string, options?: EvalOptions): Explanation {
  return new ModalEvaluator(model, options).explain(f, world)
}
