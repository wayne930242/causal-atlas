import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Value } from '../types.ts'
import type { ObservedRow } from './index.ts'
import { evaluateProbExpr, identify } from './index.ts'

/**
 * The test oracles' cases (oracle/fixtures/cases.json, made by oracle/regenerate.py from dosearch,
 * causaleffect and y0, which are run there and never shipped): `identify` must give each case the
 * oracles' verdict, and an identifiable formula must equal the exact P(y | do(x), w) of the case's
 * random SCM, computed by the harness, on the case's observational joint.
 */

type Verdict = boolean | 'error'

interface OracleCase {
  readonly id: string
  readonly nodes: readonly string[]
  readonly directed: readonly (readonly [string, string])[]
  readonly bidirected: readonly (readonly [string, string])[]
  readonly y: readonly string[]
  readonly x: readonly string[]
  readonly w: readonly string[]
  readonly verdicts: Readonly<Record<string, Verdict>>
  readonly domains: Readonly<Record<string, readonly Value[]>>
  readonly joint: readonly ObservedRow[]
  readonly truth: readonly { readonly at: Readonly<Record<string, Value>>; readonly p: number }[]
}

const FIXTURE = new URL('../../../oracle/fixtures/cases.json', import.meta.url)
const { cases } = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { cases: readonly OracleCase[] }

/** The verdict every oracle that ran gives; a case where they disagree fails the fixture test. */
function oracleVerdict(c: OracleCase): boolean {
  const ran = Object.values(c.verdicts).filter((v): v is boolean => v !== 'error')
  return ran[0] as boolean
}

function settings(vars: readonly string[], domains: OracleCase['domains']): Record<string, Value>[] {
  let out: Record<string, Value>[] = [{}]
  for (const v of vars) out = out.flatMap((s) => (domains[v] ?? []).map((value) => ({ ...s, [v]: value })))
  return out
}

describe('identify against the oracle fixtures', () => {
  it('has the named cases and every tool that ran agrees', () => {
    expect(cases.map((c) => c.id)).toEqual(expect.arrayContaining(['backdoor', 'frontdoor', 'napkin', 'bow']))
    for (const c of cases) {
      const ran = Object.values(c.verdicts).filter((v) => v !== 'error')
      expect(ran.length, c.id).toBeGreaterThanOrEqual(2)
      expect(new Set(ran).size, c.id).toBe(1)
    }
  })

  it.each(cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const result = identify({ nodes: c.nodes, directed: c.directed, bidirected: c.bidirected }, c.y, c.x, c.w)
    expect(result.identifiable).toBe(oracleVerdict(c))
    if (!result.identifiable) return
    let checked = 0
    for (const row of c.truth) {
      for (const free of settings(result.arbitrary, c.domains)) {
        const value = evaluateProbExpr(result.formula, c.joint, { ...free, ...row.at }, c.domains)
        expect(Math.abs(value - row.p), `${c.id} at ${JSON.stringify({ ...free, ...row.at })}`).toBeLessThanOrEqual(1e-9)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
})
