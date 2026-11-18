// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { CausalPlayground } from '../index.ts'

afterEach(cleanup)

const level = (container: HTMLElement, id: string): string | null | undefined =>
  container.querySelector(`[data-node="${id}"] rect[data-level]`)?.getAttribute('data-level')

describe('CausalPlayground sliders and prior', () => {
  it('a slider under the graph recomputes the whole graph; 回到原本的機率 puts it back', () => {
    const { container, getByRole, getByLabelText } = render(<CausalPlayground caseId="smoking-lesion" sliders={['N_S1']} />)
    const slider = getByLabelText('有病灶時想吸菸的機率') as HTMLInputElement
    expect(slider.value).toBe('0.8')
    expect(level(container, 'S')).toBe('0.3800')
    fireEvent.change(slider, { target: { value: '0.2' } })
    expect(level(container, 'S')).toBe('0.2000')
    // Observe S, then go back: the observation and the slider both reset.
    fireEvent.click(container.querySelector('[data-node="S"]') as Element)
    fireEvent.click(getByRole('button', { name: '回到原本的機率' }))
    expect((getByLabelText('有病灶時想吸菸的機率') as HTMLInputElement).value).toBe('0.8')
    expect(level(container, 'S')).toBe('0.3800')
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
