// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { docToCase } from '../../data/index.ts'
import { lessonModel } from '../../demo/lesson-models.ts'
import type { RuleStep } from './rules-view.ts'
import { FRONT_DOOR_STEPS } from '../../demo/front-door-steps.ts'
import { RULE_ONE_STEPS } from '../../demo/rule-one-steps.ts'
import { derivationSteps, equationUnder, initialRuleState, isCalculus, nodeValues, ruleView, switchReading } from './rules-view.ts'
import { RulesPanel } from './RulesPanel.tsx'
import { admgForPrior, derive } from '../../engine/index.ts'
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
      const v = ruleView(fd, prior, s, initialRuleState(fd, s))
      return [s.label, v.result.separated, v.equation?.map((q) => q.value?.toFixed(4)).join(' ')]
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
    const v = ruleView(fd, prior, FRONT_DOOR_STEPS[1], initialRuleState(fd, FRONT_DOOR_STEPS[1]))
    expect(v.removed.map((e) => `${e.from}>${e.to}`).sort()).toEqual(['N_X0>X', 'N_X1>X', 'U>X', 'Z>Y'])
  })

  it('follows observation values in both the common conditions and the written comparison', () => {
    const step: RuleStep = {
      label: 'finite', rule: 1, pair: ['Z', 'Y'], given: ['W'],
      equal: [{ event: 'Y=1', given: 'Z=1 and W="tea and milk"' }, { event: 'Y=1', given: 'W="tea and milk"' }],
    }
    const state = { ...empty, observed: { W: 'apple and pear', Z: false }, interventions: { X: false } }
    expect(equationUnder(step, state)).toEqual([
      { event: 'Y=1', given: "Z=0 and W='apple and pear'", do: { X: false } },
      { event: 'Y=1', given: "W='apple and pear'", do: { X: false } },
    ])
  })

  it('knowing Y at step 2 opens X←U→Y←Z: rule 2 no longer applies', () => {
    expect(ruleView(fd, prior, FRONT_DOOR_STEPS[0], { observed: { Y: true }, interventions: {}, setting: {} }).result.separated).toBe(false)
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

const empty = { observed: {}, interventions: {}, setting: {} }
const seenW = { ...empty, observed: { W: true } }

describe('ruleView: the intervention switch F_Z (Pearl 2009, §3.2.2)', () => {
  it('rule 3 exception: F_Z→Z←U→Y is opened by the observed descendant W, so the sides cannot be swapped', () => {
    const v = ruleView(ex, exPrior, EXCEPTION_STEPS[0], seenW)
    expect(v.switchTest).toBe(true)
    expect(v.switchNodes).toEqual(['F_Z'])
    expect(v.removed).toEqual([])
    expect(v.result.separated).toBe(false)
    const open = v.result.paths.filter((p) => p.open)
    expect(open.map((p) => p.nodes.join(' '))).toEqual(['F_Z Z U Y'])
    expect(open[0].opened).toEqual([{ collider: 'Z', by: 'W' }])
    expect(v.verdict).toBe('noSwap')
    expect(v.equation?.map((q) => q.value?.toFixed(4))).toEqual(['0.5000', '0.6920'])
    // Without W, the collider Z blocks it: the switch and Y are separated.
    expect(ruleView(ex, exPrior, EXCEPTION_STEPS[0], empty).result.separated).toBe(true)
  })

  it('the wrong cut separates Z from Y while the sides differ: mismatch, never "applies"', () => {
    expect(ruleView(ex, exPrior, EXCEPTION_STEPS[1], seenW).verdict).toBe('mismatch')
    expect(ruleView(ex, exPrior, EXCEPTION_STEPS[2], seenW).verdict).toBe('notApplies')
  })

  it('front door: rule 2 F_X ⫫ Z given X, rule 3 F_Z ⫫ X: both can be swapped', () => {
    const two: RuleStep = { label: '2', rule: 2, pair: ['F_X', 'Z'], given: ['X'], switches: ['X'], equal: [{ event: 'Z=1', do: { X: 1 } }, { event: 'Z=1', given: 'X=1' }] }
    const three: RuleStep = { label: '3', rule: 3, pair: ['F_Z', 'X'], given: [], switches: ['Z'], equal: [{ event: 'X=1', do: { Z: 1 } }, { event: 'X=1' }] }
    const full = docToCase(lessonModel('m05-frontdoor'))
    expect(ruleView(full, prior, two, initialRuleState(full, two)).verdict).toBe('swap')
    expect(ruleView(full, prior, three, initialRuleState(full, three)).verdict).toBe('swap')
    // Given Y, the collider Y opens F_X→X←U→Y←Z.
    expect(ruleView(full, prior, two, { ...empty, observed: { X: true, Y: true } }).verdict).toBe('noSwap')
  })

  it('a switch set by a click cuts the arrows into its variable, not its own, and leaves the test alone', () => {
    const v = ruleView(ex, exPrior, EXCEPTION_STEPS[0], { ...seenW, setting: { Z: true } })
    expect(v.removed.map((e) => `${e.from}>${e.to}`)).toEqual(['U>Z', 'N_Z1>Z', 'N_Z0>Z'])
    expect(v.verdict).toBe('noSwap')
    expect(() => ruleView(ex, exPrior, EXCEPTION_STEPS[0], { ...seenW, setting: { W: true } })).toThrow(/no switch/)
    expect(() => ruleView(ex, exPrior, EXCEPTION_STEPS[0], { ...empty, observed: { W: true, F_Z: true } })).toThrow(/known set/)
  })

  it('the switch readings and equation follow the setting', () => {
    // Rule 3's exception: not separated, and the switch moves the prediction (0.692 → 0.5).
    const exOff = switchReading(ex, exPrior, EXCEPTION_STEPS[0], seenW)
    expect(exOff?.off.value?.toFixed(3)).toBe('0.692')
    expect(exOff?.on).toBeUndefined()
    const exOn = switchReading(ex, exPrior, EXCEPTION_STEPS[0], { ...seenW, setting: { Z: true } })
    expect(exOn?.on?.side).toEqual({ event: 'Y=1', given: 'W=1', do: { Z: true } })
    expect(exOn?.on?.value?.toFixed(3)).toBe('0.500')
    expect(exOn?.same).toBe(false)
    // Front door rule 2: separated, and setting X equals seeing X, at either value.
    const full = docToCase(lessonModel('m05-frontdoor'))
    const two: RuleStep = { label: '2', rule: 2, pair: ['F_X', 'Z'], given: ['X'], switches: ['X'], equal: [{ event: 'Z=1', do: { X: 1 } }, { event: 'Z=1', given: 'X=1' }] }
    for (const x of [false, true]) {
      const r = switchReading(full, prior, two, { ...empty, observed: { X: true }, setting: { X: x } })
      expect(r?.off.side).toEqual({ event: 'Z=1', given: `X=${x ? 1 : 0}` })
      expect(r?.on?.side).toEqual({ event: 'Z=1', given: undefined, do: { X: x } })
      expect(r?.same).toBe(true)
    }
    // The equation follows the switch, in do() and in the observation; the switch off leaves it as written.
    expect(equationUnder(two, { ...empty, setting: { X: false } })).toEqual([
      { event: 'Z=1', do: { X: false } },
      { event: 'Z=1', given: 'X=0' },
    ])
    expect(equationUnder(two, empty)).toEqual(two.equal)
    expect(ruleView(ex, exPrior, EXCEPTION_STEPS[0], { ...seenW, setting: { Z: false } }).equation?.[0].side.do).toEqual({ Z: false })
    // Rule 3 compares with Z unknown; the reading's current prediction is the one set.
    expect(exOn?.seen).toEqual({})
    expect(exOn?.now.value?.toFixed(3)).toBe('0.500')
    expect(exOff?.now.value?.toFixed(3)).toBe('0.692')
    expect(exOn?.differs).toBe(true)
    // Rule 2 compares setting Z=v with seeing Z=v at the same v, never at the written value.
    const fd = docToCase(lessonModel('m05-frontdoor'))
    const ruleTwo: RuleStep = { label: '2z', rule: 2, pair: ['F_Z', 'Y'], given: ['X', 'Z'], switches: ['Z'], equal: [{ event: 'Y=1', given: 'X=1', do: { Z: 1 } }, { event: 'Y=1', given: 'X=1 and Z=1' }] }
    const at0 = switchReading(fd, prior, ruleTwo, { ...initialRuleState(fd, ruleTwo), setting: { Z: false } })
    expect(at0?.off.side).toEqual({ event: 'Y=1', given: 'X=1 and Z=0' })
    expect(at0?.on?.side).toEqual({ event: 'Y=1', given: 'X=1', do: { Z: false } })
    expect(at0?.seen).toEqual({ Z: false })
    expect(at0?.same).toBe(true)
    expect(at0?.differs).toBe(false)
    expect(nodeValues({ ...seenW, setting: { Z: false } })).toEqual({ W: true, Z: false })
    // A cut-graph step tests no switch: no reading.
    expect(switchReading(ex, exPrior, EXCEPTION_STEPS[1], seenW)).toBeUndefined()
  })

  it('fails fast: a switched variable in cutIn, a switch test with cutOut or a cut the expression does not set', () => {
    const base = EXCEPTION_STEPS[0]
    expect(() => ruleView(ex, exPrior, { ...base, cutIn: ['Z'] }, seenW)).toThrow(/not cut/)
    expect(() => ruleView(ex, exPrior, { ...base, cutOut: ['Z'] }, seenW)).toThrow(/cutOut/)
    expect(() => ruleView(ex, exPrior, { ...base, cutIn: ['W'] }, seenW)).toThrow(/both sides set/)
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
    expect(marks()).toEqual(['pair', 'switch', 'known', 'open', 'menu', 'probe', 'switchMenu'])
    expect(container.querySelector('.ca-tags')?.textContent).toContain('加開關')
    expect(container.querySelector('[data-node="F_Z"]')?.getAttribute('aria-label')).toContain('要檢查的變數・干預開關')
    // Observing nothing closes the collider: 可換.
    fireEvent.click(container.querySelector('[data-node="W"]') as Element)
    fireEvent.click(getByRole('button', { name: '不觀察' }))
    expect(line()).toContain('分隔，可換')
    // A switch test writes one line for the current state, no equation row.
    expect(container.querySelector('.ca-rules-equal')).toBeNull()
    expect(container.querySelector('.ca-rules-switch')?.textContent).toContain('不動，Z 未知：P(Y=1)=0.50')
    fireEvent.click(getByRole('button', { name: 'wrong cut' }))
    expect(line()).toContain('分隔')
    expect(line()).not.toContain('適用')
    expect(line()).toContain('等式兩邊的數字不等')
    // Z is not set by both sides: its clamp is the dashed test-only one, named so in the legend.
    expect(container.querySelector('[data-node="Z"] [data-clamp="test"]')).not.toBeNull()
    expect(marks()).toEqual(['pair', 'known', 'testClamp', 'cut', 'menu'])
    expect(container.querySelector('.ca-rules-legend')?.textContent).not.toContain('由 do 設定')
    fireEvent.click(getByRole('button', { name: 'kept' }))
    expect(line()).toContain('規則三不適用')
  })

  it('F_Z opens Z’s menu; do(Z=0) sets the switch without adding Z to the known set', () => {
    const { container, getByRole } = render(<ProbabilityPanel doc={exceptionDoc} view="rules" rules={EXCEPTION_STEPS} />)
    const row = (): Element | null => container.querySelector('.ca-rules-switch')
    const head = (): string => container.querySelector('.ca-dsep-head')?.textContent ?? ''
    const marks = (): (string | null)[] => [...container.querySelectorAll('.ca-rules-legend li')].map((li) => li.getAttribute('data-mark'))
    const fz = (): Element => container.querySelector('[data-node="F_Z"]') as Element
    const value = (id: string): string | null => container.querySelector(`[data-node="${id}"]`)?.getAttribute('data-value') ?? null
    const text = (): string => (row()?.textContent ?? '').replace(/\u200b/g, '').replace('FZ', 'F_Z')
    const probe = (): string | null => container.querySelector('[data-readout="Y"]')?.textContent ?? null
    expect(row()?.getAttribute('data-switch-state')).toBe('off')
    // Switch off: one part, the current prediction with W seen and Z unknown; Y's node shows it.
    expect(text()).toBe('F_Z 不動，Z 未知：P(Y=1)=0.69')
    expect(probe()).toBe('0.69')
    expect(container.querySelector('.ca-rules-legend')?.textContent).toContain('在干預列設定開關，看 Y 的機率變不變')
    expect(marks()).toEqual(['pair', 'switch', 'known', 'open', 'menu', 'probe', 'switchMenu'])
    // Paths sit in a closed fold.
    expect(container.querySelector('details.ca-dsep-more')?.hasAttribute('open')).toBe(false)
    // The known W shows its value; Z and Y show none.
    expect([value('W'), value('Z'), value('Y')]).toEqual(['1', '', ''])
    expect(fz().getAttribute('aria-label')).toContain('打開它所控制的變數的選單')
    fireEvent.click(fz())
    expect(row()?.getAttribute('data-switch-state')).toBe('off')
    expect(getByRole('dialog').getAttribute('data-menu')).toBe('Z')
    expect(getByRole('group', { name: '干預（開關 F_Z）' })).not.toBeNull()
    fireEvent.click(getByRole('button', { name: 'do(Z=0)' }))
    expect(value('Z')).toBe('0')
    // Switch on: setting Z=0 against not setting it (rule 3: Z unknown), the probability at Y follows.
    expect(row()?.getAttribute('data-switch-state')).toBe('on')
    expect(text()).toBe('設定 Z=0：P(Y=1)=0.50 ／ 不設定，Z 未知：0.69 → 不同')
    expect(row()?.getAttribute('data-switch-same')).toBe('false')
    expect(probe()).toBe('0.50')
    expect(container.querySelector('[data-node="Z"][data-intervened="true"] .ca-stroke-clamp')).not.toBeNull()
    expect(container.querySelector('[data-edge="F_Z>Z"]')?.getAttribute('data-state')).not.toBe('cut')
    expect(container.querySelector('[data-edge="U>Z"]')?.getAttribute('data-state')).toBe('cut')
    expect(marks()).toEqual(['pair', 'switch', 'known', 'switchSet', 'cut', 'open', 'menu', 'probe', 'switchMenu'])
    expect(head()).toContain('已知 {W}')
    expect(head()).toContain('不可換')
    fireEvent.click(getByRole('button', { name: 'do(Z=1)' }))
    expect(value('Z')).toBe('1')
    expect(row()?.textContent).toContain('設定 Z=1')
    expect(row()?.textContent).toContain('0.5')
    // Observation works independently of the switch and survives releasing it; a seen Z is compared at the switch's value.
    fireEvent.click(getByRole('button', { name: 'Z=0' }))
    expect(head().replace(/\s/g, ' ')).toContain('已知 {W, Z}')
    expect(value('Z')).toBe('1')
    expect(row()?.textContent).toContain('看到 Z=1：')
    fireEvent.click(getByRole('button', { name: '放開' }))
    expect(row()?.getAttribute('data-switch-state')).toBe('off')
    expect(text()).toContain('F_Z 不動，看到 Z=0：')
    expect(value('Z')).toBe('0')
    fireEvent.click(getByRole('button', { name: 'do(Z=0)' }))
    fireEvent.click(getByRole('button', { name: 'switch' }))
    expect(row()?.getAttribute('data-switch-state')).toBe('off')
  })

  it('steps through the derivation and recomputes its verdict after observing a node', () => {
    const { container, getByRole } = render(<ProbabilityPanel doc={doc} view="rules" rules={FRONT_DOOR_STEPS} />)
    const line = (): string => container.querySelector('.ca-rules-line')?.textContent ?? ''
    const sides = (): string => container.querySelector('.ca-rules-equal')?.textContent ?? ''
    expect(line()).toContain('分隔')
    expect(line()).toContain('規則二適用')
    expect(sides()).toContain('0.9')
    expect(sides()).toContain('✓')
    // The clamp on X at step 3, no probability fill.
    fireEvent.click(getByRole('button', { name: '3' }))
    expect(container.querySelector('[data-node="X"] .ca-stroke-clamp')).not.toBeNull()
    expect(container.querySelector('[data-node="X"] rect[data-level]')).toBeNull()
    fireEvent.click(getByRole('button', { name: '2' }))
    fireEvent.click(container.querySelector('[data-node="Y"]') as Element)
    fireEvent.click(getByRole('button', { name: 'Y=1' }))
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
    expect(marks()).toEqual(['pair', 'cut', 'blocked', 'menu'])
    expect(container.querySelector('[data-path="blocked"]')).not.toBeNull()
    expect(container.querySelector('.ca-rules-legend')?.textContent).toContain('點節點打開選單：觀察或干預它。')
    fireEvent.click(getByRole('button', { name: '3' }))
    expect(marks()).toEqual(['pair', 'known', 'clamp', 'cut', 'menu'])
    expect(container.querySelector('[data-path]')).toBeNull()
    const x = container.querySelector('[data-node="X"]') as Element
    expect(x.getAttribute('aria-label')).toContain('給定・已由 do 設定')
    fireEvent.pointerEnter(x, { pointerType: 'mouse' })
    expect(container.querySelector('[data-node-tip="X"]')?.textContent).toBe('給定・已由 do 設定。點一下打開選單')
    const z = container.querySelector('[data-node="Z"]') as Element
    fireEvent.pointerEnter(z, { pointerType: 'mouse' })
    expect(container.querySelector('[data-node-tip="Z"]')?.textContent).toBe('要檢查的變數・只為檢驗剪掉出去的箭頭。點一下打開選單')
    fireEvent.pointerLeave(z, { pointerType: 'mouse' })
    expect(container.querySelector('.ca-node-tip')).toBeNull()
  })

  it('rule 1: release restores the arrow, opens the path and recomputes both sides; observe and reset', () => {
    const { container, getByRole, queryByRole } = render(<ProbabilityPanel doc={lessonModel('m06-rule1')} view="rules" rules={RULE_ONE_STEPS} />)
    const x = container.querySelector<SVGGElement>('[data-node="X"]')!
    const arrow = () => container.querySelector('[data-edge="Z>X"]')?.getAttribute('data-state')
    const verdict = () => container.querySelector('.ca-dsep-head')?.textContent?.replace(/\s/g, ' ')
    const equation = () => container.querySelector('.ca-rules-equal .ca-mono [data-text]')?.getAttribute('data-text')
    const observeOne = () => getByRole('button', { name: 'X=1' })
    const release = () => getByRole('button', { name: '放開' })
    expect(verdict()).toContain('已知 {X, W} → 分隔，規則一適用')
    expect(equation()).toBe('P(Y=1 | Z=1, W=1, do(X=1)) = 0.5 = P(Y=1 | W=1, do(X=1)) = 0.5')
    expect(arrow()).toBe('cut')
    expect(x.querySelector('.ca-fill-accent')).not.toBeNull()
    x.focus()
    fireEvent.keyDown(x, { key: 'Enter' })
    const menu = getByRole('dialog')
    expect(document.activeElement).toBe(menu)
    expect(menu.textContent).toContain('干預中的變數一定已知（它的值寫在式子裡）。放開干預後才能改觀察。')
    expect(observeOne().getAttribute('aria-pressed')).toBe('true')
    expect([...menu.querySelectorAll<HTMLButtonElement>('[data-observe]')].every((b) => b.disabled)).toBe(true)
    expect(menu.querySelector('.ca-node-menu-soft, .ca-node-menu-probs')).toBeNull()
    fireEvent.click(release())
    expect(getByRole('dialog')).toBe(menu)
    expect(x.querySelector('.ca-stroke-clamp, .ca-fill-accent')).toBeNull()
    expect(x.getAttribute('data-value')).toBe('')
    expect(arrow()).not.toBe('cut')
    expect(verdict()).toContain('已知 {W} → 暢通，規則一不適用')
    expect(equation()).toBe('P(Y=1 | Z=1, W=1) = 0.44 ≠ P(Y=1 | W=1) = 0.404')
    expect(container.querySelector('[data-path-open="true"]')?.textContent).toContain('Z→X→Y')
    expect(observeOne().hasAttribute('disabled')).toBe(false)
    expect(release().hasAttribute('disabled')).toBe(true)
    fireEvent.click(observeOne())
    expect(verdict()).toContain('分隔，規則一適用')
    expect(equation()).toBe('P(Y=1 | Z=1, W=1, X=1) = 0.5 = P(Y=1 | W=1, X=1) = 0.5')
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(x)
    fireEvent.click(x)
    fireEvent.pointerDown(container)
    expect(queryByRole('dialog')).toBeNull()
    fireEvent.click(getByRole('button', { name: '已知病情' }))
    expect(arrow()).toBe('cut')
    expect(equation()).toBe('P(Y=1 | Z=1, W=1, do(X=1)) = 0.5 = P(Y=1 | W=1, do(X=1)) = 0.5')
  })

  it('locks both rows for each member of the tested pair; an exogenous node only observes', () => {
    const { container, getByRole } = render(<ProbabilityPanel doc={lessonModel('m06-rule1')} view="rules" rules={RULE_ONE_STEPS} />)
    for (const id of ['Z', 'Y']) {
      fireEvent.click(container.querySelector(`[data-node="${id}"]`) as Element)
      const menu = getByRole('dialog')
      expect(menu.textContent).toContain('要檢查是否分隔的變數，不能觀察或干預')
      const actions = [...menu.querySelectorAll<HTMLButtonElement>('[data-do], [data-observe]')]
      expect(actions).toHaveLength(6)
      expect(actions.every((b) => b.disabled)).toBe(true)
    }
    fireEvent.click(container.querySelector('[data-node="W"]') as Element)
    expect(getByRole('dialog').querySelector('[data-do]')).toBeNull()
    expect(getByRole('button', { name: 'W=0' }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(getByRole('button', { name: 'W=0' }))
    expect(container.querySelector('.ca-rules-equal [data-text]')?.getAttribute('data-text')).toContain('Z=1, W=0, do(X=1)')
  })

  it('keeps the equation visible when menu evidence has probability zero', () => {
    const base = lessonModel('m06-rule1')
    if (base.priors === undefined || !('independent' in base.priors)) throw new Error('expected independent priors')
    const certainIllness = { ...base, priors: { independent: { ...base.priors.independent, W: 1 } } }
    const { container, getByRole } = render(<ProbabilityPanel doc={certainIllness} view="rules" rules={RULE_ONE_STEPS} />)
    fireEvent.click(container.querySelector('[data-node="W"]') as Element)
    fireEvent.click(getByRole('button', { name: 'W=0' }))
    const equation = container.querySelector('.ca-rules-equal')
    expect(equation?.getAttribute('data-equal')).toBe('unavailable')
    expect(equation?.textContent?.match(/證據的機率是 0/g)).toHaveLength(2)
    expect(equation?.querySelectorAll('[data-text]')).toHaveLength(2)
  })

  it('fails fast without rules', () => {
    expect(() => renderToString(<ProbabilityPanel doc={doc} view="rules" />)).toThrow(/rules/)
  })
})

describe('RulesPanel: a generated derivation', () => {
  const g = admgForPrior(fd.model, prior)
  const derived = derive(g, ['Y'], ['X'])
  if (!derived.identifiable) throw new Error('identifiable')
  const steps = derivationSteps(derived.steps)

  it('shows a symbolic rule step with its sides typeset, its cut graph and the check at every assignment', () => {
    const { container, getByRole } = render(<RulesPanel c={fd} prior={prior} steps={steps} shown={fd.model.endogenous} />)
    expect([...container.querySelectorAll('.ca-rules-steps button')].map((b) => b.textContent)).toEqual(steps.map((s) => s.label))
    expect(container.querySelector('[data-calculus="expand"]')).not.toBeNull()
    expect(container.querySelector('.ca-rules-line')?.textContent).toContain('Σ 展開')
    expect(container.querySelector('.ca-rules-equal')?.getAttribute('data-verdict')).toBe('holds')
    const third = steps.findIndex((s) => !isCalculus(s))
    fireEvent.click(getByRole('button', { name: steps[third].label }))
    expect(container.querySelector('[data-calculus]')).toBeNull()
    expect(container.querySelector('[data-verdict]')?.getAttribute('data-verdict')).toBe('applies')
    const equal = container.querySelector('.ca-rules-equal')
    expect(equal?.getAttribute('data-equal')).toBe('true')
    expect(equal?.querySelector('[data-text]')?.getAttribute('data-text')).toBe('P(z|do(x)) = P(z|x)')
    expect(equal?.textContent).toContain('組取值上用完整模型比對')
    expect(container.querySelector('.ca-stroke-cut')).not.toBeNull()
  })
})
