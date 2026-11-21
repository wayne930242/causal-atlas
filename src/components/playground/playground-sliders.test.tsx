// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { CausalPlayground } from '../index.ts'
import { lessonModel } from '../../demo/lesson-models.ts'
import { closeMenu, observeNode, openMenu } from '../test-menu.ts'

afterEach(cleanup)

const level = (container: HTMLElement, id: string): string | null | undefined =>
  container.querySelector(`[data-node="${id}"] rect[data-level]`)?.getAttribute('data-level')

describe('CausalPlayground sliders and prior', () => {
  it('a slider in the 機率 tab recomputes the whole graph; 回到原本的機率 puts it back', () => {
    const { container, getByRole, getByLabelText } = render(<CausalPlayground caseId="smoking-lesion" sliders={['N_S1']} />)
    const slider = getByLabelText('有病灶時想吸菸的機率') as HTMLInputElement
    expect(slider.value).toBe('0.8')
    expect(level(container, 'S')).toBe('0.3800')
    fireEvent.change(slider, { target: { value: '0.2' } })
    expect(level(container, 'S')).toBe('0.2000')
    // Observe S, then go back: the observation and the slider both reset.
    observeNode(container, 'S', '1')
    closeMenu(container)
    fireEvent.click(getByRole('button', { name: '回到原本的機率' }))
    expect((getByLabelText('有病灶時想吸菸的機率') as HTMLInputElement).value).toBe('0.8')
    expect(level(container, 'S')).toBe('0.3800')
  })

  it("a node's menu holds its own sliders, kept in step with the list in the 機率 tab", () => {
    const { container } = render(<CausalPlayground doc={lessonModel('m04-sprinkler-cpt')} sliders={['U_C', 'N_S1', 'N_S0', 'N_R1', 'N_R0']} />)
    // The list sits under one heading per node: S's two entries under S.
    const groups = [...container.querySelectorAll('[data-slider-group]')].map((g) => [g.getAttribute('data-slider-group'), [...g.querySelectorAll('[data-slider]')].map((r) => r.getAttribute('data-slider'))])
    expect(groups).toEqual([
      ['C', ['U_C']],
      ['S', ['N_S1', 'N_S0']],
      ['R', ['N_R1', 'N_R0']],
    ])
    const menu = openMenu(container, 'S')
    expect([...menu.querySelectorAll('[data-slider]')].map((r) => r.getAttribute('data-slider'))).toEqual(['N_S1', 'N_S0'])
    fireEvent.change(menu.querySelector('[data-slider="N_S1"] input') as Element, { target: { value: '0.9' } })
    const listed = container.querySelector('[data-tab-panel="probabilities"] [data-slider="N_S1"] input') as HTMLInputElement
    expect(listed.value).toBe('0.9')
    // C has no CPT slider of its own beyond U_C; F none at all here.
    closeMenu(container)
    expect(openMenu(container, 'W').querySelector('.ca-node-menu-probs')).toBeNull()
  })

  it('a hovered node lights its slider rows; a hovered row lights the node it moves', () => {
    const { container } = render(<CausalPlayground doc={lessonModel('m04-sprinkler-cpt')} sliders={['U_C', 'N_S1', 'N_S0', 'N_R1', 'N_R0']} />)
    const lit = (): string[] => [...container.querySelectorAll('[data-tab-panel="probabilities"] [data-slider][data-lit]')].map((r) => r.getAttribute('data-slider') ?? '')
    fireEvent.pointerEnter(container.querySelector('[data-node="R"]') as Element, { pointerType: 'mouse' })
    expect(lit()).toEqual(['N_R1', 'N_R0'])
    fireEvent.pointerLeave(container.querySelector('[data-node="R"]') as Element, { pointerType: 'mouse' })
    expect(lit()).toEqual([])
    fireEvent.pointerEnter(container.querySelector('[data-slider="N_S0"]') as Element, { pointerType: 'mouse' })
    expect([...container.querySelectorAll('[data-lit]')].filter((e) => e.tagName === 'circle').map((e) => e.getAttribute('data-lit'))).toEqual(['S'])
    // A touch does not hover: a tap is a click.
    fireEvent.pointerLeave(container.querySelector('[data-slider="N_S0"]') as Element, { pointerType: 'mouse' })
    fireEvent.pointerEnter(container.querySelector('[data-node="R"]') as Element, { pointerType: 'touch' })
    expect(lit()).toEqual([])
  })

  it('the 機率 tab is closed at first, holds every slider and its own reset', () => {
    const { container } = render(<CausalPlayground doc={lessonModel('m04-sprinkler-cpt')} sliders={['U_C', 'N_S1', 'N_S0', 'N_R1', 'N_R0']} />)
    const tab = container.querySelector('[data-tab="probabilities"]') as HTMLButtonElement
    const panel = container.querySelector('[data-tab-panel="probabilities"]') as HTMLElement
    expect(tab.textContent).toBe('機率')
    expect(tab.getAttribute('aria-expanded')).toBe('false')
    expect(panel.hidden).toBe(true)
    expect(container.querySelector('.ca-playground-foot .ca-slider-list')).toBeNull()
    fireEvent.click(tab)
    expect(panel.hidden).toBe(false)
    expect(panel.querySelectorAll('[data-slider]')).toHaveLength(5)
    const reset = panel.querySelector('.ca-slider-reset') as HTMLButtonElement
    expect(reset.textContent).toBe('回到原本的機率')
    expect(reset.disabled).toBe(true)
    const input = (id: string): HTMLInputElement => panel.querySelector(`[data-slider="${id}"] input`) as HTMLInputElement
    const [s1, r1] = [input('N_S1').value, input('N_R1').value]
    fireEvent.change(input('N_S1'), { target: { value: '0.9' } })
    fireEvent.change(input('N_R1'), { target: { value: '0.1' } })
    expect(reset.disabled).toBe(false)
    // The header's reset shows too once a slider moved, with nothing set on the graph.
    expect([...container.querySelectorAll('.ca-box-actions button')].some((b) => b.textContent === '回到原本的機率')).toBe(true)
    fireEvent.click(reset)
    expect([input('N_S1').value, input('N_R1').value]).toEqual([s1, r1])
    expect(reset.disabled).toBe(true)
    expect([...container.querySelectorAll('.ca-box-actions button')].some((b) => b.textContent === '回到原本的機率')).toBe(false)
  })

  it("a node's menu resets only its own sliders, offered once one moved", () => {
    const { container } = render(<CausalPlayground doc={lessonModel('m04-sprinkler-cpt')} sliders={['U_C', 'N_S1', 'N_S0', 'N_R1', 'N_R0']} />)
    const input = (id: string): HTMLInputElement => container.querySelector(`[data-tab-panel="probabilities"] [data-slider="${id}"] input`) as HTMLInputElement
    const startS = input('N_S1').value
    const startR = input('N_R1').value
    fireEvent.change(input('N_R1'), { target: { value: '0.1' } })
    let menu = openMenu(container, 'S')
    expect(menu.querySelector('[data-node-reset]')).toBeNull()
    fireEvent.change(menu.querySelector('[data-slider="N_S1"] input') as Element, { target: { value: '0.95' } })
    const reset = menu.querySelector('[data-node-reset="S"]') as HTMLButtonElement
    expect(reset.textContent).toBe('這個節點回到原本的機率')
    fireEvent.click(reset)
    expect(input('N_S1').value).toBe(startS)
    expect(input('N_R1').value).toBe('0.1')
    menu = container.querySelector('[data-menu="S"]') as HTMLElement
    expect(menu.querySelector('[data-node-reset]')).toBeNull()
    expect(startR).not.toBe('0.1')
  })

  it("Newcomb's disposition D, drawn as its own node, has its slider in its menu", () => {
    const { container } = render(<CausalPlayground caseId="newcomb" sliders={['D']} prior={{ D: 0.1, E: 0.1 }} />)
    expect(container.querySelector('[data-node="D"]')).not.toBeNull()
    const menu = openMenu(container, 'D')
    expect([...menu.querySelectorAll('[data-slider]')].map((r) => r.getAttribute('data-slider'))).toEqual(['D'])
  })

  it('prior sets the start values: Newcomb with error 0.1 and disposition 0.1 gives M 0.18', () => {
    const { container } = render(<CausalPlayground caseId="newcomb" sliders={['D']} prior={{ D: 0.1, E: 0.1 }} />)
    expect(level(container, 'M')).toBe('0.1800')
  })

  it('fails fast on what a slider cannot set', () => {
    expect(() => renderToString(<CausalPlayground caseId="smoking-lesion" sliders={['S']} />)).toThrow(/slider/)
    expect(() => renderToString(<CausalPlayground caseId="rock-throwing" sliders={['ST_U']} />)).toThrow(/probability graph/)
    expect(() => renderToString(<CausalPlayground caseId="smoking-lesion" prior={{ L: 2 }} />)).toThrow(/prior/)
  })
})
