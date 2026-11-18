import type { ReactNode } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import type { ControlSpec } from './controls.ts'
import type { VariableInfo } from './model-info.ts'
import { deepEqual } from './url-state.ts'

export interface EditorText {
  readonly unset: string
  readonly add: string
  readonly remove: string
  readonly on: string
  readonly off: string
  readonly jsonError: string
}

export interface EditorProps {
  readonly spec: ControlSpec
  /** The current value; undefined when unset. */
  readonly value: unknown
  readonly onChange: (next: unknown) => void
  readonly text: EditorText
  /** The object a group or list item sits in; `value` fields read a sibling from it. */
  readonly parent?: Readonly<Record<string, unknown>>
  /** The component's own default, shown when the value is unset. */
  readonly fallback?: unknown
}

const IDLE_MS = 400

/** Text that commits on blur, Enter or 400 ms without typing, not per keystroke. */
function useCommitted(value: string, commit: (text: string) => void) {
  const [draft, setDraft] = useState(value)
  const last = useRef(value)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const commitRef = useRef(commit)
  useEffect(() => {
    commitRef.current = commit
  })
  useEffect(() => {
    if (value !== last.current) {
      last.current = value
      setDraft(value)
    }
  }, [value])
  useEffect(() => () => clearTimeout(timer.current), [])
  const flush = (text: string): void => {
    clearTimeout(timer.current)
    if (text !== last.current) {
      last.current = text
      commitRef.current(text)
    }
  }
  return {
    value: draft,
    onChange: (text: string): void => {
      setDraft(text)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => flush(text), IDLE_MS)
    },
    onBlur: (): void => flush(draft),
    onKeyDown: (e: { key: string }): void => {
      if (e.key === 'Enter') flush(draft)
    },
  }
}

const same = (a: unknown, b: unknown): boolean => deepEqual(a, b)
const encode = (value: unknown): string => JSON.stringify(value) ?? 'null'
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function TextField({ spec, value, onChange, listId }: EditorProps & { readonly listId?: string }) {
  const id = useId()
  const field = useCommitted(typeof value === 'string' ? value : '', (text) => onChange(text === '' ? undefined : text))
  return (
    <input
      id={id}
      className="ex-input"
      type="text"
      aria-label={spec.label}
      list={listId}
      disabled={spec.disabled !== undefined}
      value={field.value}
      onChange={(e) => field.onChange(e.currentTarget.value)}
      onBlur={field.onBlur}
      onKeyDown={field.onKeyDown}
    />
  )
}

function EventField(props: EditorProps) {
  const listId = useId()
  return (
    <>
      <TextField {...props} listId={listId} />
      <datalist id={listId}>
        {(props.spec.events ?? []).map((e) => (
          <option key={e} value={e} />
        ))}
      </datalist>
    </>
  )
}

function NumberField({ spec, value, onChange }: EditorProps) {
  const field = useCommitted(typeof value === 'number' ? String(value) : '', (text) => {
    if (text.trim() === '') onChange(undefined)
    else if (Number.isFinite(Number(text))) onChange(Number(text))
  })
  return (
    <input
      className="ex-input ex-number"
      type="number"
      aria-label={spec.label}
      min={spec.min}
      max={spec.max}
      step={1}
      disabled={spec.disabled !== undefined}
      value={field.value}
      onChange={(e) => field.onChange(e.currentTarget.value)}
      onBlur={field.onBlur}
      onKeyDown={field.onKeyDown}
    />
  )
}

function SelectField({ spec, value, fallback, onChange }: EditorProps) {
  const current = typeof value === 'string' ? value : typeof fallback === 'string' ? fallback : ''
  const known = (spec.options ?? []).some((o) => o.value === current)
  return (
    <select className="ex-input" aria-label={spec.label} disabled={spec.disabled !== undefined} value={current} onChange={(e) => onChange(e.currentTarget.value)}>
      {!known && <option value={current}>{current}</option>}
      {(spec.options ?? []).map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function ToggleField({ spec, value, fallback, onChange }: EditorProps) {
  const on = typeof value === 'boolean' ? value : fallback === true
  return <input type="checkbox" aria-label={spec.label} disabled={spec.disabled !== undefined} checked={on} onChange={(e) => onChange(e.currentTarget.checked)} />
}

function VariablesField({ spec, value, onChange }: EditorProps) {
  const chosen = Array.isArray(value) ? (value as string[]) : []
  return (
    <span className="ex-chips" role="group" aria-label={spec.label}>
      {(spec.options ?? []).map((o) => (
        <label key={o.value} className="ex-chip">
          <input
            type="checkbox"
            disabled={spec.disabled !== undefined}
            checked={chosen.includes(o.value)}
            onChange={(e) => {
              const next = e.currentTarget.checked ? [...chosen, o.value] : chosen.filter((v) => v !== o.value)
              onChange(next.length === 0 ? undefined : next)
            }}
          />
          {o.value}
        </label>
      ))}
      {(spec.options ?? []).length === 0 && <span className="ex-muted">—</span>}
    </span>
  )
}

function valueOptions(vars: readonly VariableInfo[] | undefined, id: string): readonly unknown[] {
  return vars?.find((v) => v.id === id)?.values ?? []
}

function ValueSelect({ label, options, value, onChange, disabled }: { readonly label: string; readonly options: readonly unknown[]; readonly value: unknown; readonly onChange: (v: unknown) => void; readonly disabled?: boolean }) {
  const known = options.some((o) => same(o, value))
  return (
    <select
      className="ex-input ex-value"
      aria-label={label}
      disabled={disabled}
      value={encode(value)}
      onChange={(e) => onChange(JSON.parse(e.currentTarget.value) as unknown)}
    >
      {!known && <option value={encode(value)}>{String(value ?? '')}</option>}
      {options.map((o) => (
        <option key={encode(o)} value={encode(o)}>
          {String(o)}
        </option>
      ))}
    </select>
  )
}

function ValueField({ spec, value, onChange, parent }: EditorProps) {
  const of = spec.domainOf === undefined ? undefined : parent?.[spec.domainOf]
  const options = typeof of === 'string' ? valueOptions(spec.vars, of) : []
  return <ValueSelect label={spec.label} options={options} value={value} onChange={onChange} disabled={spec.disabled !== undefined} />
}

function AssignmentField({ spec, value, onChange, text }: EditorProps) {
  const current = isObject(value) ? value : {}
  const ids = Object.keys(current)
  const free = (spec.vars ?? []).filter((v) => !ids.includes(v.id))
  const set = (next: Record<string, unknown>): void => onChange(Object.keys(next).length === 0 ? undefined : next)
  return (
    <span className="ex-rows">
      {ids.map((id) => (
        <span key={id} className="ex-row">
          <code>{id}</code>=
          <ValueSelect label={id} options={valueOptions(spec.vars, id)} value={current[id]} disabled={spec.disabled !== undefined} onChange={(v) => set({ ...current, [id]: v })} />
          <button type="button" className="ex-mini" aria-label={`${text.remove} ${id}`} onClick={() => set(Object.fromEntries(Object.entries(current).filter(([k]) => k !== id)))}>
            ×
          </button>
        </span>
      ))}
      <select
        className="ex-input ex-add"
        aria-label={`${spec.label} ${text.add}`}
        disabled={spec.disabled !== undefined || free.length === 0}
        value=""
        onChange={(e) => {
          const v = free.find((x) => x.id === e.currentTarget.value)
          if (v !== undefined) set({ ...current, [v.id]: v.values[v.values.length - 1] })
        }}
      >
        <option value="">+ {text.add}</option>
        {free.map((v) => (
          <option key={v.id} value={v.id}>
            {v.id}
          </option>
        ))}
      </select>
    </span>
  )
}

function PriorsField({ spec, value, onChange, text }: EditorProps) {
  const current = isObject(value) ? (value as Record<string, number>) : {}
  const ids = Object.keys(current)
  const free = (spec.vars ?? []).filter((v) => !ids.includes(v.id))
  const set = (next: Record<string, number>): void => onChange(Object.keys(next).length === 0 ? undefined : next)
  return (
    <span className="ex-rows">
      {ids.map((id) => (
        <span key={id} className="ex-row">
          <code>{id}</code>
          <input
            className="ex-input ex-number"
            type="number"
            aria-label={`P(${id})`}
            min={0}
            max={1}
            step={0.05}
            disabled={spec.disabled !== undefined}
            value={current[id]}
            onChange={(e) => {
              const n = Number(e.currentTarget.value)
              if (Number.isFinite(n)) set({ ...current, [id]: n })
            }}
          />
          <button type="button" className="ex-mini" aria-label={`${text.remove} ${id}`} onClick={() => set(Object.fromEntries(Object.entries(current).filter(([k]) => k !== id)))}>
            ×
          </button>
        </span>
      ))}
      <select
        className="ex-input ex-add"
        aria-label={`${spec.label} ${text.add}`}
        disabled={spec.disabled !== undefined || free.length === 0}
        value=""
        onChange={(e) => {
          if (e.currentTarget.value !== '') set({ ...current, [e.currentTarget.value]: 0.5 })
        }}
      >
        <option value="">+ {text.add}</option>
        {free.map((v) => (
          <option key={v.id} value={v.id}>
            {v.id}
          </option>
        ))}
      </select>
    </span>
  )
}

function JsonField({ spec, value, onChange, text }: EditorProps) {
  const shown = value === undefined ? '' : JSON.stringify(value, null, 2)
  const [error, setError] = useState<string | undefined>(undefined)
  const field = useCommitted(shown, (raw) => {
    if (raw.trim() === '') {
      setError(undefined)
      onChange(undefined)
      return
    }
    try {
      const parsed: unknown = JSON.parse(raw)
      setError(undefined)
      onChange(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  })
  return (
    <span className="ex-json">
      <textarea
        className="ex-input ex-textarea"
        aria-label={spec.label}
        aria-invalid={error !== undefined}
        spellCheck={false}
        rows={Math.min(12, Math.max(3, shown.split('\n').length))}
        disabled={spec.disabled !== undefined}
        value={field.value}
        onChange={(e) => field.onChange(e.currentTarget.value)}
        onBlur={field.onBlur}
      />
      {error !== undefined && (
        <span className="ex-error" role="alert">
          {text.jsonError}
          {error}
        </span>
      )}
    </span>
  )
}

function ModesField({ spec, value, onChange, text }: EditorProps) {
  const modes = spec.modes ?? []
  const matched = modes.find((m) => same(m.value, value) && !m.disabled)
  const [custom, setCustom] = useState(false)
  const selected = custom || matched === undefined ? 'custom' : matched.id
  return (
    <span className="ex-rows">
      <select
        className="ex-input"
        aria-label={spec.label}
        disabled={spec.disabled !== undefined}
        value={selected}
        onChange={(e) => {
          const id = e.currentTarget.value
          if (id === 'custom') {
            setCustom(true)
            return
          }
          setCustom(false)
          onChange(modes.find((m) => m.id === id)?.value)
        }}
      >
        {modes.map((m) => (
          <option key={m.id} value={m.id} disabled={m.disabled}>
            {m.label}
          </option>
        ))}
        <option value="custom">{TEXT_CUSTOM}</option>
      </select>
      {selected === 'custom' && <JsonField spec={{ ...spec, label: `${spec.label} JSON` }} value={matched === undefined ? value : undefined} onChange={onChange} text={text} />}
    </span>
  )
}
const TEXT_CUSTOM = 'JSON'

function GroupField({ spec, value, onChange, text }: EditorProps) {
  const current = isObject(value) ? value : undefined
  return (
    <span className="ex-group">
      <label className="ex-chip">
        <input
          type="checkbox"
          aria-label={`${spec.label} ${text.on}`}
          disabled={spec.disabled !== undefined}
          checked={current !== undefined}
          onChange={(e) => onChange(e.currentTarget.checked ? (spec.init ?? {}) : undefined)}
        />
        {current === undefined ? text.off : text.on}
      </label>
      {current !== undefined && <Fields specs={spec.fields ?? []} object={current} text={text} onChange={(next) => onChange(next)} />}
    </span>
  )
}

function ListField({ spec, value, onChange, text }: EditorProps) {
  const items = Array.isArray(value) ? (value as unknown[]) : []
  const asList = spec.tuple === true && items.length > 0 && typeof items[0] === 'string' ? [items] : items
  const set = (next: unknown[]): void => onChange(next.length === 0 ? undefined : next)
  return (
    <span className="ex-rows">
      {asList.map((item, i) => (
        <span key={i} className="ex-item">
          <Fields
            specs={spec.fields ?? []}
            object={spec.tuple === true ? Object.fromEntries((item as unknown[]).map((v, j) => [String(j), v])) : isObject(item) ? item : {}}
            text={text}
            onChange={(next) => {
              const out = spec.tuple === true ? Object.keys(next).sort().map((k) => next[k]) : next
              set(asList.map((x, j) => (j === i ? out : x)))
            }}
          />
          <button type="button" className="ex-mini" aria-label={`${text.remove} ${spec.label} ${i + 1}`} onClick={() => set(asList.filter((_, j) => j !== i))}>
            ×
          </button>
        </span>
      ))}
      <button type="button" className="ex-button" disabled={spec.disabled !== undefined} onClick={() => set([...asList, structuredClone(spec.init ?? {})])}>
        + {text.add}
      </button>
    </span>
  )
}

function Fields({ specs, object, text, onChange }: { readonly specs: readonly ControlSpec[]; readonly object: Record<string, unknown>; readonly text: EditorText; readonly onChange: (next: Record<string, unknown>) => void }) {
  return (
    <span className="ex-fields">
      {specs.map((spec) => (
        <Field
          key={spec.key}
          spec={spec}
          value={object[spec.key]}
          parent={object}
          text={text}
          onChange={(v) => {
            const next = { ...object }
            if (v === undefined) delete next[spec.key]
            else next[spec.key] = v
            onChange(next)
          }}
        />
      ))}
    </span>
  )
}

/** The editor for one control, with its label; a disabled control keeps its reason on one line below. */
export function Field(props: EditorProps): ReactNode {
  const { spec } = props
  const Body = { select: SelectField, toggle: ToggleField, number: NumberField, text: TextField, event: EventField, variables: VariablesField, assignment: AssignmentField, priors: PriorsField, json: JsonField, list: ListField, group: GroupField, modes: ModesField, value: ValueField }[spec.kind]
  const compound = spec.kind === 'list' || spec.kind === 'group' || spec.kind === 'assignment' || spec.kind === 'priors' || spec.kind === 'variables' || spec.kind === 'modes' || spec.kind === 'json'
  return (
    <div className="ex-field" data-key={spec.key} data-kind={spec.kind} aria-disabled={spec.disabled !== undefined || undefined}>
      {compound ? (
        <span className="ex-label" id={`ex-label-${spec.key}`}>
          {spec.label}
        </span>
      ) : (
        <span className="ex-label">{spec.label}</span>
      )}
      <Body {...props} />
      {spec.disabled !== undefined && <span className="ex-reason">{spec.disabled}</span>}
    </div>
  )
}
