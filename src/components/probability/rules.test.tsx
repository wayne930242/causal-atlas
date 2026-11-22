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

describe('ProbabilityPanel view="rules"', () => {
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
    expect(x.getAttribute('aria-label')).toContain('已知・已設定')
    fireEvent.pointerEnter(x, { pointerType: 'mouse' })
    expect(container.querySelector('[data-node-tip="X"]')?.textContent).toBe('已知・已設定。點一下移出已知集合')
    const z = container.querySelector('[data-node="Z"]') as Element
    fireEvent.pointerEnter(z, { pointerType: 'mouse' })
    expect(container.querySelector('[data-node-tip="Z"]')?.textContent).toBe('要檢查的變數・出去的箭頭剪掉。點一下加進已知集合')
    fireEvent.pointerLeave(z, { pointerType: 'mouse' })
    expect(container.querySelector('.ca-node-tip')).toBeNull()
  })

  it('fails fast without rules', () => {
    expect(() => renderToString(<ProbabilityPanel doc={doc} view="rules" />)).toThrow(/rules/)
  })
})
