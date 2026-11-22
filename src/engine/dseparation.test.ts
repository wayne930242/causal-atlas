import { describe, expect, it } from 'vitest'
import { docToCase } from '../data/index.ts'
import { lessonModel } from '../demo/lesson-models.ts'
import { dSeparation, dependence, descendants, switchId, withSwitches } from './index.ts'

const load = (id: string) => {
  const c = docToCase(lessonModel(id))
  if (c.prior === undefined) throw new Error(`${id} has no prior`)
  return { model: c.model, prior: c.prior }
}

describe('dSeparation: the paths between two variables, open or blocked, in the graph after do()', () => {
  it('chain and fork: open with nothing known, blocked by the middle Z', () => {
    for (const id of ['m02-chain', 'm01-fork']) {
      const { model } = load(id)
      const open = dSeparation(model, 'X', 'Y', [])
      expect(open.separated).toBe(false)
      expect(open.paths.map((p) => p.nodes.join(''))).toEqual(['XZY'])
      const shut = dSeparation(model, 'X', 'Y', ['Z'])
      expect(shut.separated).toBe(true)
      expect(shut.paths[0]).toMatchObject({ open: false, blockedBy: 'Z', kind: 'known' })
    }
  })

  it('admission: the collider A blocks G–M until A or its descendant L is known', () => {
    const { model } = load('m04-admission')
    const none = dSeparation(model, 'G', 'M', [])
    expect(none.separated).toBe(true)
    expect(none.paths[0]).toMatchObject({ nodes: ['G', 'A', 'M'], open: false, blockedBy: 'A', kind: 'collider' })
    const a = dSeparation(model, 'G', 'M', ['A'])
    expect(a.separated).toBe(false)
    expect(a.paths[0].opened).toEqual([{ collider: 'A', by: 'A' }])
    const l = dSeparation(model, 'G', 'M', ['L'])
    expect(l.separated).toBe(false)
    expect(l.paths[0].opened).toEqual([{ collider: 'A', by: 'L' }])
    // do(A): the arrows into A are cut, so no path joins G and M.
    const cut = dSeparation(model, 'G', 'M', ['L'], ['A'])
    expect(cut.paths).toEqual([])
    expect(cut.separated).toBe(true)
  })

  it('the arrow directions are kept for drawing: G→A←M', () => {
    const { model } = load('m04-admission')
    expect(dSeparation(model, 'G', 'M', ['A']).paths[0].edges).toEqual([
      { from: 'G', to: 'A' },
      { from: 'M', to: 'A' },
    ])
  })
})

describe('dependence δ, as lesson 04 defines it: max |P(x,y|z) − P(x|z)P(y|z)|', () => {
  it('matches the lesson: chain 0.12, fork 0.1225, both 0 given Z', () => {
    const chain = load('m02-chain')
    expect(dependence(chain.model, chain.prior, 'X', 'Y')).toBeCloseTo(0.12, 10)
    expect(dependence(chain.model, chain.prior, 'X', 'Y', { Z: 1 })).toBeCloseTo(0, 10)
    const fork = load('m01-fork')
    expect(dependence(fork.model, fork.prior, 'X', 'Y')).toBeCloseTo(0.1225, 10)
    expect(dependence(fork.model, fork.prior, 'X', 'Y', { Z: 0 })).toBeCloseTo(0, 10)
  })

  it('admission: 0 for G and M, 0.1736 given A=1 or given L=1', () => {
    const { model, prior } = load('m04-admission')
    expect(dependence(model, prior, 'G', 'M')).toBeCloseTo(0, 10)
    expect(dependence(model, prior, 'G', 'M', { A: 1 })).toBeCloseTo(0.1736, 4)
    expect(dependence(model, prior, 'G', 'M', { L: 1 })).toBeCloseTo(0.1736, 4)
  })

  it('m04-tuned: the path X→Y is open, yet δ is 0.000', () => {
    const { model, prior } = load('m04-tuned')
    expect(dSeparation(model, 'X', 'Y', []).separated).toBe(false)
    expect(dependence(model, prior, 'X', 'Y')).toBeCloseTo(0, 12)
  })

  it('after do(), in the intervened model', () => {
    const { model, prior } = load('m04-admission')
    expect(dependence(model, prior, 'G', 'M', { L: 1 }, { A: 1 })).toBeCloseTo(0, 12)
  })
})

describe('dSeparation cutOut: the arrows out of these variables removed (G_X underlined, do-calculus rule 2)', () => {
  it('front door, rule 2 at step 2: X and Z separated once X→Z is cut, the back path X←U→Y←Z blocked at Y', () => {
    const { model } = load('m05-frontdoor')
    expect(dSeparation(model, 'X', 'Z', []).separated).toBe(false)
    const cut = dSeparation(model, 'X', 'Z', [], [], ['X'])
    expect(cut.separated).toBe(true)
    expect(cut.paths.map((p) => p.nodes.join(''))).toEqual(['XUYZ'])
    expect(cut.paths[0]).toMatchObject({ blockedBy: 'Y', kind: 'collider' })
    // Knowing Y opens the collider: rule 2 no longer applies.
    expect(dSeparation(model, 'X', 'Z', ['Y'], [], ['X']).separated).toBe(false)
  })

  it('descendants lists every variable reachable along the arrows', () => {
    const { model } = load('m05-backdoor')
    expect(descendants(model, 'X').sort()).toEqual(['C', 'Y'])
  })
})

describe('withSwitches: the intervention switch F_v → v', () => {
  it('adds an exogenous F_Z with one arrow into Z, cuts nothing, and keeps the equations', () => {
    const { model } = load('m02-collider')
    const m = withSwitches(model, ['Z'])
    expect(switchId('Z')).toBe('F_Z')
    expect(m.byId.get('F_Z')?.kind).toBe('exogenous')
    expect(m.edges.filter((e) => e.from === 'F_Z')).toEqual([{ from: 'F_Z', to: 'Z' }])
    expect(m.edges.length).toBe(model.edges.length + 1)
    expect(m.equations).toBe(model.equations)
    expect(() => withSwitches(m, ['Z'])).toThrow(/duplicate variable F_Z/)
  })
})
