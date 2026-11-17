// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ModelDoc } from '../data/schema.ts'
import { modelDocSchema } from '../data/schema.ts'
import { CausalPlayground } from './index.ts'

afterEach(cleanup)

/** A die D1 (1–6, rolled from U_D) and a lamp switch Lamp; Three says the die shows 3, On follows the lamp. */
const dice: ModelDoc = modelDocSchema.parse({
  format: 'causal-atlas/model',
  version: 1,
  title: 'Dice',
  model: {
    variables: [
      { id: 'U_D', label: { 'zh-TW': '擲出', en: 'Roll' }, kind: 'exogenous', domain: [1, 2, 3, 4, 5, 6] },
      { id: 'U_L', label: { 'zh-TW': '開關', en: 'Switch' }, kind: 'exogenous', domain: 'boolean' },
      { id: 'D1', label: { 'zh-TW': '骰子', en: 'Die' }, kind: 'endogenous', domain: [1, 2, 3, 4, 5, 6] },
      { id: 'Lamp', label: { 'zh-TW': '燈', en: 'Lamp' }, kind: 'endogenous', domain: 'boolean' },
      { id: 'Three', label: { 'zh-TW': '是三', en: 'Three' }, kind: 'endogenous', domain: 'boolean' },
      { id: 'On', label: { 'zh-TW': '亮', en: 'On' }, kind: 'endogenous', domain: 'boolean' },
    ],
    equations: { D1: 'U_D', Lamp: 'U_L', Three: 'D1 = 3', On: 'Lamp' },
  },
  context: { U_D: 1, U_L: 1 },
})

const node = (container: HTMLElement, id: string): Element => {
  const el = container.querySelector(`[data-node="${id}"]`)
  if (el === null) throw new Error(`no node ${id}`)
  return el
}

const chip = (container: HTMLElement): string | null =>
  container.querySelector('.ca-do-chip .ca-tex')?.getAttribute('data-text') ?? null

describe('do() on a multi-valued node', () => {
  it('opens a slider over the domain, sets the picked value live, and releases it', () => {
    const { container } = render(<CausalPlayground doc={dice} />)
    expect(node(container, 'D1').getAttribute('data-value')).toBe('1')
    expect(node(container, 'Three').getAttribute('data-value')).toBe('0')
    expect(container.querySelector('.ca-do-pop')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^D1 骰子/ }))
    const dialog = container.querySelector('.ca-do-pop')
    expect(dialog).not.toBeNull()
    // Opening alone intervenes on nothing.
    expect(node(container, 'D1').getAttribute('data-intervened')).toBe('false')
    const slider = screen.getByRole('slider', { name: /D1 骰子/ }) as HTMLInputElement
    expect(slider.min).toBe('0')
    expect(slider.max).toBe('5')

    fireEvent.change(slider, { target: { value: '2' } })
    expect(node(container, 'D1').getAttribute('data-intervened')).toBe('true')
    expect(node(container, 'D1').getAttribute('data-value')).toBe('3')
    expect(node(container, 'Three').getAttribute('data-value')).toBe('1')
    expect(chip(container)).toBe('do(D1=3)')
    expect(container.querySelector('.ca-do-pop-value')?.textContent).toBe('D1=3')
    expect(slider.getAttribute('aria-valuetext')).toBe('D1=3')

    fireEvent.click(screen.getByRole('button', { name: '放開' }))
    expect(container.querySelector('.ca-do-pop')).toBeNull()
    expect(node(container, 'D1').getAttribute('data-intervened')).toBe('false')
    expect(node(container, 'D1').getAttribute('data-value')).toBe('1')
    expect(node(container, 'Three').getAttribute('data-value')).toBe('0')
    expect(chip(container)).toBeNull()
  })

  it('closes on Escape or an outside press and keeps the value', () => {
    const { container } = render(<CausalPlayground doc={dice} initialInterventions={{ D1: 4 }} />)
    fireEvent.click(screen.getByRole('button', { name: /^D1 骰子/ }))
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('3')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(container.querySelector('.ca-do-pop')).toBeNull()
    expect(chip(container)).toBe('do(D1=4)')

    fireEvent.keyDown(screen.getByRole('button', { name: /^D1 骰子/ }), { key: 'Enter' })
    expect(container.querySelector('.ca-do-pop')).not.toBeNull()
    fireEvent.pointerDown(document.body)
    expect(container.querySelector('.ca-do-pop')).toBeNull()
    expect(chip(container)).toBe('do(D1=4)')

    // A second click on the node closes it again.
    fireEvent.click(screen.getByRole('button', { name: /^D1 骰子/ }))
    fireEvent.click(screen.getByRole('button', { name: /^D1 骰子/ }))
    expect(container.querySelector('.ca-do-pop')).toBeNull()
  })

  it('leaves a boolean node as a plain toggle, and words the hint for each kind', () => {
    const { container } = render(<CausalPlayground doc={dice} />)
    const lamp = screen.getByRole('button', { name: /^Lamp 燈/ })
    expect(lamp.getAttribute('aria-label')).toContain('按一下套上干預')
    fireEvent.click(lamp)
    expect(container.querySelector('.ca-do-pop')).toBeNull()
    expect(node(container, 'Lamp').getAttribute('data-intervened')).toBe('true')
    expect(node(container, 'Lamp').getAttribute('data-value')).toBe('0')
    expect(node(container, 'On').getAttribute('data-value')).toBe('0')
    fireEvent.click(lamp)
    expect(node(container, 'Lamp').getAttribute('data-intervened')).toBe('false')

    const die = screen.getByRole('button', { name: /^D1 骰子/ })
    expect(die.getAttribute('aria-label')).toContain('按一下選擇要設成的值')
    expect(die.getAttribute('aria-haspopup')).toBe('dialog')
    fireEvent.click(die)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '4' } })
    expect(screen.getByRole('button', { name: /^D1 骰子/ }).getAttribute('aria-label')).toContain('按一下改選干預的值或放開')
  })
})
