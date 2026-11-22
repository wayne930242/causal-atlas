// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { docToCase } from '../../data/index.ts'
import { lessonModel } from '../../demo/lesson-models.ts'
import type { RuleStep } from './rules-view.ts'
import { FRONT_DOOR_STEPS } from '../../demo/front-door-steps.ts'
import { ruleView } from './rules-view.ts'
import { ProbabilityPanel } from '../index.ts'
import { modelDocSchema } from '../../data/schema.ts'

afterEach(cleanup)

const doc = { ...lessonModel('m05-frontdoor'), latent_as_arcs: ['U'] }
const fd = docToCase(doc)
const prior = fd.prior
if (prior === undefined) throw new Error('no prior')

describe('ruleView: one do-calculus step on its cut graph', () => {
  it('lesson 06: every step of the front-door derivation is separated and its two sides equal; step 7 is open and they differ', () => {
    const got = FRONT_DOOR_STEPS.map((s: RuleStep) => {
      const v = ruleView(fd, prior, s, s.given)
      return [s.label, v.result.separated, v.sides?.map((x) => x.toFixed(4)).join(' ')]
    })
    expect(got).toEqual([
      ['2', true, '0.9000 0.9000'],
      ['3', true, '0.3900 0.3900'],
      ['4', true, '0.3900 0.3900'],
      ['5a', true, '0.3800 0.3800'],
      ['5b', true, '0.4895 0.4895'],
      ['7', false, '0.3700 0.4695'],
    ])
  })

  it('cuts the arrows into cutIn and out of cutOut: step 3 removes U→X and Z→Y', () => {
    const v = ruleView(fd, prior, FRONT_DOOR_STEPS[1], ['X'])
    expect(v.removed.map((e) => `${e.from}>${e.to}`).sort()).toEqual(['N_X0>X', 'N_X1>X', 'U>X', 'Z>Y'])
  })

  it('knowing Y at step 2 opens X←U→Y←Z: rule 2 no longer applies', () => {
    expect(ruleView(fd, prior, FRONT_DOOR_STEPS[0], ['Y']).result.separated).toBe(false)
  })
})

/** The blog's m06-rule3-exception: family background U drives tutoring Z and income Y; Z drives the mock score W. */
const exceptionDoc = modelDocSchema.parse({
  "format": "causal-atlas/model",
  "version": 1,
  "title": "規則三：已知模擬考成績時，設定補習會改變收入的預測",
  "model": {
    "variables": [
      {
        "id": "U",
        "label": {
          "zh-TW": "看不到的家境",
          "en": "Unobserved family background"
        },
        "kind": "exogenous",
        "domain": "boolean"
      },
      {
        "id": "N_Z1",
        "label": {
          "zh-TW": "家境好時補習",
          "en": "Tutored, well-off family"
        },
        "kind": "exogenous",
        "domain": "boolean"
      },
      {
        "id": "N_Z0",
        "label": {
          "zh-TW": "家境不好時補習",
          "en": "Tutored, poorer family"
        },
        "kind": "exogenous",
        "domain": "boolean"
      },
      {
        "id": "N_W1",
        "label": {
          "zh-TW": "補習時模擬考高分",
          "en": "High mock score, tutored"
        },
        "kind": "exogenous",
        "domain": "boolean"
      },
      {
        "id": "N_W0",
        "label": {
          "zh-TW": "沒補習時模擬考高分",
          "en": "High mock score, not tutored"
        },
        "kind": "exogenous",
        "domain": "boolean"
      },
      {
        "id": "N_Y1",
        "label": {
          "zh-TW": "家境好時收入高",
          "en": "High income, well-off family"
        },
        "kind": "exogenous",
        "domain": "boolean"
      },
      {
        "id": "N_Y0",
        "label": {
          "zh-TW": "家境不好時收入高",
          "en": "High income, poorer family"
        },
        "kind": "exogenous",
        "domain": "boolean"
      },
      {
        "id": "Z",
        "label": {
          "zh-TW": "補習",
          "en": "Tutored"
        },
        "kind": "endogenous",
        "domain": "boolean"
      },
      {
        "id": "W",
        "label": {
          "zh-TW": "模擬考高分",
          "en": "High mock score"
        },
        "kind": "endogenous",
        "domain": "boolean"
      },
      {
        "id": "Y",
        "label": {
          "zh-TW": "收入高",
          "en": "High income"
        },
        "kind": "endogenous",
        "domain": "boolean"
      }
    ],
    "equations": {
      "Z": "if U then N_Z1 else N_Z0",
      "W": "if Z then N_W1 else N_W0",
      "Y": "if U then N_Y1 else N_Y0"
    }
  },
  "priors": {
    "independent": {
      "U": 0.5,
      "N_Z1": 0.9,
      "N_Z0": 0.1,
      "N_W1": 0.9,
      "N_W0": 0.1,
      "N_Y1": 0.8,
      "N_Y0": 0.2
    }
  },
  "latent_as_arcs": [],
  "show_exogenous": [
    "U"
  ]
})
const ex = docToCase(exceptionDoc)
const exPrior = ex.prior
if (exPrior === undefined) throw new Error('no prior')
const exEqual = [
  { event: 'Y=1', given: 'W=1', do: { Z: 1 } },
  { event: 'Y=1', given: 'W=1' },
] as const
const EXCEPTION_STEPS: readonly RuleStep[] = [
  { label: 'switch', rule: 3, pair: ['F_Z', 'Y'], given: ['W'], switches: ['Z'], equal: exEqual },
  { label: 'wrong cut', rule: 3, pair: ['Z', 'Y'], given: ['W'], cutIn: ['Z'], equal: exEqual },
  { label: 'kept', rule: 3, pair: ['Z', 'Y'], given: ['W'], equal: exEqual },
]

describe('ruleView: the intervention switch F_Z (Pearl 2009, §3.2.2)', () => {
  it('rule 3 exception: F_Z→Z←U→Y is opened by the observed descendant W, so the sides cannot be swapped', () => {
    const v = ruleView(ex, exPrior, EXCEPTION_STEPS[0], ['W'])
    expect(v.switchTest).toBe(true)
    expect(v.switchNodes).toEqual(['F_Z'])
    expect(v.removed).toEqual([])
    expect(v.result.separated).toBe(false)
    const open = v.result.paths.filter((p) => p.open)
    expect(open.map((p) => p.nodes.join(' '))).toEqual(['F_Z Z U Y'])
    expect(open[0].opened).toEqual([{ collider: 'Z', by: 'W' }])
    expect(v.verdict).toBe('noSwap')
    expect(v.sides?.map((x) => x.toFixed(4))).toEqual(['0.5000', '0.6920'])
    // Without W, the collider Z blocks it: the switch and Y are separated.
    expect(ruleView(ex, exPrior, EXCEPTION_STEPS[0], []).result.separated).toBe(true)
  })

  it('the wrong cut separates Z from Y while the sides differ: mismatch, never "applies"', () => {
    expect(ruleView(ex, exPrior, EXCEPTION_STEPS[1], ['W']).verdict).toBe('mismatch')
    expect(ruleView(ex, exPrior, EXCEPTION_STEPS[2], ['W']).verdict).toBe('notApplies')
  })

  it('front door: rule 2 F_X ⫫ Z given X, rule 3 F_Z ⫫ X: both can be swapped', () => {
    const two: RuleStep = { label: '2', rule: 2, pair: ['F_X', 'Z'], given: ['X'], switches: ['X'], equal: [{ event: 'Z=1', do: { X: 1 } }, { event: 'Z=1', given: 'X=1' }] }
    const three: RuleStep = { label: '3', rule: 3, pair: ['F_Z', 'X'], given: [], switches: ['Z'], equal: [{ event: 'X=1', do: { Z: 1 } }, { event: 'X=1' }] }
    const full = docToCase(lessonModel('m05-frontdoor'))
    expect(ruleView(full, prior, two, two.given).verdict).toBe('swap')
    expect(ruleView(full, prior, three, three.given).verdict).toBe('swap')
    // Given Y, the collider Y opens F_X→X←U→Y←Z.
    expect(ruleView(full, prior, two, ['X', 'Y']).verdict).toBe('noSwap')
  })

  it('fails fast: a switched variable in cutIn, a switch test with cutOut or a cut the expression does not set', () => {
    const base = EXCEPTION_STEPS[0]
    expect(() => ruleView(ex, exPrior, { ...base, cutIn: ['Z'] }, ['W'])).toThrow(/not cut/)
    expect(() => ruleView(ex, exPrior, { ...base, cutOut: ['Z'] }, ['W'])).toThrow(/cutOut/)
    expect(() => ruleView(ex, exPrior, { ...base, cutIn: ['W'] }, ['W'])).toThrow(/both sides set/)
  })
})

describe('ProbabilityPanel view="rules"', () => {
  it('draws the switch F_Z as a small square, names the open path and says 不可換; the wrong cut never says 規則三適用', () => {
    const { container, getByRole } = render(<ProbabilityPanel doc={exceptionDoc} view="rules" rules={EXCEPTION_STEPS} />)
    const line = (): string => container.querySelector('.ca-rules-line')?.textContent ?? ''
    const marks = (): (string | null)[] => [...container.querySelectorAll('.ca-rules-legend li')].map((li) => li.getAttribute('data-mark'))
    expect(container.querySelector('[data-node="F_Z"] .ca-switch-box')).not.toBeNull()
    expect(container.querySelector('[data-edge="F_Z>Z"][data-path="open"]')).not.toBeNull()
    expect(container.querySelector('.ca-stroke-cut')).toBeNull()
    expect(line()).toContain('暢通，不可換')
    expect(container.querySelector('[data-path-open="true"]')?.textContent).toContain('對撞點 Z 的後代 W 已知')
    expect(marks()).toEqual(['pair', 'switch', 'known', 'open', 'pick'])
    expect(container.querySelector('.ca-tags')?.textContent).toContain('加開關')
    expect(container.querySelector('[data-node="F_Z"]')?.getAttribute('aria-label')).toContain('要檢查的變數・干預開關')
    // Observing nothing closes the collider: 可換.
    fireEvent.click(container.querySelector('[data-node="W"]') as Element)
    expect(line()).toContain('分隔，可換')
    expect(container.querySelector('.ca-rules-equal')?.getAttribute('data-equal')).toBe('moved')
    expect(container.querySelector('.ca-rules-equal')?.textContent).toContain('按步驟鈕還原')
    fireEvent.click(getByRole('button', { name: 'wrong cut' }))
    expect(line()).toContain('分隔')
    expect(line()).not.toContain('適用')
    expect(line()).toContain('等式兩邊的數字不等')
    // Z is not set by both sides: its clamp is the dashed test-only one, named so in the legend.
    expect(container.querySelector('[data-node="Z"] [data-clamp="test"]')).not.toBeNull()
    expect(marks()).toEqual(['pair', 'known', 'testClamp', 'cut', 'pick'])
    expect(container.querySelector('.ca-rules-legend')?.textContent).not.toContain('由 do 設定')
    fireEvent.click(getByRole('button', { name: 'kept' }))
    expect(line()).toContain('規則三不適用')
  })

  it('steps through the derivation; a click on a node adds it to the known set; the step button restores it', () => {
    const { container, getByRole } = render(<ProbabilityPanel doc={doc} view="rules" rules={FRONT_DOOR_STEPS} />)
    const line = (): string => container.querySelector('.ca-rules-line')?.textContent ?? ''
    const sides = (): string => container.querySelector('.ca-rules-equal')?.textContent ?? ''
    expect(line()).toContain('分隔')
    expect(line()).toContain('規則二適用')
    expect(sides()).toContain('0.9')
    expect(sides()).toContain('✓')
    // The clamp on X at step 3, no number on any node.
    fireEvent.click(getByRole('button', { name: '3' }))
    expect(container.querySelector('[data-node="X"] .ca-stroke-clamp')).not.toBeNull()
    expect(container.querySelector('[data-node="X"] rect[data-level]')).toBeNull()
    fireEvent.click(getByRole('button', { name: '2' }))
    fireEvent.click(container.querySelector('[data-node="Y"]') as Element)
    expect(line()).toContain('規則二不適用')
    fireEvent.click(getByRole('button', { name: '2' }))
    expect(line()).toContain('規則二適用')
    fireEvent.click(getByRole('button', { name: '7' }))
    expect(container.querySelector('.ca-rules-equal')?.getAttribute('data-equal')).toBe('false')
    expect(sides()).toContain('✗')
  })

  it('the legend names only the marks the step draws; a hovered node says its roles', () => {
    const { container, getByRole } = render(<ProbabilityPanel doc={doc} view="rules" rules={FRONT_DOOR_STEPS} />)
    const marks = (): (string | null)[] => [...container.querySelectorAll('.ca-rules-legend li')].map((li) => li.getAttribute('data-mark'))
    // Step 2: nothing known, arrows out of X cut, no clamp.
    expect(marks()).toEqual(['pair', 'cut', 'blocked', 'pick'])
    expect(container.querySelector('[data-path="blocked"]')).not.toBeNull()
    expect(container.querySelector('.ca-rules-legend')?.textContent).toContain('點節點把它加進或移出已知集合')
    fireEvent.click(getByRole('button', { name: '3' }))
    expect(marks()).toEqual(['pair', 'known', 'clamp', 'cut', 'pick'])
    expect(container.querySelector('[data-path]')).toBeNull()
    const x = container.querySelector('[data-node="X"]') as Element
    expect(x.getAttribute('aria-label')).toContain('給定・已由 do 設定')
    fireEvent.pointerEnter(x, { pointerType: 'mouse' })
    expect(container.querySelector('[data-node-tip="X"]')?.textContent).toBe('給定・已由 do 設定。點一下移出已知集合')
    const z = container.querySelector('[data-node="Z"]') as Element
    fireEvent.pointerEnter(z, { pointerType: 'mouse' })
    expect(container.querySelector('[data-node-tip="Z"]')?.textContent).toBe('要檢查的變數・只為檢驗剪掉出去的箭頭。點一下加進已知集合')
    fireEvent.pointerLeave(z, { pointerType: 'mouse' })
    expect(container.querySelector('.ca-node-tip')).toBeNull()
  })

  it('fails fast without rules', () => {
    expect(() => renderToString(<ProbabilityPanel doc={doc} view="rules" />)).toThrow(/rules/)
  })
})
