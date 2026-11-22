// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../../components/index.ts'
import { Explorer } from './Explorer.tsx'
import { mdxText, snippet } from './snippet.ts'
import { parseHash } from './url-state.ts'

const open = (hash: string): void => {
  window.history.replaceState(null, '', `/${hash}`)
  render(
    <LocaleProvider locale="zh-TW">
      <Explorer />
    </LocaleProvider>,
  )
}
const med = (): HTMLElement | null => document.querySelector<HTMLElement>('.ca-med')
const writeText = vi.fn(() => Promise.resolve())

beforeEach(() => {
  writeText.mockClear()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})
afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

describe('Explorer', () => {
  it('opens the identification stories with their own model and query', () => {
    open('#/explorer?c=identify&s=identify-basic')
    expect(document.querySelector('[data-identification]')?.getAttribute('data-identification')).toBe('identified')
    fireEvent.click(screen.getByRole('button', { name: 'identify-bow' }))
    expect(document.querySelector('[data-identification]')?.getAttribute('data-identification')).toBe('hedge')
    expect(snippet(parseHash(window.location.hash).state).jsx).toContain('IdentifyPanel')
  })

  it('opens the mediation story at step 1 and remounts at step 3 without a history entry', async () => {
    open('#/explorer?c=probability&s=mediation')
    await waitFor(() => expect(med()?.dataset.step).toBe('1'))
    const length = window.history.length
    const step = screen.getByRole('spinbutton', { name: '起始步驟' })
    fireEvent.change(step, { target: { value: '3' } })
    fireEvent.blur(step)
    await waitFor(() => expect(med()?.dataset.step).toBe('3'))
    expect(window.location.hash).toContain('initialStep=3')
    expect(window.history.length).toBe(length)
    expect(parseHash(window.location.hash).state.args.initialStep).toBe(3)
  })

  it('shows what a component rejects, and the next valid edit clears it', async () => {
    open('#/explorer?c=playground&s=playground-basic')
    const mode = await screen.findByRole('combobox', { name: '步驟按鈕' })
    fireEvent.change(mode, { target: { value: 'custom' } })
    const box = await screen.findByRole('textbox', { name: '步驟按鈕 JSON' })
    fireEvent.change(box, { target: { value: '[{' } })
    fireEvent.blur(box)
    expect(screen.getByText(/JSON 格式有誤/)).toBeTruthy()
    fireEvent.change(box, { target: { value: '[{"label":"x","observed":{"SH":1}}]' } })
    fireEvent.blur(box)
    const alert = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('.ex-alert')
      if (el === null) throw new Error('no alert yet')
      return el
    })
    expect(alert.textContent).toContain('observed')
    fireEvent.change(box, { target: { value: '[{"label":"x","interventions":{"SH":0}}]' } })
    fireEvent.blur(box)
    await waitFor(() => expect(document.querySelector('.ex-alert')).toBeNull())
    expect(document.querySelector('.ca-playground, .ca-root')).not.toBeNull()
  })

  it('leaves the address free of the editor’s parameters when ModelEditor is picked', async () => {
    open('#/explorer?c=playground&s=playground-basic')
    const length = window.history.length
    fireEvent.click(await screen.findByRole('button', { name: 'ModelEditor 模型編輯器' }))
    await waitFor(() => expect(document.querySelector('.ca-editor-case')).not.toBeNull())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600))
    })
    expect(window.location.hash).toContain('c=editor')
    expect(window.location.hash).not.toMatch(/[?&#](case|model|do|pdo)=/)
    expect(window.history.length).toBe(length + 1)
  })

  it('copies the snippets and the link', async () => {
    open('#/explorer?c=probability&s=mediation')
    await waitFor(() => expect(med()).not.toBeNull())
    const state = parseHash(window.location.hash).state
    const buttons = screen.getAllByRole('button', { name: '複製' })
    fireEvent.click(buttons[0])
    expect(writeText).toHaveBeenLastCalledWith(snippet(state).jsx)
    fireEvent.click(screen.getByRole('tab', { name: '部落格 MDX' }))
    fireEvent.click(screen.getAllByRole('button', { name: /^複製$|^已複製$/ })[0])
    expect(writeText).toHaveBeenLastCalledWith(mdxText(snippet(state)))
    fireEvent.click(screen.getByRole('button', { name: '複製連結' }))
    expect(writeText).toHaveBeenLastCalledWith(window.location.href)
  })

  it('reports an unknown component and falls back', async () => {
    open('#/explorer?c=nope')
    expect(await screen.findByRole('status')).toBeTruthy()
    expect(document.querySelector('.ex-root')?.getAttribute('data-component')).toBe('playground')
  })
})
