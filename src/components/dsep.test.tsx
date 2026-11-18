// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lessonModel } from '../demo/lesson-models.ts'
import { CausalPlayground } from './index.ts'

afterEach(cleanup)

const node = (container: HTMLElement, id: string): Element => {
  const el = container.querySelector(`[data-node="${id}"]`)
  if (el === null) throw new Error(`no node ${id}`)
  return el
}
const line = (container: HTMLElement): string => {
  const el = container.querySelector('[data-dsep]')
  if (el === null) return ''
  // Typeset formulas read by their plain text.
  const copy = el.cloneNode(true) as Element
  for (const tex of copy.querySelectorAll('.ca-tex')) tex.replaceWith(tex.getAttribute('data-text') ?? '')
  return copy.textContent ?? ''
}
const edgePath = (container: HTMLElement, key: string): string | null => container.querySelector(`[data-edge="${key}"]`)?.getAttribute('data-path') ?? null

describe('playground dsep: the paths between a pair, lit when open, dashed when blocked', () => {
  it('lesson 04, admission: G–M blocked with nothing known, open once L is observed', () => {
    const { container } = render(<CausalPlayground doc={lessonModel('m04-admission')} dsep={['G', 'M']} />)
    expect(container.querySelector('[data-dsep]')?.getAttribute('data-dsep')).toBe('blocked')
    expect(line(container)).toContain('G 與 M')
    expect(line(container)).toContain('堵住')
    expect(line(container)).toContain('相依程度 0.000')
    expect(line(container)).toContain('G→A←M：對撞點 A 和它的後代都未知')
    expect(edgePath(container, 'G>A')).toBe('blocked')
    expect(edgePath(container, 'A>L')).toBeNull()

    fireEvent.click(node(container, 'L'))
    expect(container.querySelector('[data-dsep]')?.getAttribute('data-dsep')).toBe('open')
    expect(line(container)).toContain('已知 {L}')
    expect(line(container)).toContain('相依程度 0.1736')
    expect(line(container)).toContain('G→A←M：對撞點 A 的後代 L 已知')
    expect(edgePath(container, 'G>A')).toBe('open')
    expect(edgePath(container, 'M>A')).toBe('open')
    expect(container.querySelectorAll('[data-dsep-end]').length).toBe(2)
  })

  it('lesson 04, the tuned parameters: open, yet dependence 0.000', () => {
    const { container } = render(<CausalPlayground doc={lessonModel('m04-tuned')} dsep={['X', 'Y']} />)
    expect(container.querySelector('[data-dsep]')?.getAttribute('data-dsep')).toBe('open')
    expect(line(container)).toContain('相依程度 0.000')
  })

  it('with do(), the graph after the cut: no path is left between G and M', () => {
    const { container } = render(<CausalPlayground doc={lessonModel('m04-admission')} dsep={['G', 'M']} />)
    fireEvent.click(node(container, 'L'))
    fireEvent.click(node(container, 'A'), { shiftKey: true })
    expect(container.querySelector('[data-dsep]')?.getAttribute('data-dsep')).toBe('blocked')
    expect(line(container)).toContain('沒有路徑')
  })

  it('several pairs get a switch', () => {
    const { container } = render(
      <CausalPlayground
        doc={lessonModel('m04-admission')}
        dsep={[
          ['G', 'M'],
          ['G', 'L'],
        ]}
      />,
    )
    const sw = within(container).getByRole('group', { name: '路徑的兩端' })
    fireEvent.click(within(sw).getByRole('button', { name: 'G 與 L' }))
    expect(line(container)).toContain('G 與 L')
    expect(container.querySelector('[data-dsep]')?.getAttribute('data-dsep')).toBe('open')
  })

  it('needs a probability graph', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<CausalPlayground caseId="forest-fire-disjunctive" dsep={['L', 'MD']} />)).toThrow(/dsep/)
    spy.mockRestore()
  })
})
