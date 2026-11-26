/**
 * Properties of a finite binary relation R ⊆ X × X, each with the elements that witness a failure.
 * Shared by the modal frame conditions and, later, the set-theory relation views. Pure.
 */

export interface FiniteRelation {
  /** The carrier X, in a fixed order. */
  readonly elements: readonly string[]
  /** The pairs (a, b) with a R b. */
  readonly pairs: readonly (readonly [string, string])[]
}

/** A property's verdict: `witness` lists the elements that break it, in the order the property names them. */
export type RelationCheck = { readonly holds: true } | { readonly holds: false; readonly witness: readonly string[] }

export type RelationProperty = 'serial' | 'reflexive' | 'irreflexive' | 'symmetric' | 'transitive' | 'euclidean'

/** Every property this module checks. */
export const RELATION_PROPERTIES: readonly RelationProperty[] = ['serial', 'reflexive', 'irreflexive', 'symmetric', 'transitive', 'euclidean']

const HOLDS: RelationCheck = { holds: true }

function fails(...witness: string[]): RelationCheck {
  return { holds: false, witness }
}

/** Membership test for the pairs. */
function relates(r: FiniteRelation): (a: string, b: string) => boolean {
  const set = new Set(r.pairs.map(([a, b]) => `${a}\u0000${b}`))
  return (a, b) => set.has(`${a}\u0000${b}`)
}

/**
 * Whether `r` has `property`. Witnesses: serial, reflexive and irreflexive name the one element x
 * (no x R y; not x R x; x R x); symmetric names (x, y) with x R y but not y R x; transitive names
 * (x, y, z) with x R y, y R z but not x R z; euclidean names (x, y, z) with x R y, x R z but not y R z.
 * The first witness in the element order is returned.
 */
export function checkRelation(r: FiniteRelation, property: RelationProperty): RelationCheck {
  const has = relates(r)
  const xs = r.elements
  switch (property) {
    case 'serial':
      for (const x of xs) if (!xs.some((y) => has(x, y))) return fails(x)
      return HOLDS
    case 'reflexive':
      for (const x of xs) if (!has(x, x)) return fails(x)
      return HOLDS
    case 'irreflexive':
      for (const x of xs) if (has(x, x)) return fails(x)
      return HOLDS
    case 'symmetric':
      for (const x of xs) for (const y of xs) if (has(x, y) && !has(y, x)) return fails(x, y)
      return HOLDS
    case 'transitive':
      for (const x of xs) for (const y of xs) for (const z of xs) if (has(x, y) && has(y, z) && !has(x, z)) return fails(x, y, z)
      return HOLDS
    case 'euclidean':
      for (const x of xs) for (const y of xs) for (const z of xs) if (has(x, y) && has(x, z) && !has(y, z)) return fails(x, y, z)
      return HOLDS
  }
}
