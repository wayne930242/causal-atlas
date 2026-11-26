import { ModalError, modalProblem } from './errors.ts'

/**
 * A finite model ⟨W, R, a⟩ restricted to atoms: worlds, the atoms true at each, each world's
 * R-successors and, for conditionals, each world's system of spheres (innermost first). A world
 * with no `access` entry has no R defined there; one with no `spheres` entry has no system.
 */
export interface ModalModel {
  readonly worlds: readonly string[]
  readonly atoms: readonly string[]
  /** World → the atoms true there; every other atom is false there. */
  readonly valuation: Readonly<Record<string, readonly string[]>>
  /** World → the worlds it can see. */
  readonly access: Readonly<Record<string, readonly string[]>>
  /** World → its spheres, innermost first, each containing the one before. */
  readonly spheres?: Readonly<Record<string, readonly (readonly string[])[]>>
}

/** A frame ⟨W, R⟩: a model with no atoms. */
export interface Frame {
  readonly worlds: readonly string[]
  readonly access: Readonly<Record<string, readonly string[]>>
}

/** The engine's own limit, so a set of worlds fits a 30-bit mask. Documents allow fewer (see the schema). */
export const MAX_ENGINE_WORLDS = 30

function checkWorlds(worlds: readonly string[]): void {
  if (worlds.length === 0) throw new ModalError(modalProblem('no-worlds', {}))
  if (worlds.length > MAX_ENGINE_WORLDS) throw new ModalError(modalProblem('too-many-worlds', { count: worlds.length, limit: MAX_ENGINE_WORLDS }))
  const seen = new Set<string>()
  for (const w of worlds) {
    if (seen.has(w)) throw new ModalError(modalProblem('duplicate-world', { world: w }))
    seen.add(w)
  }
}

function known(worlds: ReadonlySet<string>, w: string): void {
  if (!worlds.has(w)) throw new ModalError(modalProblem('unknown-world', { world: w }))
}

/** Successor lists from pairs, every world listed (with no successors when it has none). */
export function accessFromPairs(worlds: readonly string[], pairs: readonly (readonly [string, string])[]): Record<string, string[]> {
  const set = new Set(worlds)
  const out: Record<string, string[]> = Object.fromEntries(worlds.map((w) => [w, [] as string[]]))
  for (const [a, b] of pairs) {
    known(set, a)
    known(set, b)
    const list = out[a] as string[]
    if (!list.includes(b)) list.push(b)
  }
  for (const w of worlds) (out[w] as string[]).sort((x, y) => worlds.indexOf(x) - worlds.indexOf(y))
  return out
}

/** R as pairs, in world order. */
export function accessPairs(frame: Frame): [string, string][] {
  return frame.worlds.flatMap((w) => (frame.access[w] ?? []).map((v) => [w, v] as [string, string]))
}

/** A Kripke model from worlds with their true atoms and R as pairs. */
export function kripkeModel(input: {
  readonly atoms: readonly string[]
  readonly worlds: readonly { readonly id: string; readonly true?: readonly string[] }[]
  readonly access: readonly (readonly [string, string])[]
}): ModalModel {
  const worlds = input.worlds.map((w) => w.id)
  checkWorlds(worlds)
  const atoms = new Set(input.atoms)
  const valuation: Record<string, string[]> = {}
  for (const w of input.worlds) {
    for (const a of w.true ?? []) if (!atoms.has(a)) throw new ModalError(modalProblem('unknown-atom', { atom: a }))
    valuation[w.id] = [...(w.true ?? [])]
  }
  return { worlds, atoms: [...input.atoms], valuation, access: accessFromPairs(worlds, input.access) }
}

/** A frame from world ids and R as pairs. */
export function frameOf(worlds: readonly string[], pairs: readonly (readonly [string, string])[]): Frame {
  checkWorlds(worlds)
  return { worlds: [...worlds], access: accessFromPairs(worlds, pairs) }
}

/**
 * Check one system of spheres around `world`: known worlds, none empty, each containing the one
 * before, and centred (`strong`: the innermost is exactly {world}; `weak`: it contains world).
 */
export function checkSystem(worlds: readonly string[], world: string, spheres: readonly (readonly string[])[], centering: 'strong' | 'weak'): void {
  const set = new Set(worlds)
  known(set, world)
  if (spheres.length === 0) throw new ModalError(modalProblem('empty-sphere', { world, index: 1 }))
  spheres.forEach((s, i) => {
    if (s.length === 0) throw new ModalError(modalProblem('empty-sphere', { world, index: i + 1 }))
    for (const v of s) known(set, v)
    if (i > 0 && !(spheres[i - 1] as readonly string[]).every((v) => s.includes(v))) {
      throw new ModalError(modalProblem('spheres-not-nested', { world, index: i + 1 }))
    }
  })
  const inner = spheres[0] as readonly string[]
  const centred = centering === 'strong' ? inner.length === 1 && inner[0] === world : inner.includes(world)
  if (!centred) throw new ModalError(modalProblem('centering', { world, centering }))
}

/**
 * A model for conditionals: worlds with their true atoms and a system of spheres per world (a world
 * may have none). R at a world with a system is its outermost sphere, so □ ranges over every world
 * the spheres reach and strict implication is the one-sphere case of `>`.
 */
export function sphereModel(input: {
  readonly atoms: readonly string[]
  readonly worlds: readonly { readonly id: string; readonly true?: readonly string[] }[]
  readonly systems: Readonly<Record<string, readonly (readonly string[])[]>>
  readonly centering?: 'strong' | 'weak'
}): ModalModel {
  const base = kripkeModel({ atoms: input.atoms, worlds: input.worlds, access: [] })
  const spheres: Record<string, string[][]> = {}
  const access: Record<string, string[]> = {}
  for (const [w, system] of Object.entries(input.systems)) {
    checkSystem(base.worlds, w, system, input.centering ?? 'strong')
    const ordered = system.map((s) => base.worlds.filter((v) => s.includes(v)))
    spheres[w] = ordered
    access[w] = ordered[ordered.length - 1] as string[]
  }
  return { ...base, access, spheres }
}

/** The same model with every system pressed into one sphere, its outermost: `>` then reads as strict implication. */
export function collapseSpheres(model: ModalModel): ModalModel {
  if (model.spheres === undefined) return model
  const spheres = Object.fromEntries(Object.entries(model.spheres).map(([w, s]) => [w, [s[s.length - 1] as readonly string[]]]))
  return { ...model, spheres }
}
