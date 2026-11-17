import type { KeyboardEvent } from 'react'
import { useId, useMemo, useState } from 'react'
import type { CatalogGroup } from './editor/catalog.ts'
import { filterCatalog, matches } from './editor/catalog.ts'
import { useMessages } from './i18n.ts'

export interface ModelPickerProps {
  readonly groups: readonly CatalogGroup[]
  /** The select value: '' (nothing chosen), `blank`, a case id or `model:<id>`. */
  readonly value: string
  readonly onPick: (key: string) => void
}

/**
 * The editor's model list: a filter box over a native select grouped by family and lesson. Enter in
 * the filter loads the first match, Escape clears it; the select is keyboard-operable as it is.
 */
export function ModelPicker({ groups, value, onPick }: ModelPickerProps) {
  const e = useMessages().editor
  const [query, setQuery] = useState('')
  const selectId = useId()
  const countId = useId()
  const shown = useMemo(() => filterCatalog(groups, query, value), [groups, query, value])
  const hits = useMemo(() => shown.flatMap((g) => g.entries).filter((x) => matches(x, query)), [shown, query])
  const onKey = (ev: KeyboardEvent<HTMLInputElement>): void => {
    if (ev.key === 'Enter') {
      ev.preventDefault()
      const first = hits[0]
      if (first !== undefined) onPick(first.key)
    } else if (ev.key === 'Escape' && query !== '') {
      ev.preventDefault()
      setQuery('')
    }
  }
  return (
    <div className="ca-editor-pick">
      <label className="ca-field">
        <span className="ca-field-label">{e.filter}</span>
        <input
          type="search"
          aria-label={e.filter}
          aria-controls={selectId}
          aria-describedby={countId}
          placeholder={e.filterPlaceholder}
          value={query}
          autoComplete="off"
          spellCheck={false}
          onChange={(ev) => setQuery(ev.currentTarget.value)}
          onKeyDown={onKey}
        />
      </label>
      <label className="ca-field ca-field-grow">
        <span className="ca-field-label">{e.startFrom}</span>
        <select
          id={selectId}
          aria-label={e.startFrom}
          value={value}
          onChange={(ev) => {
            const key = ev.currentTarget.value
            if (key !== '') onPick(key)
          }}
        >
          <option value="">{hits.length === 0 ? e.noMatch : e.chooseCase}</option>
          <option value="blank">{e.blank}</option>
          {shown.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.entries.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <span id={countId} className="ca-sr" aria-live="polite">
        {query === '' ? '' : hits.length === 0 ? e.noMatch : e.matches(hits.length)}
      </span>
    </div>
  )
}
