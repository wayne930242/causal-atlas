import { describe, expect, it } from 'vitest'
import type { Admg } from './index.ts'
import { checkIdentification } from './index.ts'
import { randomScm, seeded } from '../test-models.ts'

/**
 * Property: on random small ADMGs, each realised as a seeded SCM with an explicit latent per
 * bidirected arc, every identifiable P(y | do(x), w) equals the engine's do() value within 1e-9.
 */

const TRIALS = 160

function randomAdmg(rand: () => number): Admg {
  const n = 3 + Math.floor(rand() * 3)
  const nodes = Array.from({ length: n }, (_, i) => `V${i}`)
  const directed: [string, string][] = []
  const bidirected: [string, string][] = []
  const maxArcs = n === 5 ? 2 : 3
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (rand() < 0.45) directed.push([nodes[i], nodes[j]])
      if (bidirected.length < maxArcs && rand() < 0.3) bidirected.push([nodes[i], nodes[j]])
    }
  }
  return { nodes, directed, bidirected }
}

function pick(rand: () => number, from: readonly string[], most: number): string[] {
  const pool = [...from]
  const out: string[] = []
  const count = 1 + Math.floor(rand() * most)
  while (out.length < count && pool.length > 0) out.push(...pool.splice(Math.floor(rand() * pool.length), 1))
  return out
}

describe('identify: random ADMGs against do()', () => {
  it(`${TRIALS} seeded cases`, () => {
    const rand = seeded(20261122)
    let ids = 0
    let nonIds = 0
    let withW = 0
    let rows = 0
    for (let t = 0; t < TRIALS; t++) {
      const g = randomAdmg(rand)
      const { model, prior } = randomScm(g, 1000 + t)
      const y = pick(rand, g.nodes.slice(1), 2)
      const x = pick(
        rand,
        g.nodes.filter((v) => !y.includes(v)),
        2,
      )
      const rest = g.nodes.filter((v) => !y.includes(v) && !x.includes(v))
      const w = rest.length > 0 && rand() < 0.35 ? pick(rand, rest, 1) : []
      const check = checkIdentification(model, prior, { y, x, w })
      if (check.result.identifiable) {
        ids++
        if (w.length > 0) withW++
        rows += check.rows.length
        expect(check.maxError, `case ${t}: ${JSON.stringify({ g, y, x, w })} → ${check.result.text}`).toBeLessThan(1e-9)
      } else nonIds++
    }
    expect(ids).toBeGreaterThan(40)
    expect(nonIds).toBeGreaterThan(10)
    expect(withW).toBeGreaterThan(10)
    expect(rows).toBeGreaterThan(400)
  })
})
