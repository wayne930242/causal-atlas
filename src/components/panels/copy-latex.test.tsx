// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCase } from '../../data/index.ts'
import { CausalPlayground, LocaleProvider } from '../index.ts'
import { CopyLatex } from './Equations.tsx'
import { equationsLatex } from './equations-latex.ts'

afterEach(cleanup)

const props = {
  c: getCase('firing-squad'),
  shown: ['U', 'C', 'A', 'B', 'D'],
  notation: 'arithmetic' as const,
  values: { U: 1, C: 1, A: 1, B: 1, D: 1 },
  interventions: { C: 0 },
}

describe('copy LaTeX', () => {
  it('builds an aligned block, omitting struck originals', () => {
    const tex = equationsLatex(props)
    expect(tex.startsWith('\\begin{aligned}\nC & = 0 \\\\\n')).toBe(true)
    expect(tex.endsWith('\n\\end{aligned}')).toBe(true)
    expect(tex).toContain('D & = \\max(A, B)')
    expect(tex).not.toContain('= U')
  })

  it('labels the button in both locales', () => {
    expect(renderToString(<CopyLatex {...props} />)).toContain('複製 LaTeX')
    expect(renderToString(<LocaleProvider locale="en"><CopyLatex {...props} /></LocaleProvider>)).toContain('Copy LaTeX')
  })

  it('writes the block to the clipboard and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<CopyLatex {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '複製 LaTeX' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('已複製'))
    expect(writeText).toHaveBeenCalledWith(equationsLatex(props))
  })

  it('copying a selection of formulas yields their LaTeX source', () => {
    const { container } = render(<CausalPlayground caseId="firing-squad" />)
    const eqs = container.querySelector('.ca-eqs') as HTMLElement
    const range = document.createRange()
    range.selectNodeContents(eqs.querySelector('.ca-eq-text') as HTMLElement)
    const sel = window.getSelection() as Selection
    sel.removeAllRanges()
    sel.addRange(range)
    const setData = vi.fn()
    fireEvent.copy(eqs, { clipboardData: { setData } })
    expect(setData).toHaveBeenCalledTimes(1)
    const [type, text] = setData.mock.calls[0] as [string, string]
    expect(type).toBe('text/plain')
    expect(text).toMatch(/\\|=|\\land|\\lor/)
    expect(text).not.toContain('katex')
  })

  it('aligns export wrappers and spaces the header', () => {
    const css = readFileSync('src/components/styles.css', 'utf8')
    expect(css).toMatch(/\.ca-export \{[^}]*display: inline-flex/)
    expect(css).toMatch(/\.ca-eq-head \{[^}]*margin-bottom: 0\.75rem/)
  })
})
