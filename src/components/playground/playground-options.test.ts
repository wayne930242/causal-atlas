import { describe, expect, it } from 'vitest'
import { getCase } from '../../data/index.ts'
import { activeQuery, checkTrack, checkVerdicts, decisionFor, dsepPairs, presetButtons, sliderStart } from './playground-options.ts'

const rock = getCase('rock-throwing')
const smoking = getCase('smoking-lesion')

describe('presetButtons', () => {
  it("takes a bundled case's showcase for true, none for false", () => {
    expect(presetButtons(rock, true, 'en').map((b) => [b.text, b.interventions])).toEqual([
      ['Suzy does not throw', { ST: 0 }],
      ["Suzy does not throw; Billy's rock is stopped", { ST: 0, BH: 0 }],
    ])
    expect(presetButtons(rock, false, 'en')).toEqual([])
  })

  it('sets the held variables by do() as well', () => {
    const [b] = presetButtons(rock, [{ label: 'x', interventions: { ST: 0 }, hold: { BT: 1 } }], 'zh-TW')
    expect(b).toEqual({ text: 'x', interventions: { ST: 0, BT: 1 }, observed: {}, hold: { BT: 1 } })
  })

  it('refuses an observation on a graph with values', () => {
    expect(() => presetButtons(rock, [{ label: '看到', observed: { ST: 1 } }], 'zh-TW')).toThrow(
      'preset "看到": observed needs probabilities, and rock-throwing has an actual context',
    )
  })
})

describe('sliderStart', () => {
  it("starts each slider at the case's prior unless `prior` gives it", () => {
    expect(sliderStart(smoking, ['L'], undefined)).toEqual({ L: 0.3 })
    expect(sliderStart(smoking, ['L'], { N_S1: 0.5 })).toEqual({ L: 0.3, N_S1: 0.5 })
    expect(sliderStart(rock, [], undefined)).toEqual({})
  })

  it('throws on a graph with values, an endogenous id and a value that is no probability', () => {
    expect(() => sliderStart(rock, ['U_ST'], undefined)).toThrow('rock-throwing: sliders and prior need a probability graph (priors, no context)')
    expect(() => sliderStart(smoking, ['S'], undefined)).toThrow('smoking-lesion: no slider can set S')
    expect(() => sliderStart(smoking, [], { L: 1.5 })).toThrow('smoking-lesion: prior L = 1.5 is not a probability')
  })
})

describe('decisionFor', () => {
  it("takes the case's own decision for true, none when not asked", () => {
    expect(decisionFor(smoking, true)).toBe(smoking.decision)
    expect(decisionFor(smoking, undefined)).toBeUndefined()
  })

  it('throws on a graph with values', () => {
    expect(() => decisionFor(rock, true)).toThrow('rock-throwing: decision needs a probability graph (priors, no context)')
  })
})

describe('dsepPairs', () => {
  it('turns one pair into a list and keeps a list', () => {
    expect(dsepPairs(smoking, ['S', 'C'])).toEqual([['S', 'C']])
    expect(dsepPairs(smoking, [['S', 'C'], ['L', 'C']])).toEqual([['S', 'C'], ['L', 'C']])
    expect(dsepPairs(rock, undefined)).toEqual([])
  })

  it('throws on a graph with values and on an unknown variable', () => {
    expect(() => dsepPairs(rock, ['ST', 'BS'])).toThrow('rock-throwing: dsep needs a probability graph (priors, no context)')
    expect(() => dsepPairs(smoking, ['S', 'Q'])).toThrow()
  })
})

describe('checks', () => {
  it('refuses verdicts on a probability graph and an unknown tracked id', () => {
    expect(() => checkVerdicts(smoking, [{ cause: 'S=1', effect: 'C=1' }])).toThrow('smoking-lesion: verdicts need a graph with values (an actual context)')
    expect(() => checkVerdicts(rock, [{ cause: 'ST=1', effect: 'BS=1' }])).not.toThrow()
    expect(() => checkTrack(rock, ['BS'])).not.toThrow()
    expect(() => checkTrack(rock, ['Q'])).toThrow()
  })
})

describe('activeQuery', () => {
  const queries = [
    { cause: 'ST=1', effect: 'BS=1' },
    { cause: 'BT=1', effect: 'BS=1' },
  ]
  it('answers the first query whose cause is set away from its actual value, else the first', () => {
    expect(activeQuery(rock, queries, {})).toBe(0)
    expect(activeQuery(rock, queries, { BT: false })).toBe(1)
    expect(activeQuery(rock, queries, { BT: true })).toBe(0)
  })
})
