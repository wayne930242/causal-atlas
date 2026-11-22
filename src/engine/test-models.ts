import type { LookupExpr, LookupRow } from './expr.ts'
import type { Admg } from './identify/admg.ts'
import type { CausalModel } from './model.ts'
import { buildModel } from './model.ts'
import type { IndependentPrior, Outcome } from './probability.ts'
import type { Domain, Value, Variable, VariableKind } from './types.ts'

/** Small models shared by the engine's unit tests. */

export function variable(id: string, kind: VariableKind, domain: Domain = { kind: 'boolean' }): Variable {
  return { id, label: { 'zh-TW': id, en: id }, kind, domain }
}

/** Halpern & Pearl rock throwing with SH/BH (Actual Causality, Example 2.3.3). */
export function rockThrowing(): CausalModel {
  return buildModel({
    variables: [
      variable('U_ST', 'exogenous'),
      variable('U_BT', 'exogenous'),
      variable('ST', 'endogenous'),
      variable('BT', 'endogenous'),
      variable('SH', 'endogenous'),
      variable('BH', 'endogenous'),
      variable('BS', 'endogenous'),
    ],
    equations: { ST: 'U_ST', BT: 'U_BT', SH: 'ST', BH: 'BT and not SH', BS: 'SH or BH' },
  })
}

export function forestFire(connective: 'or' | 'and'): CausalModel {
  return buildModel({
    variables: [
      variable('U_L', 'exogenous'),
      variable('U_MD', 'exogenous'),
      variable('L', 'endogenous'),
      variable('MD', 'endogenous'),
      variable('FF', 'endogenous'),
    ],
    equations: { L: 'U_L', MD: 'U_MD', FF: `L ${connective} MD` },
  })
}

/** Gardener and Queen omission: the flower dies if nobody waters it. */
export function flower(): CausalModel {
  return buildModel({
    variables: [
      variable('U_G', 'exogenous'),
      variable('U_Q', 'exogenous'),
      variable('GW', 'endogenous'),
      variable('QW', 'endogenous'),
      variable('D', 'endogenous'),
    ],
    equations: { GW: 'U_G', QW: 'U_Q', D: 'not GW and not QW' },
  })
}

/** A small seeded PRNG (mulberry32), uniform on [0, 1). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Seeded semi-Markovian SCMs whose graph is a given ADMG, for the identification tests. */
const NOISE = [0, 1, 2, 3] as const

function cartesian(count: number): boolean[][] {
  let out: boolean[][] = [[]]
  for (let i = 0; i < count; i++) out = out.flatMap((row) => [false, true].map((b) => [...row, b]))
  return out
}

/**
 * An SCM over boolean `g.nodes`: each node has its own noise N_v on {0,…,3} with a random
 * positive marginal, each bidirected arc an explicit boolean latent L_a_b feeding both ends.
 * v := N_v < t(parents, latents), with a random threshold t ∈ {1,2,3} per parent setting (redrawn
 * until v depends on every input), so every conditional P(v | parents, latents) is strictly between
 * 0 and 1.
 */
export function randomScm(g: Admg, seed: number): { model: CausalModel; prior: IndependentPrior } {
  const rand = seeded(seed)
  const latents = g.bidirected.map(([a, b]) => ({ id: `L_${a}_${b}`, a, b }))
  const vars = [
    ...latents.map((l) => variable(l.id, 'exogenous')),
    ...g.nodes.map((v) => variable(`N_${v}`, 'exogenous', { kind: 'finite', values: [...NOISE] })),
    ...g.nodes.map((v) => variable(v, 'endogenous')),
  ]
  const marginals: Record<string, Outcome[]> = {}
  for (const l of latents) {
    const p = 0.2 + 0.6 * rand()
    marginals[l.id] = [
      { value: true, p },
      { value: false, p: 1 - p },
    ]
  }
  const equations: Record<string, LookupExpr> = {}
  for (const v of g.nodes) {
    const weights = NOISE.map(() => 0.1 + rand())
    const total = weights.reduce((s, w) => s + w, 0)
    marginals[`N_${v}`] = NOISE.map((n, i) => ({ value: n, p: weights[i] / total }))
    const inputs = [
      ...g.directed.filter(([, to]) => to === v).map(([from]) => from),
      ...latents.filter((l) => l.a === v || l.b === v).map((l) => l.id),
    ]
    const settings = cartesian(inputs.length)
    // Draw thresholds until v depends on every input, so the model's graph is `g`.
    let thresholds = settings.map(() => 1 + Math.floor(rand() * 3))
    while (!inputs.every((_, i) => settings.some((s, k) => s[i] && thresholds[k] !== thresholds[k - (1 << (inputs.length - 1 - i))]))) {
      thresholds = settings.map(() => 1 + Math.floor(rand() * 3))
    }
    const rows: LookupRow[] = []
    settings.forEach((setting, k) => {
      for (const n of NOISE) rows.push({ when: [...setting, n] as Value[], value: n < thresholds[k] })
    })
    equations[v] = { op: 'lookup', inputs: [...inputs, `N_${v}`], rows }
  }
  return { model: buildModel({ variables: vars, equations }), prior: { kind: 'independent', marginals } }
}
