// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lessonModel } from '../../demo/lesson-models.ts'
import type { ModelDoc } from '../../data/schema.ts'
import { modelDocSchema } from '../../data/schema.ts'
import { ProbabilityPanel } from '../index.ts'

afterEach(cleanup)

const pill = lessonModel('m08-pill')
const query = { treatment: 'X', mediators: ['Z'], outcome: 'Y=1', from: 0, to: 1 } as const

const root = (container: HTMLElement): Element => {
  const el = container.querySelector('[data-view="mediation"]')
  if (el === null) throw new Error('no mediation view')
  return el
}
const stepButton = (container: HTMLElement, n: number): HTMLElement =>
  within(within(container).getByRole('group', { name: '中介效應的步驟' })).getAllByRole('button')[n - 1]
const node = (container: HTMLElement, id: string): Element => {
  const el = container.querySelector(`[data-node="${id}"]`)
  if (el === null) throw new Error(`no node ${id}`)
  return el
}
const readout = (container: HTMLElement, id: string): string =>
  node(container, id).querySelector(`[data-readout="${id}"]`)?.textContent ?? ''
const value = (container: HTMLElement): string => container.querySelector('[data-testid="med-value"]')?.textContent ?? ''
const effect = (container: HTMLElement, key: string): string => container.querySelector(`[data-effect="${key}"] td`)?.textContent ?? ''
const tag = (container: HTMLElement, id: string): string => node(container, id).textContent ?? ''

describe('ProbabilityPanel view="mediation": the pill, step by step', () => {
  it('step 1 is the total effect: the pill moves nothing in total', () => {
    const { container } = render(<ProbabilityPanel doc={pill} view="mediation" mediation={query} />)
    expect(root(container).getAttribute('data-step')).toBe('1')
    expect(value(container)).toBe('0.00')
    expect(container.querySelector('[data-testid="med-numbers"]')?.textContent).toBe('0.25 − 0.25')
    expect(node(container, 'X').getAttribute('data-intervened')).toBe('true')
    expect(tag(container, 'X')).toContain('X←1')
    expect(readout(container, 'Y')).toBe('0.25')
  })

  it('step 2 is the controlled direct effect, with a switch over the mediator', () => {
    const { container } = render(<ProbabilityPanel doc={pill} view="mediation" mediation={query} />)
    fireEvent.click(stepButton(container, 2))
    expect(root(container).getAttribute('data-step')).toBe('2')
    expect(value(container)).toBe('+0.20')
    expect(tag(container, 'Z')).toContain('Z←0')
    const z = within(container).getByRole('group', { name: '中介變數固定的值' })
    fireEvent.click(within(z).getByRole('button', { name: 'Z=1' }))
    expect(value(container)).toBe('+0.10')
    expect(tag(container, 'Z')).toContain('Z←1')
    // The arrows into the mediator are cut, the one from the treatment to the outcome stays.
    expect(container.querySelectorAll('[data-state="cut"]').length).toBeGreaterThan(0)
  })

  it('step 3 is the natural direct effect: the mediator is tagged as held at its natural value', () => {
    const { container } = render(<ProbabilityPanel doc={pill} view="mediation" mediation={query} />)
    fireEvent.click(stepButton(container, 3))
    expect(value(container)).toBe('+0.15')
    expect(tag(container, 'Z')).toContain('Z←Z(X=0)')
    expect(tag(container, 'X')).toContain('X←1')
    expect(container.querySelector('[data-testid="med-expression"] .ca-tex')?.getAttribute('data-text')).toBe(
      'P(Y_{X=1, Z_{X=0}}=1) − P(Y_{X=0}=1)',
    )
  })

  it('step 4 is the natural indirect effect: the other treatment value, held the other way', () => {
    const { container } = render(<ProbabilityPanel doc={pill} view="mediation" mediation={query} initialStep={4} />)
    expect(root(container).getAttribute('data-step')).toBe('4')
    expect(value(container)).toBe('−0.1875')
    expect(tag(container, 'Z')).toContain('Z←Z(X=1)')
    expect(tag(container, 'X')).toContain('X←0')
    expect(container.querySelector('[data-testid="med-expression"] .ca-tex')?.getAttribute('data-text')).toBe(
      'P(Y_{X=0, Z_{X=1}}=1) − P(Y_{X=0}=1)',
    )
  })

  it('the effects tab lists every effect and the check TE = NDE − IE(reverse)', () => {
    const { container } = render(<ProbabilityPanel doc={pill} view="mediation" mediation={{ ...query, formula: true }} />)
    expect(effect(container, 'total')).toBe('0.00')
    expect(container.querySelector('[data-effect="controlled"][data-z="Z=0"] td')?.textContent).toBe('+0.20')
    expect(container.querySelector('[data-effect="controlled"][data-z="Z=1"] td')?.textContent).toBe('+0.10')
    expect(effect(container, 'natural-direct')).toBe('+0.15')
    expect(effect(container, 'natural-indirect')).toBe('−0.1875')
    expect(effect(container, 'reverse-indirect')).toBe('+0.15')
    const check = container.querySelector('[data-effect="decomposition"]')
    expect(check?.getAttribute('data-ok')).toBe('true')
    expect(check?.textContent).toContain('0.00 = +0.15 − (+0.15)')
    // Markovian: the mediation formula equals the natural effects.
    expect(container.querySelector('[data-effect="formula-direct"]')?.getAttribute('data-check')).toBe('equal')
    expect(container.querySelector('[data-effect="formula-indirect"]')?.getAttribute('data-check')).toBe('equal')
    expect(container.querySelector('[data-testid="med-missing"]')).toBeNull()
  })

  it('without `formula` the effects tab has no mediation-formula rows', () => {
    const { container } = render(<ProbabilityPanel doc={pill} view="mediation" mediation={query} />)
    expect(container.querySelector('[data-effect="formula-direct"]')).toBeNull()
  })

  it('the background tab folds past 8 rows', () => {
    const { container } = render(<ProbabilityPanel doc={pill} view="mediation" mediation={query} />)
    // 5 independent binary exogenous variables: 32 backgrounds.
    fireEvent.click(within(container).getByRole('button', { name: '背景表' }))
    expect(container.querySelectorAll('[data-background]').length).toBe(8)
    fireEvent.click(within(container).getByRole('button', { name: '看全部 32 種背景' }))
    expect(container.querySelectorAll('[data-background]').length).toBe(32)
  })

  it('the mediation formula differs from the natural direct effect when aptitude is unrecorded', () => {
    const { container } = render(
      <ProbabilityPanel
        doc={lessonModel('m08-sex-department')}
        view="mediation"
        mediation={{ treatment: 'X', mediators: ['Z'], outcome: 'Y=1', from: 0, to: 1, formula: true }}
      />,
    )
    expect(effect(container, 'natural-direct')).toBe('−0.095')
    expect(container.querySelector('[data-effect="formula-direct"]')?.getAttribute('data-check')).toBe('differ')
    expect(container.querySelector('[data-effect="formula-direct"] td')?.textContent).toContain('+0.115')
  })

  it('the background table labels its Y columns with the event when the outcome is not Y=1', () => {
    const heads = (outcome: string): string =>
      Array.from(
        render(<ProbabilityPanel doc={pill} view="mediation" mediation={{ ...query, outcome }} />).container.querySelectorAll('th[scope="col"] [data-text]'),
      )
        .map((n) => n.getAttribute('data-text'))
        .join('|')
    expect(heads('Y=0')).toContain('[Y=0](')
    cleanup()
    expect(heads('Y=1')).not.toContain('[Y=1]')
  })

  it('a mediator that copies the treatment leaves cells without data: the formula reads — and names them', () => {
    const copy: ModelDoc = modelDocSchema.parse({
      format: 'causal-atlas/model',
      version: 1,
      title: 'The mediator copies the treatment',
      model: {
        variables: [
          { id: 'U_X', label: { 'zh-TW': '外因', en: 'Cause' }, kind: 'exogenous', domain: 'boolean' },
          { id: 'U_A', label: { 'zh-TW': '直接', en: 'Direct' }, kind: 'exogenous', domain: 'boolean' },
          { id: 'X', label: { 'zh-TW': '處置', en: 'Treatment' }, kind: 'endogenous', domain: 'boolean' },
          { id: 'Z', label: { 'zh-TW': '中介', en: 'Mediator' }, kind: 'endogenous', domain: 'boolean' },
          { id: 'Y', label: { 'zh-TW': '結果', en: 'Outcome' }, kind: 'endogenous', domain: 'boolean' },
        ],
        equations: { X: 'U_X', Z: 'X', Y: '(X and U_A) or Z' },
      },
      priors: { independent: { U_X: 0.5, U_A: 0.5 } },
    })
    const { container } = render(<ProbabilityPanel doc={copy} view="mediation" mediation={{ ...query, formula: true }} />)
    expect(container.querySelector('[data-effect="formula-direct"]')?.getAttribute('data-check')).toBe('undefined')
    expect(container.querySelector('[data-effect="formula-direct"] td')?.textContent).toBe('—')
    expect(container.querySelector('[data-testid="med-missing"]')?.textContent).toContain('X=1, Z=0')
    // The natural effects themselves are computed from the full model: holding Z at its value under X=0, Y = U_A.
    expect(effect(container, 'natural-direct')).toBe('+0.50')
  })

  it('recomputes when a prior slider moves', () => {
    const { container } = render(<ProbabilityPanel doc={pill} view="mediation" mediation={query} initialStep={3} />)
    fireEvent.click(within(container).getByRole('button', { name: /式子和機率/ }))
    const slider = container.querySelector<HTMLInputElement>('input[type="range"][id$="-U_A"]')
    if (slider === null) throw new Error('no slider for U_A')
    // The pill raises thrombosis through U_A only: with U_A = 0 there is no direct effect.
    fireEvent.change(slider, { target: { value: '0' } })
    expect(value(container)).toBe('0.00')
  })

  it('speaks English', () => {
    const { container } = render(<ProbabilityPanel doc={pill} view="mediation" mediation={query} locale="en" initialStep={3} />)
    expect(within(container).getByRole('group', { name: 'Steps of the mediation' })).not.toBeNull()
    expect(container.textContent).toContain('Natural direct effect')
    expect(container.textContent).toContain('Effects')
  })

  it('needs a mediation spec', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<ProbabilityPanel doc={pill} view="mediation" />)).toThrow(/view="mediation" needs a mediation/)
    spy.mockRestore()
  })
})
