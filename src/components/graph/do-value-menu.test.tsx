// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ModelDoc } from '../../data/schema.ts'
import { modelDocSchema } from '../../data/schema.ts'
import { CausalPlayground } from '../index.ts'
import { doNode, openMenu } from '../test-menu.ts'

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

describe('do() on a multi-valued node, in its menu', () => {
  it('offers one do() per value, sets it, and releases it', () => {
    const { container } = render(<CausalPlayground doc={dice} />)
    expect(node(container, 'D1').getAttribute('data-value')).toBe('1')
    expect(node(container, 'Three').getAttribute('data-value')).toBe('0')
    const menu = openMenu(container, 'D1')
    expect(menu.querySelector('[data-do] .katex')).toBeNull()
    expect(menu.querySelector('.ca-node-menu-notes [data-text="D1=1"]')?.getAttribute('data-tex')).toBe('D_1=1')
    expect([...menu.querySelectorAll('[data-do]')].map((b) => b.textContent)).toEqual(['do(D1=1)', 'do(D1=2)', 'do(D1=3)', 'do(D1=4)', 'do(D1=5)', 'do(D1=6)', '放開'])
    // Opening sets nothing.
    expect(node(container, 'D1').getAttribute('data-intervened')).toBe('false')

    doNode(container, 'D1', '3')
    expect(node(container, 'D1').getAttribute('data-value')).toBe('3')
    expect(node(container, 'Three').getAttribute('data-value')).toBe('1')
    expect(chip(container)).toBe('do(D1=3)')
    expect(container.querySelector('.ca-do-chip [data-tex]')?.getAttribute('data-tex')).toBe('\\operatorname{do}(D_1=3)')
    expect(openMenu(container, 'D1').querySelector('[aria-pressed="true"]')?.textContent).toBe('do(D1=3)')

    doNode(container, 'D1')
    expect(node(container, 'D1').getAttribute('data-intervened')).toBe('false')
    expect(node(container, 'Three').getAttribute('data-value')).toBe('0')
    expect(chip(container)).toBeNull()
  })

  it('closes on Escape or an outside press and keeps the value', () => {
    const { container } = render(<CausalPlayground doc={dice} initialInterventions={{ D1: 4 }} />)
    openMenu(container, 'D1')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(container.querySelector('[data-menu]')).toBeNull()
    expect(chip(container)).toBe('do(D1=4)')
    openMenu(container, 'D1')
    fireEvent.pointerDown(document.body)
    expect(container.querySelector('[data-menu]')).toBeNull()
    expect(chip(container)).toBe('do(D1=4)')
  })

  it('words the same hint for a boolean and a multi-valued node: a menu to intervene', () => {
    render(<CausalPlayground doc={dice} />)
    for (const name of [/^Lamp 燈/, /^D1 骰子/]) {
      const el = screen.getByRole('button', { name })
      expect(el.getAttribute('aria-label')).toContain('按一下打開選單，可以干預')
      expect(el.getAttribute('aria-haspopup')).toBe('dialog')
    }
  })
})
