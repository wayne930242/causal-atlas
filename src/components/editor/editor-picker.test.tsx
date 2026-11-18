// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { caseIds, getCase } from '../../data/index.ts'
import { caseToDoc } from '../../data/model-doc.ts'
import { ModelEditor } from '../index.ts'

afterEach(() => {
  cleanup()
  // The editor writes the model it shows into the address; the next test starts from none.
  window.history.replaceState(null, '', '/')
})

const coarse = { ...caseToDoc(getCase('rock-throwing')), from: undefined, title: '丟石頭的粗模型' }
const extraModels = [
  {
    id: 'm08-rock-coarse',
    title: '丟石頭的粗模型',
    group: '第 8 講',
    doc: {
      ...coarse,
      model: {
        variables: coarse.model.variables.filter((v) => !['SH', 'BH'].includes(v.id)),
        equations: { ST: 'U_ST', BT: 'U_BT', BS: 'ST or BT' },
      },
      layout: undefined,
      normality: undefined,
    },
    links: [{ title: '形式 08', href: '/blog/formal-08/' }],
  },
]

/** The sidebar's list: the first listbox in the editor (the sheet, when open, is a dialog). */
const sidebar = (): HTMLElement => screen.getAllByRole('listbox', { name: '案例清單' })[0] as HTMLElement
const search = (scope: HTMLElement = document.body): HTMLInputElement =>
  within(scope).getAllByRole('searchbox', { name: '搜尋案例' })[0] as HTMLInputElement
const keys = (list: HTMLElement = sidebar()): string[] =>
  [...list.querySelectorAll<HTMLElement>('[role="option"]')].map((o) => o.dataset.key ?? '')
const option = (key: string, list: HTMLElement = sidebar()): HTMLElement => {
  const el = list.querySelector<HTMLElement>(`[role="option"][data-key="${key}"]`)
  if (el === null) throw new Error(`no option ${key}`)
  return el
}
const selected = (list: HTMLElement = sidebar()): string[] =>
  [...list.querySelectorAll<HTMLElement>('[role="option"][aria-selected="true"]')].map((o) => o.dataset.key ?? '')
const headTitle = (container: HTMLElement): string | null | undefined => container.querySelector('.ca-editor-head h2')?.textContent
const count = (container: HTMLElement): string => container.querySelector('.ca-editor-list-count')?.textContent ?? ''
const chip = (name: string): HTMLElement => within(screen.getAllByRole('group', { name: '依類別篩選' })[0] as HTMLElement).getByRole('button', { name })

describe('ModelEditor case list', () => {
  it('lists every case, the host models and a blank model, grouped under headings', () => {
    render(<ModelEditor initial="rock-throwing" extraModels={extraModels} />)
    for (const id of caseIds) expect(keys()).toContain(id)
    expect(keys()).toContain('model:m08-rock-coarse')
    expect(keys()).toContain('blank')
    const headings = within(sidebar())
      .getAllByRole('group')
      .map((g) => g.getAttribute('aria-labelledby'))
      .map((id) => document.getElementById(id ?? '')?.textContent)
    expect(headings).toEqual(expect.arrayContaining(['實際因果', '因果決策', '第 8 講']))
  })

  it('family chips narrow the list to one family or host group', () => {
    const { container } = render(<ModelEditor initial="rock-throwing" extraModels={extraModels} />)
    expect(chip('全部').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(chip('因果決策'))
    expect(chip('因果決策').getAttribute('aria-pressed')).toBe('true')
    const decision = caseIds.filter((id) => getCase(id).data.family === 'decision')
    expect(keys().sort()).toEqual([...decision].sort())
    expect(count(container)).toBe(`${decision.length} 個符合`)
    fireEvent.click(chip('講義模型'))
    expect(keys()).toEqual(['model:m08-rock-coarse'])
    fireEvent.click(chip('全部'))
    expect(keys()).toContain('rock-throwing')
    expect(keys()).toContain('blank')
    expect(count(container)).toBe('')
  })

  it('keeps one chip for all host models, however many groups, with headings in order', () => {
    const many = Array.from({ length: 13 }, (_, i) => ({
      ...(extraModels[0] as (typeof extraModels)[number]),
      id: `m-${i}`,
      title: `模型 ${i}`,
      group: `第 ${13 - i} 講`,
    }))
    render(<ModelEditor initial="rock-throwing" extraModels={many} modelsLabel="課程模型" />)
    const chips = within(screen.getAllByRole('group', { name: '依類別篩選' })[0] as HTMLElement).getAllByRole('button')
    const families = new Set(caseIds.map((id) => getCase(id).data.family)).size
    expect(chips.length).toBe(families + 2)
    fireEvent.click(chip('課程模型'))
    expect(keys()).toEqual(many.map((m) => `model:${m.id}`))
    const heads = [...sidebar().querySelectorAll('.ca-editor-optgroup-label')].map((h) => h.textContent)
    expect(heads).toEqual(many.map((m) => m.group))
    fireEvent.change(search(), { target: { value: '第 13 講' } })
    expect(keys()).toEqual(['model:m-0'])
  })

  it('the search narrows across groups and matches either language', () => {
    const { container } = render(<ModelEditor initial="rock-throwing" extraModels={extraModels} />)
    fireEvent.change(search(), { target: { value: '紐康' } })
    expect(keys()).toEqual(['newcomb'])
    expect(count(container)).toBe('1 個符合')
    // English title from a Chinese interface, and the group headings that are left.
    fireEvent.change(search(), { target: { value: 'rock' } })
    expect(keys()).toContain('rock-throwing')
    expect(keys()).toContain('model:m08-rock-coarse')
    expect(keys()).not.toContain('newcomb')
    expect(within(sidebar()).getAllByRole('group').length).toBeGreaterThanOrEqual(2)
    // A host group's name, and the chip and search together.
    fireEvent.change(search(), { target: { value: '第 8 講' } })
    expect(keys()).toEqual(['model:m08-rock-coarse'])
    fireEvent.change(search(), { target: { value: 'zzz-nothing' } })
    expect(keys()).toEqual([])
    expect(count(container)).toBe('沒有符合的項目')
    fireEvent.keyDown(search(), { key: 'Escape' })
    expect(search().value).toBe('')
  })

  it('matches the Chinese title from an English interface', () => {
    render(<ModelEditor initial="rock-throwing" locale="en" />)
    const box = screen.getAllByRole('searchbox', { name: 'Search cases' })[0] as HTMLInputElement
    fireEvent.change(box, { target: { value: '紐康' } })
    const list = screen.getAllByRole('listbox', { name: 'Cases' })[0] as HTMLElement
    expect(keys(list)).toEqual(['newcomb'])
  })

  it('Enter in the search loads the first match', () => {
    const { container } = render(<ModelEditor initial="rock-throwing" extraModels={extraModels} />)
    fireEvent.change(search(), { target: { value: 'newcomb' } })
    fireEvent.keyDown(search(), { key: 'Enter' })
    expect(selected()).toEqual(['newcomb'])
    expect(headTitle(container)).toBe(getCase('newcomb').data.title['zh-TW'])
  })

  it('arrow keys move through the listbox and Enter picks', () => {
    const { container } = render(<ModelEditor initial="rock-throwing" extraModels={extraModels} />)
    const list = sidebar()
    expect(list.getAttribute('tabindex')).toBe('0')
    fireEvent.change(search(), { target: { value: 'rock' } })
    const [first, second] = keys()
    fireEvent.keyDown(search(), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(list)
    expect(list.getAttribute('aria-activedescendant')).toBe(option(first ?? '').id)
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(list.getAttribute('aria-activedescendant')).toBe(option(second ?? '').id)
    fireEvent.keyDown(list, { key: 'Enter' })
    expect(selected()).toEqual([second])
    // Up from the first option goes back to the search box.
    fireEvent.keyDown(list, { key: 'Home' })
    expect(list.getAttribute('aria-activedescendant')).toBe(option(first ?? '').id)
    fireEvent.keyDown(list, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(search())
    // Typing in the list types into the search.
    fireEvent.change(search(), { target: { value: '' } })
    fireEvent.keyDown(search(), { key: 'ArrowDown' })
    fireEvent.keyDown(list, { key: 'n' })
    expect(document.activeElement).toBe(search())
    expect(search().value).toBe('n')
    fireEvent.change(search(), { target: { value: 'newcomb' } })
    fireEvent.keyDown(search(), { key: 'ArrowDown' })
    fireEvent.keyDown(list, { key: ' ' })
    expect(selected()).toEqual(['newcomb'])
    expect(headTitle(container)).toBe(getCase('newcomb').data.title['zh-TW'])
  })

  it('clicking an option picks it and the header follows', () => {
    const { container } = render(<ModelEditor initial="rock-throwing" extraModels={extraModels} />)
    expect(selected()).toEqual(['rock-throwing'])
    expect(headTitle(container)).toBe(getCase('rock-throwing').data.title['zh-TW'])
    expect(container.querySelector('.ca-editor-head')?.textContent).toContain('實際因果')
    fireEvent.click(option('model:m08-rock-coarse'))
    expect(selected()).toEqual(['model:m08-rock-coarse'])
    expect(container.querySelector('.ca-editor-head')?.textContent).toContain('第 8 講')
  })

  it('choosing a host model loads its document and shows its links instead of a story', () => {
    const { container } = render(<ModelEditor initial="rock-throwing" extraModels={extraModels} />)
    expect(container.querySelector('.ca-graph [data-node="SH"]')).not.toBeNull()
    fireEvent.click(option('model:m08-rock-coarse'))
    expect(container.querySelector('.ca-graph [data-node="SH"]')).toBeNull()
    expect(container.querySelector('.ca-graph [data-node="BS"]')).not.toBeNull()
    expect((screen.getByLabelText('模型名稱') as HTMLInputElement).value).toBe('丟石頭的粗模型')
    const panel = container.querySelector('.ca-editor-case') as HTMLElement
    expect(within(panel).getByRole('link', { name: '形式 08' }).getAttribute('href')).toBe('/blog/formal-08/')
    expect(panel.querySelector('.ca-story')).toBeNull()
    // Back to a case: the story returns.
    fireEvent.click(option('firing-squad'))
    expect(container.querySelector('.ca-editor-case .ca-story')).not.toBeNull()
  })

  it('notes when the model was edited away from the case', () => {
    const { container } = render(<ModelEditor initial="rock-throwing" />)
    expect(container.querySelector('.ca-editor-case-edited')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '式子' }))
    fireEvent.change(screen.getByLabelText('BS 的式子', { selector: 'input' }), { target: { value: 'SH' } })
    expect(container.querySelector('.ca-editor-case-edited')).not.toBeNull()
  })

  it('highlights the case the address names', async () => {
    window.history.replaceState(null, '', '/#case=newcomb')
    const { container } = render(<ModelEditor extraModels={extraModels} />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(selected()).toEqual(['newcomb'])
    expect(headTitle(container)).toBe(getCase('newcomb').data.title['zh-TW'])
    expect(within(sidebar()).getAllByRole('option', { selected: true })).toHaveLength(1)
  })
})

describe('ModelEditor case sheet (narrow)', () => {
  const trigger = (): HTMLElement => screen.getByRole('button', { name: /^選案例/ })

  it('opens a dialog with the list, closes on Escape and returns focus', () => {
    render(<ModelEditor initial="rock-throwing" extraModels={extraModels} />)
    expect(trigger().textContent).toContain(getCase('rock-throwing').data.title['zh-TW'])
    expect(screen.queryByRole('dialog')).toBeNull()
    trigger().focus()
    fireEvent.click(trigger())
    const dialog = screen.getByRole('dialog', { name: '選案例' })
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    const inner = search(dialog)
    expect(document.activeElement).toBe(inner)
    const list = within(dialog).getByRole('listbox', { name: '案例清單' })
    expect(selected(list)).toEqual(['rock-throwing'])
    expect(within(dialog).getByRole('group', { name: '依類別篩選' })).toBeDefined()
    // Escape first clears a search, then closes.
    fireEvent.change(inner, { target: { value: 'new' } })
    fireEvent.keyDown(inner, { key: 'Escape' })
    expect(inner.value).toBe('')
    expect(screen.queryByRole('dialog')).not.toBeNull()
    fireEvent.keyDown(inner, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('keeps Tab inside the dialog', () => {
    render(<ModelEditor initial="rock-throwing" />)
    fireEvent.click(trigger())
    const dialog = screen.getByRole('dialog', { name: '選案例' })
    const close = within(dialog).getByRole('button', { name: '關閉' })
    const list = within(dialog).getByRole('listbox')
    list.focus()
    fireEvent.keyDown(list, { key: 'Tab' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    close.focus()
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(close)
    fireEvent.click(close)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('picking a case closes the sheet and loads it', () => {
    const { container } = render(<ModelEditor initial="rock-throwing" />)
    fireEvent.click(trigger())
    const dialog = screen.getByRole('dialog', { name: '選案例' })
    fireEvent.click(option('newcomb', within(dialog).getByRole('listbox')))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(headTitle(container)).toBe(getCase('newcomb').data.title['zh-TW'])
    expect(trigger().textContent).toContain(getCase('newcomb').data.title['zh-TW'])
    expect(document.activeElement).toBe(trigger())
  })
})
