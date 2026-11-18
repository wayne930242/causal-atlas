import type { KeyboardEvent, ReactNode } from 'react'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CatalogEntry, CatalogGroup } from './editor/catalog.ts'
import { HOST_CHIP, filterCatalog, matches } from './editor/catalog.ts'
import { useMessages } from './i18n.ts'

/**
 * The editor's case list: a search box, one chip per family or host group, and a listbox of the
 * cases grouped under their family. The search box drives the list (ArrowDown enters it, Enter loads
 * the first match, Escape clears it); in the list, arrow keys, Home and End move, Enter or Space
 * loads, and typing goes back to the search box. A polite live region says how many match.
 */

export interface CaseListProps {
  readonly groups: readonly CatalogGroup[]
  /** The current choice: `blank`, a case id, `model:<id>`, or '' for none. */
  readonly value: string
  readonly onPick: (key: string) => void
  /** Focus the search box on mount (the sheet does). */
  readonly autoFocus?: boolean
  /** The one chip for all host models. Default 講義模型 / Lesson models. */
  readonly modelsLabel?: string
}

const BLANK = 'blank'

/** Layout effects warn on the server; there is no layout to read there anyway. */
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** Scroll `el` into view inside `list` only, never the page. */
function revealIn(list: HTMLElement | null, el: HTMLElement | null): void {
  if (list === null || el === null) return
  const top = el.offsetTop
  const bottom = top + el.offsetHeight
  if (top < list.scrollTop) list.scrollTop = top
  else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight
}

export function CaseList({ groups, value, onPick, autoFocus = false, modelsLabel }: CaseListProps) {
  const e = useMessages().editor
  const uid = useId()
  const listId = `${uid}-list`
  const countId = `${uid}-count`
  const [query, setQuery] = useState('')
  const [only, setOnly] = useState<string | undefined>(undefined)
  const [active, setActive] = useState<string | undefined>(undefined)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // A chip left over from other groups (another language, other host models) means all.
  const hasHost = groups.some((g) => g.id.startsWith('group:'))
  const chips = [
    { id: undefined as string | undefined, label: e.allFamilies },
    ...groups.filter((g) => g.id.startsWith('family:')),
    ...(hasHost ? [{ id: HOST_CHIP, label: modelsLabel ?? e.lessonModels }] : []),
  ]
  const family = only !== undefined && chips.some((c) => c.id === only) ? only : undefined
  const shown = useMemo(() => filterCatalog(groups, query, family), [groups, query, family])
  const blankShown = family === undefined && matches({ key: BLANK, label: e.blank, search: e.blankSearch.toLowerCase() }, query)
  // The blank model heads the list: picking a case starts from a copy of it anyway.
  const order = useMemo(() => [...(blankShown ? [BLANK] : []), ...shown.flatMap((g) => g.entries.map((x) => x.key))], [shown, blankShown])
  // Option ids stay the same while the list is filtered, so the active descendant keeps its id.
  const optionIds = useMemo(() => {
    const ids = new Map<string, string>([[BLANK, `${uid}-o-blank`]])
    groups.forEach((g, gi) => g.entries.forEach((x, xi) => ids.set(x.key, `${uid}-o${gi}-${xi}`)))
    return ids
  }, [groups, uid])
  const activeKey = active !== undefined && order.includes(active) ? active : undefined
  const filtering = query !== '' || family !== undefined

  useEffect(() => {
    if (autoFocus) searchRef.current?.focus()
  }, [autoFocus])

  // Keep the active option, or else the current one, in view inside the list's own scroll.
  const revealKey = activeKey ?? value
  useClientLayoutEffect(() => {
    const id = optionIds.get(revealKey)
    revealIn(listRef.current, id === undefined ? null : document.getElementById(id))
  }, [revealKey, optionIds, shown])

  const pick = (key: string | undefined): void => {
    if (key === undefined) return
    setActive(key)
    onPick(key)
  }
  const enterList = (key: string | undefined): void => {
    setActive(key)
    listRef.current?.focus()
  }
  const typeIntoSearch = (next: string): void => {
    setQuery(next)
    searchRef.current?.focus()
  }

  const onSearchKey = (ev: KeyboardEvent<HTMLInputElement>): void => {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault()
      if (order.length > 0) enterList(order[0])
    } else if (ev.key === 'Enter') {
      ev.preventDefault()
      pick(order[0])
    } else if (ev.key === 'Escape' && query !== '') {
      // Handled here: a sheet around the list closes only on an Escape nobody used.
      ev.preventDefault()
      setQuery('')
    }
  }

  const onListKey = (ev: KeyboardEvent<HTMLDivElement>): void => {
    const at = activeKey === undefined ? -1 : order.indexOf(activeKey)
    const move = (i: number): void => {
      ev.preventDefault()
      setActive(order[Math.max(0, Math.min(order.length - 1, i))])
    }
    if (ev.key === 'ArrowDown') move(at + 1)
    else if (ev.key === 'ArrowUp') {
      if (at <= 0) {
        ev.preventDefault()
        searchRef.current?.focus()
      } else move(at - 1)
    } else if (ev.key === 'Home') move(0)
    else if (ev.key === 'End') move(order.length - 1)
    else if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault()
      pick(activeKey)
    } else if (ev.key === 'Escape' && query !== '') {
      ev.preventDefault()
      typeIntoSearch('')
    } else if (ev.key === 'Backspace') {
      ev.preventDefault()
      typeIntoSearch(query.slice(0, -1))
    } else if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      ev.preventDefault()
      typeIntoSearch(query + ev.key)
    }
  }

  const renderOption = (x: Pick<CatalogEntry, 'key' | 'label' | 'subtitle'>): ReactNode => (
    <div
      key={x.key}
      id={optionIds.get(x.key)}
      role="option"
      aria-selected={x.key === value}
      data-key={x.key}
      data-active={x.key === activeKey ? 'true' : undefined}
      className="ca-editor-option"
      title={x.subtitle === undefined ? x.label : `${x.label} — ${x.subtitle}`}
      onClick={() => pick(x.key)}
    >
      <span className="ca-editor-option-title">{x.label}</span>
      {x.subtitle !== undefined && <span className="ca-editor-option-sub">{x.subtitle}</span>}
    </div>
  )

  return (
    <div className="ca-editor-list">
      <input
        ref={searchRef}
        type="search"
        className="ca-editor-search"
        aria-label={e.search}
        aria-controls={listId}
        aria-describedby={countId}
        placeholder={e.searchPlaceholder}
        value={query}
        autoComplete="off"
        spellCheck={false}
        onChange={(ev) => setQuery(ev.currentTarget.value)}
        onKeyDown={onSearchKey}
      />
      <div className="ca-editor-chips" role="group" aria-label={e.familyFilter}>
        {chips.map((g) => (
          <button
            key={g.id ?? ''}
            type="button"
            className="ca-editor-chip"
            aria-pressed={g.id === family}
            onClick={() => setOnly(g.id)}
          >
            {g.label}
          </button>
        ))}
      </div>
      <p id={countId} className="ca-editor-list-count ca-muted ca-small" aria-live="polite">
        {!filtering ? '' : order.length === 0 ? e.noMatch : e.matches(order.length)}
      </p>
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={e.caseList}
        aria-activedescendant={activeKey === undefined ? undefined : optionIds.get(activeKey)}
        tabIndex={0}
        className="ca-editor-options"
        onKeyDown={onListKey}
        onFocus={(ev) => {
          if (ev.target !== ev.currentTarget || activeKey !== undefined) return
          setActive(order.includes(value) ? value : order[0])
        }}
      >
        {blankShown && renderOption({ key: BLANK, label: e.blank })}
        {!filtering && (
          <div role="presentation" className="ca-editor-copy-note">
            {e.copyNote}
          </div>
        )}
        {shown.map((g, gi) => {
          const headId = `${uid}-g${gi}`
          return (
            <div key={g.id} role="group" aria-labelledby={headId} className="ca-editor-optgroup">
              <div role="presentation" id={headId} className="ca-editor-optgroup-label">
                {g.label}
              </div>
              {g.entries.map(renderOption)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export interface CaseSheetProps {
  readonly groups: readonly CatalogGroup[]
  readonly value: string
  /** The title of the model on screen, shown on the button. */
  readonly title: string
  readonly onPick: (key: string) => void
  readonly modelsLabel?: string
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * The narrow layout's case list: a 選案例 button with the current title that opens the same list in a
 * modal dialog. Escape or picking closes it and focus returns to the button; Tab stays inside.
 */
export function CaseSheet({ groups, value, title, onPick, modelsLabel }: CaseSheetProps) {
  const e = useMessages().editor
  const headId = useId()
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const wasOpen = useRef(false)

  useEffect(() => {
    const d = dialog.current
    if (open && d !== null && !d.open) {
      // The top layer escapes the editor's containment, so the sheet covers the viewport.
      if (typeof d.showModal === 'function') d.showModal()
      else d.setAttribute('open', '')
      d.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
    }
    if (!open && wasOpen.current) trigger.current?.focus()
    wasOpen.current = open
  }, [open])

  const onKey = (ev: KeyboardEvent<HTMLDialogElement>): void => {
    const d = dialog.current
    if (d === null) return
    if (ev.key === 'Escape' && !ev.defaultPrevented) {
      ev.preventDefault()
      setOpen(false)
    } else if (ev.key === 'Tab') {
      const all = [...d.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = all[0]
      const last = all[all.length - 1]
      if (first === undefined || last === undefined) return
      const at = document.activeElement
      const inside = at !== null && d.contains(at)
      if (ev.shiftKey && (at === first || !inside)) {
        ev.preventDefault()
        last.focus()
      } else if (!ev.shiftKey && (at === last || !inside)) {
        ev.preventDefault()
        first.focus()
      }
    }
  }

  return (
    <div className="ca-editor-pickbar">
      <button
        ref={trigger}
        type="button"
        className="ca-editor-pickbar-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="ca-field-label">{e.pickCase}</span>
        <span className="ca-editor-pickbar-title">{title}</span>
        <svg className="ca-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 6l5 5l5-5" fill="none" stroke="currentColor" strokeWidth="1.75" />
        </svg>
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="ca-editor-sheet"
          aria-labelledby={headId}
          aria-modal="true"
          onKeyDown={onKey}
          onCancel={(ev) => {
            ev.preventDefault()
            setOpen(false)
          }}
        >
          <div className="ca-editor-sheet-head">
            <h2 id={headId} className="ca-h2">
              {e.pickCase}
            </h2>
            <button type="button" className="ca-btn ca-btn-outline" onClick={() => setOpen(false)}>
              {e.close}
            </button>
          </div>
          <CaseList
            groups={groups}
            value={value}
            autoFocus
            modelsLabel={modelsLabel}
            onPick={(key) => {
              onPick(key)
              setOpen(false)
            }}
          />
        </dialog>
      )}
    </div>
  )
}
