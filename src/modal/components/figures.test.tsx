// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { modalModel } from '../../demo/modal-models.ts'
import { FrameConditions, IntensionTable, KripkeView, LocaleProvider, SphereView, StrictImplication, SurgeryVsSimilarity, TcsCheck } from '../index.ts'

afterEach(cleanup)

function world(container: HTMLElement, id: string): Element {
  const el = container.querySelector(`[data-world="${id}"]`)
  if (el === null) throw new Error(`no world ${id}`)
  return el
}

function truthOf(button: Element): string | null {
  return button.querySelector('.ca-modal-truth')?.getAttribute('data-value') ?? null
}

describe('IntensionTable', () => {
  it('reads a_w(A) for the picked world and marks the picked sentence’s truth set', () => {
    const { container } = render(<IntensionTable model={modalModel('md-rain-intension')} />)
    expect(container.querySelector('.ca-modal-reading [data-text]')?.getAttribute('data-text')).toBe('a_晴天(rain) = F')
    fireEvent.click(screen.getByRole('button', { name: '選擇世界 雨天' }))
    expect(container.querySelector('.ca-modal-reading [data-text]')?.getAttribute('data-text')).toBe('a_雨天(rain) = T')
    const inSet = [...container.querySelectorAll('td[data-in-set="true"]')]
    expect(inSet).toHaveLength(1)
  })
})

describe('KripkeView', () => {
  it('marks the counterexample to □rain and the witness for ◇rain at w', () => {
    const { container } = render(<KripkeView model={modalModel('md-rain-access')} />)
    expect(world(container, 'u').getAttribute('data-mark')).toBe('counter')
    expect(container.querySelector('.ca-modal-explain')?.textContent).toBe('w 可及 u，而 rain 在 u 為假：這是反例。')
    const buttons = container.querySelectorAll('.ca-modal-formula')
    expect([...buttons].map(truthOf)).toEqual(['F', 'T'])
    fireEvent.click(buttons[1] as Element)
    expect(world(container, 'v').getAttribute('data-mark')).toBe('witness')
    // From v, which sees nothing, □rain is vacuously true.
    fireEvent.click(world(container, 'v'))
    expect([...container.querySelectorAll('.ca-modal-formula')].map(truthOf)).toEqual(['T', 'F'])
  })

  it('lets the reader add an arrow and type a formula when editable', () => {
    const { container } = render(<KripkeView model={modalModel('md-rain-access')} editable locale="en" />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'u sees v' }))
    expect(container.querySelector('[data-from="u"][data-to="v"]')).not.toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: 'Type a formula' }), { target: { value: '<><>rain' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    const buttons = [...container.querySelectorAll('.ca-modal-formula')]
    expect(buttons).toHaveLength(3)
    expect(truthOf(buttons[2] as Element)).toBe('T')
    expect(buttons[2]?.getAttribute('aria-pressed')).toBe('true')
  })

  it('takes its language from the entry’s LocaleProvider', () => {
    const { container } = render(
      <LocaleProvider locale="en">
        <KripkeView model={modalModel('md-rain-access')} />
      </LocaleProvider>,
    )
    expect(container.querySelector('.ca-modal-explain')?.textContent).toBe('w sees u, where rain is false: a counterexample.')
  })
})

describe('FrameConditions', () => {
  it('lists each condition beside its axiom and marks the picked counterexample', () => {
    const { container } = render(<FrameConditions frame={modalModel('md-time')} />)
    const holds = [...container.querySelectorAll('tr[data-condition]')].map((r) => [r.getAttribute('data-condition'), r.getAttribute('data-holds')])
    expect(holds).toEqual([
      ['serial', 'false'],
      ['reflexive', 'false'],
      ['transitive', 'true'],
      ['symmetric', 'false'],
      ['euclidean', 'false'],
    ])
    expect(container.textContent).toContain('M（又稱 T）')
    fireEvent.click(screen.getByRole('button', { name: '序列的' }))
    expect(world(container, 'afternoon').getAttribute('data-mark')).toBe('counter')
    expect(container.querySelector('.ca-modal-systems')?.textContent).toBe('這個框架屬於 K 的框架類。')
  })
})

describe('StrictImplication', () => {
  it('finds both material conditionals true and the strict one false at w', () => {
    const { container } = render(<StrictImplication model={modalModel('md-strict')} antecedent="rain" consequent="wet" />)
    expect(truthOf(container.querySelector('[data-kind="material"]') as Element)).toBe('T')
    expect(truthOf(container.querySelector('[data-kind="strict"]') as Element)).toBe('F')
    expect(world(container, 'u').getAttribute('data-mark')).toBe('counter')
    cleanup()
    const other = render(<StrictImplication model={modalModel('md-strict')} antecedent="rain" consequent="~wet" />)
    expect(truthOf(other.container.querySelector('[data-kind="material"]') as Element)).toBe('T')
  })
})

describe('TcsCheck', () => {
  it('finds a counterfactual counterexample to each inference, gone once the spheres are pressed into one', () => {
    const { container } = render(
      <TcsCheck
        items={[
          { pattern: 'transitivity', model: modalModel('md-carter'), a: 'died', b: '~lost', c: '~reagan' },
          { pattern: 'contraposition', model: modalModel('md-lawn'), a: 'rain', b: '~water' },
          { pattern: 'strengthening', model: modalModel('md-umbrella'), a: 'rain', b: 'umbrella', c: 'stolen' },
        ]}
      />,
    )
    const verdicts = () => [...container.querySelectorAll('.ca-modal-column')].map((c) => `${c.getAttribute('data-kind')}:${c.getAttribute('data-counterexample')}`)
    expect(verdicts()).toEqual(['strict:false', 'counterfactual:true', 'strict:false', 'counterfactual:true', 'strict:false', 'counterfactual:true'])
    // The contrapositive of rain > ¬water reads water > ¬rain.
    expect(container.querySelector('[data-pattern="contraposition"] [data-kind="counterfactual"] [data-conclusion] [data-text]')?.getAttribute('data-text')).toBe('water > ¬rain')
    fireEvent.click(screen.getByRole('checkbox', { name: '壓成一層' }))
    expect(verdicts().filter((v) => v.endsWith('true'))).toEqual([])
  })
})

describe('SphereView', () => {
  it('shows Lewis’s verdicts and Stalnaker’s undefined selection on the programmer example', () => {
    const { container } = render(<SphereView model={modalModel('md-programmer')} />)
    expect(container.querySelector('[data-sphere="1"]')?.getAttribute('data-active')).toBe('true')
    expect(world(container, 'v1').getAttribute('data-mark')).toBe('selected')
    expect(world(container, 'v2').getAttribute('data-mark')).toBe('counter')
    expect([...container.querySelectorAll('.ca-modal-formula')].map(truthOf)).toEqual(['F', 'F'])
    fireEvent.click(screen.getByRole('button', { name: 'Stalnaker' }))
    expect(container.querySelector('.ca-modal-explain .ca-modal-problem')?.textContent).toContain('主管不肯定、受主管肯定')
    expect([...container.querySelectorAll('.ca-modal-formula')].map(truthOf)).toEqual(['error', 'error'])
  })
})

describe('SurgeryVsSimilarity', () => {
  it('parts when avoiding war weighs most and agrees once it weighs little', () => {
    const { container } = render(<SurgeryVsSimilarity model={modalModel('md-nixon')} locale="en" />)
    const agree = () => container.querySelector('.ca-modal-agree')?.getAttribute('data-agree')
    expect(agree()).toBe('false')
    expect(container.textContent).toContain('This solution is world pcw.')
    fireEvent.change(screen.getByRole('slider', { name: 'differs from the actual war' }), { target: { value: '0.5' } })
    expect(agree()).toBe('true')
    expect(world(container, 'pcw').getAttribute('data-mark')).toBe('selected')
  })

  it('needs an antecedent made of literals', () => {
    const { container } = render(<SurgeryVsSimilarity model={modalModel('md-nixon')} antecedent="press | connected" consequent="war" />)
    expect(container.querySelector('[data-code]')?.getAttribute('data-code')).toBe('surgery-antecedent')
  })
})
