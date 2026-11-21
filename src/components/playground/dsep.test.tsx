// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lessonModel } from '../../demo/lesson-models.ts'
import { CausalPlayground } from '../index.ts'
import { doNode, observeNode, textWithMath } from '../test-menu.ts'

afterEach(cleanup)

const line = (container: HTMLElement): string => textWithMath(container.querySelector('[data-dsep]'))
const edgePath = (container: HTMLElement, key: string): string | null => container.querySelector(`[data-edge="${key}"]`)?.getAttribute('data-path') ?? null

describe('playground dsep: the paths between a pair, lit when open, dashed when blocked', () => {
  it('lesson 04, admission: G–M blocked with nothing known, open once L is observed', () => {
    const { container } = render(<CausalPlayground doc={lessonModel('m04-admission')} dsep={['G', 'M']} />)
    expect(container.querySelector('[data-dsep]')?.getAttribute('data-dsep')).toBe('blocked')
    expect(line(container)).toContain('G 與 M')
    expect(container.querySelector('[data-dsep] .ca-pg-now-kicker [data-text="G"] .katex')).not.toBeNull()
    expect(line(container)).toContain('堵住')
    expect(line(container)).toContain('相依程度 0.000')
    expect(line(container)).toContain('G→A←M：對撞點 A 和它的後代都未知')
    expect(edgePath(container, 'G>A')).toBe('blocked')
    expect(edgePath(container, 'A>L')).toBeNull()

    observeNode(container, 'L', '1')
    expect(container.querySelector('[data-dsep]')?.getAttribute('data-dsep')).toBe('open')
    expect(line(container)).toContain('已知 {L}')
    expect(container.querySelector('[data-dsep] [data-text="{L}"]')?.getAttribute('data-tex')).toBe('\\{L\\}')
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
    observeNode(container, 'L', '1')
    doNode(container, 'A', '1')
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
    const button = within(sw).getByRole('button', { name: 'G 與 L' })
    expect(button.querySelector('.ca-tex')).toBeNull()
    fireEvent.click(button)
    expect(line(container)).toContain('G 與 L')
    expect(container.querySelector('[data-dsep]')?.getAttribute('data-dsep')).toBe('open')
  })

  it('needs a probability graph', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<CausalPlayground caseId="forest-fire-disjunctive" dsep={['L', 'MD']} />)).toThrow(/dsep/)
    spy.mockRestore()
  })
})
