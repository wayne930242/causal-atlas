// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { lessonModel } from '../demo/lesson-models.ts'
import { CausalPlayground } from './index.ts'

afterEach(cleanup)

const node = (container: HTMLElement, id: string): Element => {
  const el = container.querySelector(`[data-node="${id}"]`)
  if (el === null) throw new Error(`no node ${id}`)
  return el
}
const readout = (container: HTMLElement, id: string): string => node(container, id).querySelector(`[data-readout="${id}"]`)?.textContent ?? ''
const note = (container: HTMLElement, id: string): string | null => node(container, id).querySelector('[data-note]')?.textContent ?? null
const chip = (container: HTMLElement): string | null => container.querySelector('.ca-do-chip')?.getAttribute('data-text') ?? null
const mode = (container: HTMLElement, name: string): HTMLElement =>
  within(within(container).getByRole('group', { name: '視角' })).getByRole('button', { name })

const nervous = lessonModel('m00-firing-squad-nervous')
const lesson07 = [{ label: 'D=1, A←0', observed: { D: 1 }, interventions: { A: 0 } }]

describe('playground reading: 干預｜反事實', () => {
  it('shows the label 視角 and a one-line hint for the chosen reading', () => {
    const { container } = render(<CausalPlayground doc={nervous} />)
    const box = container.querySelector('.ca-reading-box')
    expect(box?.querySelector('.ca-reading-label')?.textContent).toBe('視角')
    expect(box?.querySelector('.ca-reading-hint')?.textContent).toBe('點選的是干預之後看到的結果')
    fireEvent.click(mode(container, '反事實'))
    expect(box?.querySelector('.ca-reading-hint')?.textContent).toBe('點選的是實際發生過的事，再問：假如當初……會怎樣')
  })


  it('appears on probability graphs only', () => {
    const prob = render(<CausalPlayground doc={nervous} />)
    expect(mode(prob.container, '干預').getAttribute('aria-pressed')).toBe('true')
    expect(mode(prob.container, '反事實').getAttribute('aria-pressed')).toBe('false')
    prob.unmount()
    const values = render(<CausalPlayground caseId="forest-fire-disjunctive" />)
    expect(within(values.container).queryByRole('group', { name: '視角' })).toBeNull()
  })

  it('lesson 07: the same settings read 1.00 after do() then observing, 0.92 as a counterfactual', () => {
    const { container } = render(<CausalPlayground doc={nervous} presets={lesson07} />)
    fireEvent.click(within(container).getByRole('button', { name: 'D=1, A←0' }))
    // P(D=1 | do(A=0), D=1) = 1: the observation conditions the intervened model.
    expect(readout(container, 'D')).toBe('1.00')
    fireEvent.click(mode(container, '反事實'))
    // P(D_{A=0}=1 | D=1) = 1 − 0.0789.
    expect(readout(container, 'D')).toBe('0.92')
    expect(note(container, 'D')).toBe('實際 1')
    expect(node(container, 'D').getAttribute('data-observed')).toBe('1')
    expect(chip(container)).toBe('D=1 ⇒ 若 do(A=0)')
    expect(container.querySelector('[data-world]')?.getAttribute('data-world')).toBe('counterfactual')
  })

  it('a node may be evidence and action at once; going back drops the evidence half', () => {
    const { container } = render(<CausalPlayground doc={nervous} />)
    fireEvent.click(mode(container, '反事實'))
    fireEvent.click(node(container, 'A'))
    expect(node(container, 'A').getAttribute('data-observed')).toBe('1')
    // Shift+click: the hypothetical action, at the observed value first.
    fireEvent.click(node(container, 'A'), { shiftKey: true })
    expect(node(container, 'A').getAttribute('data-intervened')).toBe('true')
    expect(node(container, 'A').getAttribute('data-observed')).toBe('1')
    expect(note(container, 'A')).toBe('實際 1')
    // A click on it now changes the evidence, not the action.
    fireEvent.click(node(container, 'A'))
    expect(node(container, 'A').getAttribute('data-observed')).toBe('0')
    expect(node(container, 'A').getAttribute('data-intervened')).toBe('true')
    fireEvent.click(mode(container, '干預'))
    expect(node(container, 'A').getAttribute('data-observed')).toBeNull()
    expect(node(container, 'A').getAttribute('data-intervened')).toBe('true')
  })

  it('switching keeps what is set: an observation becomes evidence', () => {
    const { container } = render(<CausalPlayground doc={nervous} />)
    fireEvent.click(node(container, 'D'))
    expect(chip(container)).toBe('D=1')
    fireEvent.click(mode(container, '反事實'))
    expect(node(container, 'D').getAttribute('data-observed')).toBe('1')
    expect(readout(container, 'C')).toBe('0.92')
  })

  it('Pearl models 1 and 2: Y_{X=0} given X=1, Y=1 is 1 in one and 0 in the other', () => {
    const preset = [{ label: 'q', observed: { X: 1, Y: 1 }, interventions: { X: 0 } }]
    for (const [id, y] of [
      ['m02-pearl-model1', '1.00'],
      ['m02-pearl-model2', '0.00'],
    ] as const) {
      const { container, unmount } = render(<CausalPlayground doc={lessonModel(id)} presets={preset} />)
      fireEvent.click(mode(container, '反事實'))
      fireEvent.click(within(container).getByRole('button', { name: 'q' }))
      expect(readout(container, 'Y')).toBe(y)
      unmount()
    }
  })
})

describe('counterfactual reading with impossible evidence', () => {
  it('reads — instead of throwing', () => {
    const { container } = render(<CausalPlayground doc={nervous} presets={[{ label: 'no', observed: { A: 0, D: 1 } }]} />)
    fireEvent.click(mode(container, '反事實'))
    fireEvent.click(within(container).getByRole('button', { name: 'no' }))
    expect(readout(container, 'D')).toBe('—')
  })
})
