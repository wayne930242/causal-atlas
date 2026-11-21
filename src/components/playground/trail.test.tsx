// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { lessonModel } from '../../demo/lesson-models.ts'
import { doNode, observeNode } from '../test-menu.ts'
import { CausalPlayground, ProbabilityPanel } from '../index.ts'

afterEach(cleanup)

const node = (container: HTMLElement, id: string): Element => {
  const el = container.querySelector(`[data-node="${id}"]`)
  if (el === null) throw new Error(`no node ${id}`)
  return el
}
const note = (container: HTMLElement, id: string): string | null => node(container, id).querySelector('[data-note]')?.textContent ?? null
const trail = (container: HTMLElement, id: string): string | null => container.querySelector(`[data-trail="${id}"]`)?.getAttribute('data-text') ?? null

const collider = lessonModel('m02-collider')

describe('trail (a): a probability graph keeps 原本 v under each changed number', () => {
  it('notes only the nodes whose number moved, against the prior', () => {
    const { container } = render(<CausalPlayground doc={collider} />)
    expect(note(container, 'Y')).toBeNull()
    observeNode(container, 'Z', '1')
    expect(note(container, 'Y')).toBe('原本 0.50')
    expect(note(container, 'X')).toBe('原本 0.50')
    // Z is observed: it reads 已知 = 1 and carries no 原本 line.
    expect(note(container, 'Z')).toBeNull()
    expect(container.querySelector('[data-node="Z"] [data-readout]')?.textContent).toBe('已知 = 1')
    observeNode(container, 'X', '1')
    // Y is back at 0.50: no note.
    expect(note(container, 'Y')).toBeNull()
  })

  it('a graph with values keeps its own 原本 mark and gets no number notes', () => {
    const { container } = render(<CausalPlayground caseId="forest-fire-disjunctive" />)
    doNode(container, 'L', '0')
    expect(container.querySelector('[data-note]')).toBeNull()
  })
})

describe('trail (b): track lists what each setting did to the tracked nodes', () => {
  it('Y: 0.50 → 0.67 (Z=1) → 0.50 (Z=1, X=1), and back to the prior clears it', () => {
    const { container } = render(<CausalPlayground doc={collider} track={['Y']} />)
    expect(trail(container, 'Y')).toBe('Y：0.50')
    observeNode(container, 'Z', '1')
    expect(trail(container, 'Y')).toBe('Y：0.50 → 0.67（Z=1）')
    observeNode(container, 'X', '1')
    expect(trail(container, 'Y')).toBe('Y：0.50 → 0.67（Z=1）→ 0.50（Z=1, X=1）')
    fireEvent.click(within(container).getByRole('button', { name: '回到原本的機率' }))
    expect(trail(container, 'Y')).toBe('Y：0.50')
  })

  it('keeps the last five entries', () => {
    const { container } = render(<CausalPlayground doc={collider} track={['Y']} />)
    for (const v of ['1', '0', undefined, '1', '0', undefined]) observeNode(container, 'X', v)
    const text = trail(container, 'Y') ?? ''
    expect(text.startsWith('Y：…')).toBe(true)
    expect(text.split('→').length).toBe(5)
  })

  it('a step button starts the trail again', () => {
    const { container } = render(<CausalPlayground doc={collider} track={['Y']} presets={[{ label: 'see Z', observed: { Z: 1 } }]} />)
    observeNode(container, 'X', '1')
    fireEvent.click(within(container).getByRole('button', { name: 'see Z' }))
    expect(trail(container, 'Y')).toBe('Y：0.50 → 0.67（Z=1）')
  })
})

describe('compare: several pairs share one panel', () => {
  const sprinkler = lessonModel('m03-sprinkler')
  const pairs = [
    { event: 'W=1', observe: 'S=1', intervene: { S: 1 } },
    { event: 'W=1', observe: 'S=0', intervene: { S: 0 } },
  ]
  it('a value switch changes both sides at once', () => {
    const { container, getByTestId } = render(<ProbabilityPanel doc={sprinkler} view="compare" pair={pairs} />)
    const sw = within(container).getByRole('group', { name: '切換比較的值' })
    const [one, zero] = within(sw).getAllByRole('button')
    expect(one.getAttribute('aria-pressed')).toBe('true')
    const seeOne = getByTestId('see-value').textContent
    const doOne = getByTestId('do-value').textContent
    fireEvent.click(zero)
    expect(zero.getAttribute('aria-pressed')).toBe('true')
    expect(getByTestId('see-value').textContent).toBe('0.60')
    expect(getByTestId('do-value').textContent).toBe('0.40')
    expect(getByTestId('see-value').textContent).not.toBe(seeOne)
    expect(getByTestId('do-value').textContent).not.toBe(doOne)
  })

  it('one pair draws as before, with no switch', () => {
    const { container } = render(<ProbabilityPanel doc={sprinkler} view="compare" pair={pairs[1]} />)
    expect(within(container).queryByRole('group', { name: '切換比較的值' })).toBeNull()
  })
})
