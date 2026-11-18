// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FigureTabs } from './FigureTabs.tsx'

afterEach(cleanup)

const blocks = [
  { id: 'verdicts', label: 'Verdicts', children: <p data-testid="v">verdict text</p> },
  { id: 'equations', label: 'Equations', children: <p data-testid="e">equation text</p> },
]

const button = (c: HTMLElement, id: string): HTMLButtonElement => {
  const el = c.querySelector<HTMLButtonElement>(`button[data-tab="${id}"]`)
  if (el === null) throw new Error(`no tab ${id}`)
  return el
}
const panel = (c: HTMLElement, id: string): HTMLElement => {
  const el = c.querySelector<HTMLElement>(`[data-tab-panel="${id}"]`)
  if (el === null) throw new Error(`no panel ${id}`)
  return el
}

describe('FigureTabs', () => {
  it('opens the initial block and keeps the others closed', () => {
    const { container } = render(<FigureTabs blocks={blocks} initial="verdicts" />)
    expect(button(container, 'verdicts').getAttribute('aria-expanded')).toBe('true')
    expect(button(container, 'equations').getAttribute('aria-expanded')).toBe('false')
    expect(panel(container, 'verdicts').hidden).toBe(false)
    expect(panel(container, 'equations').hidden).toBe(true)
  })

  it('opens nothing without an initial block', () => {
    const { container } = render(<FigureTabs blocks={blocks} />)
    expect(container.querySelectorAll('[aria-expanded="true"]').length).toBe(0)
    expect(container.querySelectorAll('[data-tab-panel]:not([hidden])').length).toBe(0)
  })

  it('an initial block that is not offered counts as none', () => {
    const { container } = render(<FigureTabs blocks={blocks} initial="adjust" />)
    expect(container.querySelectorAll('[data-tab-panel]:not([hidden])').length).toBe(0)
  })

  it('opens one block at a time', () => {
    const { container } = render(<FigureTabs blocks={blocks} initial="verdicts" />)
    fireEvent.click(button(container, 'equations'))
    expect(button(container, 'equations').getAttribute('aria-expanded')).toBe('true')
    expect(button(container, 'verdicts').getAttribute('aria-expanded')).toBe('false')
    expect(panel(container, 'equations').hidden).toBe(false)
    expect(panel(container, 'verdicts').hidden).toBe(true)
  })

  it('a click on the open tab closes it', () => {
    const { container } = render(<FigureTabs blocks={blocks} initial="verdicts" />)
    fireEvent.click(button(container, 'verdicts'))
    expect(container.querySelectorAll('[aria-expanded="true"]').length).toBe(0)
    expect(panel(container, 'verdicts').hidden).toBe(true)
    fireEvent.click(button(container, 'verdicts'))
    expect(panel(container, 'verdicts').hidden).toBe(false)
  })

  it('keeps a closed block in the page', () => {
    const { container, getByTestId } = render(<FigureTabs blocks={blocks} initial="verdicts" />)
    expect(getByTestId('e').textContent).toBe('equation text')
    expect(panel(container, 'equations').contains(getByTestId('e'))).toBe(true)
    fireEvent.click(button(container, 'verdicts'))
    expect(getByTestId('v').textContent).toBe('verdict text')
  })

  it('each button names the panel it controls, and the panel is labelled by its button', () => {
    const { container } = render(<FigureTabs blocks={blocks} />)
    for (const b of blocks) {
      const btn = button(container, b.id)
      const target = panel(container, b.id)
      expect(btn.getAttribute('aria-controls')).toBe(target.id)
      expect(target.getAttribute('aria-labelledby')).toBe(btn.id)
      expect(target.getAttribute('role')).toBe('region')
    }
  })

  it('the tabs are real buttons, so Enter and Space work and Tab reaches them', () => {
    const { container } = render(<FigureTabs blocks={blocks} />)
    for (const b of blocks) {
      const btn = button(container, b.id)
      expect(btn.tagName).toBe('BUTTON')
      expect(btn.getAttribute('type')).toBe('button')
      expect(btn.tabIndex).toBe(0)
    }
  })

  it('draws nothing without blocks', () => {
    const { container } = render(<FigureTabs blocks={[]} />)
    expect(container.innerHTML).toBe('')
  })
})
