// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lessonModel } from '../../demo/lesson-models.ts'
import { CausalPlayground } from '../index.ts'
import { doNode, observeNode, openMenu } from '../test-menu.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const node = (container: HTMLElement, id: string): Element => {
  const el = container.querySelector(`[data-node="${id}"]`)
  if (el === null) throw new Error(`no node ${id}`)
  return el
}
const readout = (container: HTMLElement, id: string): string => node(container, id).querySelector(`[data-readout="${id}"]`)?.textContent ?? ''
const chip = (container: HTMLElement): string | null => container.querySelector('.ca-do-chip .ca-tex')?.getAttribute('data-text') ?? null
const button = (container: HTMLElement, name: string): HTMLButtonElement => within(container).getByRole('button', { name }) as HTMLButtonElement

const nervous = lessonModel('m00-firing-squad-nervous')
const steps = [
  { label: '第 1 步：看到 A 沒開槍', observed: { A: 0 } },
  { label: '第 2 步：攔住 A', interventions: { A: 0 } },
]

describe('step buttons (presets with observed and hold)', () => {
  it('an observed preset observes on a probability graph and shows as pressed', () => {
    const { container } = render(<CausalPlayground doc={nervous} presets={steps} />)
    const first = button(container, '第 1 步：看到 A 沒開槍')
    expect(first.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(first)
    expect(node(container, 'A').getAttribute('data-observed')).toBe('0')
    expect(node(container, 'A').getAttribute('data-intervened')).toBe('false')
    expect(chip(container)).toBe('A=0')
    // P(D=1 | A=0) = 0: A=0 means no order, so B did not shoot either.
    expect(readout(container, 'D')).toBe('0.00')
    expect(first.getAttribute('aria-pressed')).toBe('true')

    const second = button(container, '第 2 步：攔住 A')
    fireEvent.click(second)
    expect(node(container, 'A').getAttribute('data-intervened')).toBe('true')
    expect(node(container, 'A').getAttribute('data-observed')).toBeNull()
    expect(chip(container)).toBe('do(A=0)')
    expect(readout(container, 'D')).toBe('0.70')
    expect(second.getAttribute('aria-pressed')).toBe('true')
    expect(first.getAttribute('aria-pressed')).toBe('false')

    // The reader's own click after a step adds to it: the step still holds, so it stays pressed.
    observeNode(container, 'C', '1')
    expect(second.getAttribute('aria-pressed')).toBe('true')
  })

  it('UATSB-F018: the step row sits inside the figure frame, under the graph', () => {
    const { container } = render(<CausalPlayground doc={nervous} presets={steps} />)
    const row = container.querySelector('.ca-presets')
    expect(row?.closest('.ca-panel')).not.toBeNull()
    expect(row?.closest('.ca-graph-box')).not.toBeNull()
  })

  it('a hold preset draws the held variables in the amber hull, set at their values', () => {
    const { container } = render(
      <CausalPlayground caseId="forest-fire-disjunctive" presets={[{ label: 'witness', interventions: { L: 0 }, hold: { MD: 0 } }]} />,
    )
    fireEvent.click(button(container, 'witness'))
    expect(container.querySelector('.ca-witness')?.getAttribute('data-witness')).toBe('MD')
    expect(node(container, 'MD').getAttribute('data-value')).toBe('0')
    expect(node(container, 'L').getAttribute('data-value')).toBe('0')
    expect(node(container, 'FF').getAttribute('data-value')).toBe('0')
    expect(button(container, 'witness').getAttribute('aria-pressed')).toBe('true')
    // Releasing the held variable drops it from the hull.
    doNode(container, 'MD')
    expect(container.querySelector('.ca-witness')).toBeNull()
  })

  it('an observed preset on a graph with values fails fast', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<CausalPlayground caseId="forest-fire-disjunctive" presets={[{ label: 'x', observed: { L: 1 } }]} />)).toThrow(/observed/)
    spy.mockRestore()
  })
})

describe('node menu help', () => {
  it('removes both under-graph hints and puts the details in a focusable menu tooltip', () => {
    const { container } = render(<CausalPlayground doc={nervous} />)
    expect(container.querySelector('.ca-hint, .ca-legend')).toBeNull()
    expect(container.querySelector('.ca-node-menu-help')).toBeNull()
    const menu = openMenu(container, 'A')
    const trigger = menu.querySelector('.ca-node-menu-help [aria-describedby]')
    if (!(trigger instanceof HTMLElement)) throw new Error('no tooltip trigger')
    const tip = container.querySelector(`#${CSS.escape(trigger.getAttribute('aria-describedby') ?? '')}`)
    expect(tip?.getAttribute('role')).toBe('tooltip')
    expect(tip?.textContent).toMatch(/滑桿/)
    expect(tip?.hasAttribute('hidden')).toBe(true)
    fireEvent.focus(trigger)
    expect(tip?.hasAttribute('hidden')).toBe(false)
    fireEvent.blur(trigger)
    expect(tip?.hasAttribute('hidden')).toBe(true)
    fireEvent.click(trigger)
    expect(tip?.hasAttribute('hidden')).toBe(false)
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(tip?.hasAttribute('hidden')).toBe(true)
    expect(container.querySelector('[data-menu]')).not.toBeNull()
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(container.querySelector('[data-menu]')).toBeNull()
  })

  it('explains intervention rather than conditioning for a graph with values', () => {
    const { container } = render(<CausalPlayground caseId="forest-fire-disjunctive" />)
    expect(openMenu(container, 'L').querySelector('.ca-node-menu-help [role="tooltip"]')?.textContent).toMatch(/干預.*下游跟著重算/)
  })

  it('a step stays pressed when the reader sets more on top of it', () => {
    const chain = lessonModel('m02-chain')
    const known = [
      { label: '第 1 步：不知道 Z' },
      { label: '第 2 步：已知 Z', observed: { Z: 1 } },
    ]
    const { container } = render(<CausalPlayground doc={chain} presets={known} />)
    const first = button(container, '第 1 步：不知道 Z')
    const second = button(container, '第 2 步：已知 Z')
    expect(first.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(second)
    expect(second.getAttribute('aria-pressed')).toBe('true')
    expect(first.getAttribute('aria-pressed')).toBe('false')
    observeNode(container, 'X', '1')
    expect(chip(container)).toContain('Z=1')
    expect(second.getAttribute('aria-pressed')).toBe('true')
    expect(first.getAttribute('aria-pressed')).toBe('false')
    observeNode(container, 'Z', '0')
    expect(second.getAttribute('aria-pressed')).toBe('false')
  })
})
