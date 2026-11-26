import { ModalEvaluator } from './evaluate.ts'
import type { Formula } from './formula.ts'
import type { ModalModel } from './model.ts'
import { checkSystem } from './model.ts'

/**
 * Spheres from a numeric similarity: each atom has a weight for matching the centre's particular fact,
 * and each law a cost for violating it (a "miracle"). A world's distance from the centre is the sum of
 * the weights of the atoms on which it differs from the centre plus the costs of the laws false at it.
 * Worlds at the same distance share a ring, and the rings stacked from near to far are the spheres.
 *
 * This is only a numeric stand-in for Lewis's (1979) priorities among kinds of similarity, there so a
 * reader can move the weights and watch Fine's Nixon counterexample appear and disappear.
 */

export interface Law {
  readonly formula: Formula
  /** Default 1. */
  readonly cost?: number
}

export interface Similarity {
  /** Atom → weight for differing from the centre on it; an atom left out weighs 1. */
  readonly weights?: Readonly<Record<string, number>>
  readonly laws?: readonly Law[]
}

/** How far one world lies from the centre, and why. */
export interface WorldDistance {
  readonly world: string
  readonly distance: number
  /** Atoms on which it differs from the centre. */
  readonly mismatches: readonly string[]
  /** Indexes (into `laws`) of the laws false at it. */
  readonly violations: readonly number[]
}

const weightOf = (s: Similarity, atom: string): number => s.weights?.[atom] ?? 1

/** Each world's distance from `center`, in world order. */
export function distances(model: ModalModel, center: string, similarity: Similarity): WorldDistance[] {
  const ev = new ModalEvaluator(model)
  const here = new Set(model.valuation[center] ?? [])
  const laws = similarity.laws ?? []
  return model.worlds.map((world) => {
    const there = new Set(model.valuation[world] ?? [])
    const mismatches = model.atoms.filter((a) => here.has(a) !== there.has(a))
    const violations = laws.flatMap((law, i) => (ev.holds(law.formula, world) ? [] : [i]))
    const distance = mismatches.reduce((d, a) => d + weightOf(similarity, a), 0) + violations.reduce((d, i) => d + ((laws[i] as Law).cost ?? 1), 0)
    return { world, distance, mismatches, violations }
  })
}

/**
 * The spheres around `center`, innermost first: the k-th holds every world within the k-th smallest
 * distance. The innermost is the centre's ring (the centre and anything no farther than it); it is
 * {center} alone, strongly centred, when every other world is farther.
 */
export function similaritySpheres(model: ModalModel, center: string, similarity: Similarity): string[][] {
  const ds = distances(model, center, similarity)
  const own = (ds.find((d) => d.world === center) as WorldDistance).distance
  const radii = [...new Set(ds.map((d) => Math.max(d.distance, own)))].sort((x, y) => x - y)
  const spheres = radii.map((r) => ds.filter((d) => d.distance <= r).map((d) => d.world))
  checkSystem(model.worlds, center, spheres, 'weak')
  return spheres
}

/** The same model with `center`'s spheres drawn from `similarity` (R there: every world). */
export function withSimilaritySpheres(model: ModalModel, center: string, similarity: Similarity): ModalModel {
  const spheres = similaritySpheres(model, center, similarity)
  return {
    ...model,
    spheres: { ...model.spheres, [center]: spheres },
    access: { ...model.access, [center]: spheres[spheres.length - 1] as string[] },
  }
}
