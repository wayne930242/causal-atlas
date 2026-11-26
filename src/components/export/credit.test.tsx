// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCase } from '../../data/index.ts'
import type { LoadedCase } from '../../data/load.ts'
import { caseToDoc } from '../../data/model-doc.ts'
import { messagesFor } from '../i18n/messages.ts'
import { originCitations, originSources } from '../model/verdict-rows.ts'
import { authorYear, authorYearEn } from './cite.ts'
import { saveFile } from './download.ts'
import { loadExportImage } from './export-loader.ts'
import { CasePage, CausalPlayground, ProbabilityPanel, WorldLanes } from '../index.ts'

/**
 * Every place the package hands out a figure or a credit names the case's original sources
 * (LICENSE-DATA: reuse credits this dataset and the originals its `sources` lists).
 */

vi.mock('./download.ts', () => ({ saveFile: vi.fn() }))
const saved = vi.mocked(saveFile)

let copied: string[] = []
beforeAll(() => loadExportImage())
beforeEach(() => {
  saved.mockReset()
  copied = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text: string) => (copied.push(text), Promise.resolve()) },
  })
})
afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

function openMenu(scope: HTMLElement): HTMLElement {
  if (within(scope).queryByRole('group', { name: '圖片設定' }) === null) {
    fireEvent.click(within(scope).getAllByRole('button', { name: '下載圖片' })[0])
  }
  return within(scope).getByRole('group', { name: '圖片設定' })
}

/** The colour SVG the menu in `scope` saves, in `language` (the menu's label for it). */
function colourSvg(scope: HTMLElement, language?: 'English' | '中文'): string {
  const menu = openMenu(scope)
  fireEvent.click(within(menu).getByRole('button', { name: 'SVG' }))
  if (language !== undefined) fireEvent.click(within(menu).getByRole('button', { name: language }))
  fireEvent.click(within(menu).getByRole('button', { name: '下載' }))
  const data = saved.mock.calls.at(-1)?.[1]
  if (typeof data !== 'string') throw new Error('nothing saved')
  return data
}

/** The drawn text lines of a saved SVG (what a reader of the PNG sees). */
function drawnText(svg: string): string[] {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  return [...doc.querySelectorAll('svg > text')].map((t) => t.textContent ?? '')
}

function withOrigins(c: LoadedCase, citations: readonly string[]): LoadedCase {
  return { ...c, data: { ...c.data, sources: citations.map((citation) => ({ citation, role: 'origin' as const, verified: true })) } }
}

describe('short case sources on images', () => {
  it('shortens a court decision to its name and year', () => {
    expect(originSources(messagesFor('en'), getCase('palsgraf'))).toBe('Palsgraf v. Long Island Railroad Co. 1928')
    expect(originSources(messagesFor('zh-TW'), getCase('summers-v-tice'))).toBe('Summers v. Tice 1948')
  })

  it('keeps up to three sources and cuts more to two with et al.', () => {
    const c = getCase('rock-throwing')
    const three = withOrigins(c, ['Hall, N. (2004). A.', 'Lewis, D. (1973). B.', 'Paul, L. A. (1998). C.'])
    expect(originSources(messagesFor('en'), three)).toBe('Hall 2004; Lewis 1973; Paul 1998')
    const four = withOrigins(c, [...three.data.sources.map((s) => s.citation), 'Wang, P.-H., & Wang, L. (2026). D.'])
    expect(originSources(messagesFor('en'), four)).toBe('Hall 2004; Lewis 1973 et al.')
    expect(originSources(messagesFor('zh-TW'), four)).toBe('Hall 2004；Lewis 1973 等')
    // The full citations are never cut.
    expect(originCitations(four)).toHaveLength(4)
  })
})

describe('colour image credit', () => {
  it('names the case source under the watermark in every component, in either language', () => {
    const figures = [
      { id: 'taroko-derailment-2021', short: 'Wang & Wang 2026', ui: () => <CasePage caseId="taroko-derailment-2021" initialStep={3} /> },
      { id: 'rock-throwing', short: 'Hall 2004', ui: () => <CausalPlayground caseId="rock-throwing" /> },
      { id: 'rock-throwing lanes', short: 'Hall 2004', ui: () => <WorldLanes caseId="rock-throwing" initialStep={2} /> },
      { id: 'smoking-lesion', short: 'Eells 1982；Skyrms 1980', ui: () => <ProbabilityPanel caseId="smoking-lesion" /> },
      { id: 'palsgraf', short: 'Palsgraf v. Long Island Railroad Co. 1928', ui: () => <CausalPlayground caseId="palsgraf" /> },
    ]
    for (const { id, short, ui } of figures) {
      const { container, unmount } = render(ui())
      expect(drawnText(colourSvg(container)), id).toContain(`案例出處：${short}`)
      expect(drawnText(colourSvg(container, 'English')), id).toContain(`Case source: ${short.replace('；', '; ')}`)
      unmount()
    }
  })

  it('credits a document only when it is a bundled case', () => {
    const doc = caseToDoc(getCase('smoking-lesion'))
    const { container, unmount } = render(<ProbabilityPanel doc={doc} />)
    expect(drawnText(colourSvg(container))).toContain('案例出處：Eells 1982；Skyrms 1980')
    unmount()
    const own = render(<ProbabilityPanel doc={{ ...doc, from: undefined }} />)
    expect(drawnText(colourSvg(own.container)).join('\n')).not.toContain('案例出處')
  })
})

describe('copied credit text', () => {
  it('the academic reminder copies the project and the full case sources together', () => {
    const hall = getCase('rock-throwing').data.sources.find((s) => s.role === 'origin')?.citation ?? ''
    const { container } = render(<CasePage caseId="rock-throwing" initialStep={3} />)
    const menu = openMenu(container)
    fireEvent.click(within(menu).getByRole('button', { name: '學術版（黑白線條）' }))
    const note = within(menu).getByRole('note')
    fireEvent.click(within(note).getByRole('button', { name: '複製引用文字' }))
    expect(copied.at(-1)).toBe(`${authorYear()}\n${hall}`)
    fireEvent.click(within(menu).getByRole('button', { name: 'English' }))
    fireEvent.click(within(within(menu).getByRole('note')).getByRole('button', { name: 'Copy citations' }))
    expect(copied.at(-1)).toBe(`${authorYearEn()}\n${hall}`)
  })

  it('the reminder of a model of ones own copies the project alone', () => {
    const doc = { ...caseToDoc(getCase('smoking-lesion')), from: undefined }
    const { container } = render(<ProbabilityPanel doc={doc} />)
    const menu = openMenu(container)
    fireEvent.click(within(menu).getByRole('button', { name: '學術版（黑白線條）' }))
    const note = within(menu).getByRole('note')
    expect(note.textContent).not.toContain('原始出處')
    fireEvent.click(within(note).getByRole('button', { name: '複製引用文字' }))
    expect(copied.at(-1)).toBe(authorYear())
  })

  it('the embed code and the embedded figure name the case sources', async () => {
    const taroko = getCase('taroko-derailment-2021').data.sources[0].citation
    const { container, unmount } = render(<CausalPlayground caseId="taroko-derailment-2021" />)
    openMenu(container)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '複製嵌入碼' }))
    })
    expect(copied.at(-1)).toContain(`案例出處：${taroko.replace(/&/g, '&amp;')}`)
    unmount()
    const embedded = render(<CausalPlayground caseId="taroko-derailment-2021" embedded />)
    expect(embedded.container.querySelector('.ca-embed-credit')?.textContent).toContain('案例出處：Wang & Wang 2026')
  })
})
