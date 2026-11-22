import { describe, expect, it } from 'vitest'
import type { Admg } from './index.ts'
import { admgOf, checkIdentification, evaluateProbExpr, identify, observedJoint } from './index.ts'
import { randomScm } from '../test-models.ts'

/** IDC: P(y | do(x), w). */

const frontdoor: Admg = { nodes: ['X', 'Z', 'Y'], directed: [['X', 'Z'], ['Z', 'Y']], bidirected: [['X', 'Y']] }
const backdoor: Admg = { nodes: ['Z', 'X', 'Y'], directed: [['Z', 'X'], ['Z', 'Y'], ['X', 'Y']], bidirected: [] }
/** X → Y → W with no confounding: seeing the effect's child W tells about Y. */
const childOfY: Admg = { nodes: ['X', 'Y', 'W'], directed: [['X', 'Y'], ['Y', 'W']], bidirected: [] }
/** The bow with a child W of Y. */
const bowW: Admg = { nodes: ['X', 'Y', 'W'], directed: [['X', 'Y'], ['Y', 'W']], bidirected: [['X', 'Y']] }

function checked(g: Admg, seed: number, y: string[], x: string[], w: string[]) {
  const { model, prior } = randomScm(g, seed)
  expect(admgOf(model)).toEqual(g)
  const check = checkIdentification(model, prior, { y, x, w })
  return { model, prior, check }
}

describe('identify with w (IDC)', () => {
  it("frontdoor, w = Z: rule 2 moves Z into do(), Σ_x' P(y|x',z) P(x'), not P(y|x,z)", () => {
    const r = identify(frontdoor, ['Y'], ['X'], ['Z'])
    expect(r.identifiable).toBe(true)
    if (!r.identifiable) return
    expect(r.text).toBe("Σ_x' P(y|x',z) P(x')")
    const { model, prior, check } = checked(frontdoor, 11, ['Y'], ['X'], ['Z'])
    expect(check.skipped).toEqual([])
    expect(check.rows.length).toBe(8)
    expect(check.maxError).toBeLessThan(1e-9)
    // Plain conditioning P(y | x, z) gives a different number on this model.
    const joint = observedJoint(model, prior)
    const domains = { X: [false, true], Y: [false, true], Z: [false, true] }
    const gaps = check.rows.map((row) => Math.abs(evaluateProbExpr({ kind: 'p', vars: ['Y'], given: ['X', 'Z'] }, joint, row.at, domains) - row.doValue))
    expect(Math.max(...gaps)).toBeGreaterThan(1e-3)
  })

  it('backdoor, w = Z: P(y|x,z)', () => {
    const r = identify(backdoor, ['Y'], ['X'], ['Z'])
    expect(r.identifiable && r.text).toBe('P(y|x,z)')
    const { check } = checked(backdoor, 5, ['Y'], ['X'], ['Z'])
    expect(check.maxError).toBeLessThan(1e-9)
  })

  it('a child of the effect: P(y|w,x), checked against do()', () => {
    const r = identify(childOfY, ['Y'], ['X'], ['W'])
    expect(r.identifiable).toBe(true)
    if (!r.identifiable) return
    expect(r.text).toBe('P(y|w,x)')
    const { check } = checked(childOfY, 9, ['Y'], ['X'], ['W'])
    expect(check.rows.length).toBe(8)
    expect(check.maxError).toBeLessThan(1e-9)
  })

  it('the bow with a child of Y stays not identifiable', () => {
    const r = identify(bowW, ['Y'], ['X'], ['W'])
    expect(r.identifiable).toBe(false)
    if (r.identifiable) return
    expect(r.hedge.f).toContain('X')
    expect(r.hedge.fPrime).not.toContain('X')
  })
})
