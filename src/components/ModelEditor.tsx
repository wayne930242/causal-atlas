import type { ChangeEvent } from 'react'
import { useEffect, useId, useMemo, useState } from 'react'
import { caseIds, getCase } from '../data/index.ts'
import type { LoadedCase } from '../data/load.ts'
import { decodeShare, encodeShare, parseModelJson, shareFromHash } from '../data/model-doc.ts'
import type { ModelDoc } from '../data/schema.ts'
import type { Assignment, Value } from '../engine/index.ts'
import { coerceToDomain } from '../engine/index.ts'
import { saveFile } from './download.ts'
import type { Draft, DraftMode, DraftVariable } from './editor/draft.ts'
import { blankDraft, compileDraft, draftFromCase, draftFromDoc, freeCell, newKey, valueTexts } from './editor/draft.ts'
import type { ModelWorld } from './model-state.ts'
import { solve } from './model-state.ts'
import { EquationBox, GraphBox } from './ModelPanel.tsx'
import type { UiNotation } from './notation.ts'
import { Disclosure, Segmented } from './parts.tsx'

export interface ModelEditorProps {
  /** Starting model: a bundled case id or `blank`. Default `rock-throwing`. */
  readonly initial?: string
  /** Where to look for a shared model (`#model=…`); defaults to the page's hash. */
  readonly hash?: string
  /** Builds the share link from the encoded model. Default: this page with `#model=<value>`. */
  readonly shareHref?: (value: string) => string
  /** Link in exported images' watermark. */
  readonly exportUrl?: string
}

const MODES = [
  { value: 'value', label: '確定值' },
  { value: 'probability', label: '機率' },
] as const satisfies readonly { value: DraftMode; label: string }[]

function startDraft(initial: string): Draft {
  if (initial === 'blank' || !caseIds.includes(initial)) return blankDraft()
  return draftFromCase(getCase(initial))
}

/** Interventions that still name a variable of the model with a value in its domain. */
function validInterventions(c: LoadedCase, interventions: Assignment): Assignment {
  const out: Record<string, Value> = {}
  for (const [id, value] of Object.entries(interventions)) {
    const v = c.model.byId.get(id)
    if (v === undefined || v.kind === 'exogenous') continue
    try {
      out[id] = coerceToDomain(v, value)
    } catch {
      // dropped: the domain changed
    }
  }
  return out
}

function priorsFor(v: DraftVariable): number[] {
  const n = valueTexts(v).length
  return v.domain === 'boolean' ? [0.5] : Array.from({ length: n }, () => 1 / Math.max(n, 1))
}

/**
 * Build a structural causal model yourself: variables, equations, context or priors, defaults,
 * layout. Draws it with the same graph and equations as the case pages; shares it by link or JSON.
 */
export function ModelEditor({ initial = 'rock-throwing', hash, shareHref, exportUrl }: ModelEditorProps) {
  const [draft, setDraft] = useState<Draft>(() => startDraft(initial))
  const [interventions, setInterventions] = useState<Assignment>({})
  const [notation, setNotation] = useState<UiNotation>('propositional')
  const [loadErrors, setLoadErrors] = useState<readonly string[]>([])
  const compiled = useMemo(() => compileDraft(draft), [draft])
  // The last model that built: the graph keeps showing it while the draft has errors.
  const [lastGood, setLastGood] = useState<LoadedCase | undefined>(compiled.loaded)
  if (compiled.loaded !== undefined && compiled.loaded !== lastGood) setLastGood(compiled.loaded)
  const shown = compiled.loaded ?? (draft.variables.length === 0 ? undefined : lastGood)
  const uid = useId()

  let world: ModelWorld | undefined
  let runtimeError: string | undefined
  let active: Assignment = {}
  if (shown !== undefined) {
    active = validInterventions(shown, interventions)
    try {
      world = solve(shown, active)
    } catch (error) {
      runtimeError = `算不出來：${(error as Error).message}`
    }
  }

  useEffect(() => {
    const value = shareFromHash(hash ?? (typeof window === 'undefined' ? '' : window.location.hash))
    if (value === undefined) return
    let live = true
    void decodeShare(value).then((result) => {
      if (!live) return
      if (result.ok) {
        setDraft(draftFromDoc(result.doc))
        setInterventions({})
        setLoadErrors([])
      } else setLoadErrors(result.errors)
    })
    return () => {
      live = false
    }
  }, [hash])

  const replace = (next: Draft): void => {
    setDraft(next)
    setInterventions({})
  }
  const update = (patch: Partial<Draft>): void => setDraft((d) => ({ ...d, ...patch }))
  const setVariable = (key: string, patch: Partial<DraftVariable>): void =>
    setDraft((d) => {
      const variables = d.variables.map((v) => (v.key === key ? { ...v, ...patch } : v))
      const v = variables.find((x) => x.key === key)
      if (v === undefined) return d
      const texts = valueTexts(v)
      const context = { ...d.context }
      if (v.kind === 'exogenous' && !texts.includes(context[key] ?? '')) context[key] = texts[0] ?? ''
      const priors = { ...d.priors }
      const want = v.domain === 'boolean' ? 1 : texts.length
      if ((priors[key]?.length ?? 0) !== want) priors[key] = priorsFor(v)
      const layout = { ...d.layout }
      if (v.shown && layout[key] === undefined) layout[key] = freeCell(layout)
      return { ...d, variables, context, priors, layout }
    })
  const addVariable = (): void =>
    setDraft((d) => {
      const ids = new Set(d.variables.map((v) => v.id))
      let n = d.variables.length + 1
      while (ids.has(`V${n}`)) n += 1
      const key = newKey()
      const v: DraftVariable = { key, id: `V${n}`, label: '', kind: 'endogenous', domain: 'boolean', values: '', shown: true }
      return {
        ...d,
        variables: [...d.variables, v],
        equations: { ...d.equations, [key]: '' },
        context: { ...d.context, [key]: '1' },
        priors: { ...d.priors, [key]: [0.5] },
        layout: { ...d.layout, [key]: freeCell(d.layout) },
      }
    })
  const removeVariable = (key: string): void =>
    setDraft((d) => {
      const drop = <T,>(r: Readonly<Record<string, T>>): Record<string, T> => {
        const out = { ...r }
        delete out[key]
        return out
      }
      return {
        ...d,
        variables: d.variables.filter((v) => v.key !== key),
        equations: drop(d.equations),
        context: drop(d.context),
        priors: drop(d.priors),
        normality: drop(d.normality),
        layout: drop(d.layout),
      }
    })
  const move = (id: string, dCol: number, dRow: number): void =>
    setDraft((d) => {
      const v = d.variables.find((x) => x.id === id)
      const at = v === undefined ? undefined : d.layout[v.key]
      if (v === undefined || at === undefined) return d
      return { ...d, layout: { ...d.layout, [v.key]: [at[0] + dCol, at[1] + dRow] } }
    })

  const summary: string[] = []
  const nameOf = (key: string): string => draft.variables.find((v) => v.key === key)?.id ?? key
  for (const [key, msg] of Object.entries(compiled.errors.variables)) summary.push(`變項 ${nameOf(key)}：${msg}`)
  for (const [key, msg] of Object.entries(compiled.errors.equations)) summary.push(`${nameOf(key)} 的式子：${msg}`)
  for (const [key, msg] of Object.entries(compiled.errors.values)) summary.push(`${nameOf(key)}：${msg}`)
  if (compiled.errors.model !== undefined) summary.push(compiled.errors.model)
  if (runtimeError !== undefined) summary.push(runtimeError)

  const exogenous = draft.variables.filter((v) => v.kind === 'exogenous')
  const endogenous = draft.variables.filter((v) => v.kind === 'endogenous')

  return (
    <div className="ca-root not-prose ca-editor">
      <div className="ca-editor-bar">
        <label className="ca-field">
          <span className="ca-field-label">從案例開始</span>
          <select
            aria-label="從案例開始"
            value={draft.from ?? ''}
            onChange={(e) => {
              const id = e.currentTarget.value
              if (id === '') return
              replace(id === 'blank' ? blankDraft() : draftFromCase(getCase(id)))
            }}
          >
            <option value="">選一個案例…</option>
            <option value="blank">空白模型</option>
            {caseIds.map((id) => (
              <option key={id} value={id}>
                {getCase(id).data.title.zh}
              </option>
            ))}
          </select>
        </label>
        <label className="ca-field ca-field-grow">
          <span className="ca-field-label">模型名稱</span>
          <input aria-label="模型名稱" value={draft.title} onChange={(e) => update({ title: e.currentTarget.value })} />
        </label>
      </div>

      {loadErrors.length > 0 && (
        <div className="ca-editor-errors" role="alert">
          <p>分享連結讀不出來：</p>
          <ul>
            {loadErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {summary.length > 0 && (
        <div className="ca-editor-errors" role="alert">
          <p>{shown === undefined ? '模型還不完整：' : '模型有問題，圖上是上一次能算的版本：'}</p>
          <ul>
            {summary.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {shown !== undefined && world !== undefined ? (
        <div className="ca-panel">
          <GraphBox
            c={shown}
            world={world}
            interventions={active}
            onInterventions={setInterventions}
            onMove={move}
            legend
            exportUrl={exportUrl}
          />
          <EquationBox c={shown} world={world} interventions={active} notation={notation} onNotation={setNotation} />
        </div>
      ) : (
        <div className="ca-placeholder ca-editor-empty">
          <span className="ca-muted ca-small">{draft.variables.length === 0 ? '先在「變項」裡加一個變項' : '補上式子，圖就會出現'}</span>
        </div>
      )}
      <p className="ca-hint">點節點可以套上干預；拖曳節點（或選取後按方向鍵）可以調整位置。</p>

      <div className="ca-editor-panels">
        <Disclosure kicker="" title="變項">
          <ul className="ca-editor-vars">
            {draft.variables.map((v, i) => {
              const n = i + 1
              const err = compiled.errors.variables[v.key]
              const errId = `${uid}-var-${v.key}`
              return (
                <li key={v.key} className="ca-editor-var">
                  <input
                    className="ca-mono ca-input-id"
                    aria-label={`第 ${n} 個變項：代號`}
                    aria-invalid={err !== undefined}
                    aria-describedby={err !== undefined ? errId : undefined}
                    value={v.id}
                    onChange={(e) => setVariable(v.key, { id: e.currentTarget.value.trim() })}
                  />
                  <input
                    aria-label={`第 ${n} 個變項：中文名稱`}
                    placeholder="中文名稱"
                    value={v.label}
                    onChange={(e) => setVariable(v.key, { label: e.currentTarget.value })}
                  />
                  <select
                    aria-label={`第 ${n} 個變項：種類`}
                    value={v.kind}
                    onChange={(e) => setVariable(v.key, { kind: e.currentTarget.value as DraftVariable['kind'] })}
                  >
                    <option value="exogenous">外生</option>
                    <option value="endogenous">內生</option>
                  </select>
                  <select
                    aria-label={`第 ${n} 個變項：值域`}
                    value={v.domain}
                    onChange={(e) =>
                      setVariable(v.key, {
                        domain: e.currentTarget.value as DraftVariable['domain'],
                        values: v.values === '' ? 'a, b' : v.values,
                      })
                    }
                  >
                    <option value="boolean">0／1</option>
                    <option value="list">列舉</option>
                  </select>
                  {v.domain === 'list' && (
                    <input
                      className="ca-mono"
                      aria-label={`第 ${n} 個變項：可能的值`}
                      placeholder="例如 one, two"
                      value={v.values}
                      onChange={(e) => setVariable(v.key, { values: e.currentTarget.value })}
                    />
                  )}
                  <label className="ca-check">
                    <input
                      type="checkbox"
                      aria-label={`第 ${n} 個變項：畫在圖上`}
                      checked={v.shown}
                      onChange={(e) => setVariable(v.key, { shown: e.currentTarget.checked })}
                    />
                    畫在圖上
                  </label>
                  <button type="button" className="ca-link" aria-label={`刪除第 ${n} 個變項`} onClick={() => removeVariable(v.key)}>
                    刪除
                  </button>
                  {err !== undefined && (
                    <p className="ca-field-error" id={errId}>
                      {err}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
          <button type="button" className="ca-btn ca-btn-outline" onClick={addVariable}>
            加一個變項
          </button>
        </Disclosure>

        <Disclosure kicker="" title="式子">
          <p className="ca-muted ca-small">
            寫法：<code>and</code>、<code>or</code>、<code>not</code>、<code>if … then … else …</code>，比較用 <code>=</code>，文字值加引號，例如{' '}
            <code>if U then &apos;bright&apos; else &apos;dark&apos;</code>。
          </p>
          {exogenous.length > 0 && (
            <p className="ca-muted ca-small">外生變項沒有式子：{exogenous.map((v) => v.id).join('、')}</p>
          )}
          <ul className="ca-editor-eqs">
            {endogenous.map((v) => {
              const err = compiled.errors.equations[v.key]
              const inCycle = compiled.errors.cycle?.includes(v.id) === true
              const errId = `${uid}-eq-${v.key}`
              return (
                <li key={v.key} className="ca-editor-eq" data-cycle={inCycle ? 'true' : undefined}>
                  <span className="ca-mono ca-editor-eq-lhs">{v.id} =</span>
                  <input
                    className="ca-mono"
                    aria-label={`${v.id} 的式子`}
                    aria-invalid={err !== undefined || inCycle}
                    aria-describedby={err !== undefined ? errId : undefined}
                    value={draft.equations[v.key] ?? ''}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(e) => update({ equations: { ...draft.equations, [v.key]: e.currentTarget.value } })}
                  />
                  {err !== undefined && (
                    <p className="ca-field-error" id={errId}>
                      {err}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
          {compiled.errors.cycle !== undefined && <p className="ca-field-error">{compiled.errors.model}</p>}
        </Disclosure>

        <Disclosure kicker="" title="外生變項的值">
          <Segmented label="外生變項" options={MODES} value={draft.mode} onChange={(mode) => update({ mode })} />
          <p className="ca-muted ca-small">
            {draft.mode === 'value' ? '每個外生變項取一個值，圖上畫出實際世界。' : '每個外生變項給機率，節點裡黑色的高度是等於 1 的機率。'}
          </p>
          <ul className="ca-editor-values">
            {exogenous.map((v) => {
              const texts = valueTexts(v)
              const err = compiled.errors.values[v.key]
              if (draft.mode === 'value') {
                return (
                  <li key={v.key}>
                    <label className="ca-field">
                      <span className="ca-field-label ca-mono">{v.id}</span>
                      <select
                        aria-label={`${v.id} 的值`}
                        value={draft.context[v.key] ?? texts[0]}
                        onChange={(e) => update({ context: { ...draft.context, [v.key]: e.currentTarget.value } })}
                      >
                        {texts.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                    {err !== undefined && <p className="ca-field-error">{err}</p>}
                  </li>
                )
              }
              const ps = draft.priors[v.key] ?? priorsFor(v)
              const targets = v.domain === 'boolean' ? ['1'] : texts
              return (
                <li key={v.key} className="ca-editor-prior">
                  {targets.map((t, i) => (
                    <label key={t} className="ca-field">
                      <span className="ca-field-label ca-mono">
                        P({v.id}={t})
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={v.domain === 'boolean' ? 1 : undefined}
                        step={0.01}
                        aria-label={`P(${v.id}=${t})`}
                        value={ps[i] ?? 0}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                          const next = [...ps]
                          next[i] = Number(e.currentTarget.value)
                          update({ priors: { ...draft.priors, [v.key]: next } })
                        }}
                      />
                    </label>
                  ))}
                  {err !== undefined && <p className="ca-field-error">{err}</p>}
                </li>
              )
            })}
          </ul>
        </Disclosure>

        <Disclosure kicker="" title="常態">
          <p className="ca-muted ca-small">每個變項平常是什麼值。「HP 加上常態」的定義會用到；不設就是沒有預設。</p>
          <ul className="ca-editor-values">
            {draft.variables.map((v) => (
              <li key={v.key}>
                <label className="ca-field">
                  <span className="ca-field-label ca-mono">{v.id}</span>
                  <select
                    aria-label={`${v.id} 的常態值`}
                    value={draft.normality[v.key] ?? ''}
                    onChange={(e) => update({ normality: { ...draft.normality, [v.key]: e.currentTarget.value } })}
                  >
                    <option value="">不設</option>
                    {valueTexts(v).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
          </ul>
        </Disclosure>

        <Disclosure kicker="" title="存檔與分享">
          <SaveShare
            doc={compiled.doc}
            shareHref={shareHref}
            onImport={(doc) => replace(draftFromDoc(doc))}
          />
        </Disclosure>
      </div>
    </div>
  )
}

function defaultHref(value: string): string {
  const { origin, pathname, search } = window.location
  return `${origin}${pathname}${search}#model=${value}`
}

function SaveShare({
  doc,
  shareHref,
  onImport,
}: {
  readonly doc: ModelDoc | undefined
  readonly shareHref?: (value: string) => string
  readonly onImport: (doc: ModelDoc) => void
}) {
  const [link, setLink] = useState<string | undefined>(undefined)
  const [copied, setCopied] = useState(false)
  const [pasted, setPasted] = useState('')
  const [errors, setErrors] = useState<readonly string[]>([])
  const [imported, setImported] = useState(false)

  const share = (): void => {
    if (doc === undefined) return
    setCopied(false)
    void encodeShare(doc).then((value) => setLink((shareHref ?? defaultHref)(value)))
  }
  const importText = (text: string): void => {
    const result = parseModelJson(text)
    setImported(result.ok)
    if (result.ok) {
      setErrors([])
      onImport(result.doc)
    } else setErrors(result.errors)
  }

  return (
    <div className="ca-editor-save">
      {doc === undefined && <p className="ca-muted ca-small">模型有問題，修好之後才能分享或下載。</p>}
      <div className="ca-editor-row">
        <button type="button" className="ca-btn ca-btn-outline" disabled={doc === undefined} onClick={share}>
          產生分享連結
        </button>
        <button
          type="button"
          className="ca-btn ca-btn-outline"
          disabled={doc === undefined}
          onClick={() => doc !== undefined && saveFile('causal-model.json', `${JSON.stringify(doc, null, 2)}\n`, 'application/json')}
        >
          下載 JSON
        </button>
      </div>
      {link !== undefined && (
        <div className="ca-editor-row">
          <input className="ca-mono ca-field-grow" aria-label="分享連結" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          <button
            type="button"
            className="ca-link"
            onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopied(true))}
          >
            {copied ? '已複製' : '複製'}
          </button>
        </div>
      )}
      <div className="ca-editor-import" role="group" aria-label="匯入 JSON">
        <textarea
          className="ca-mono"
          aria-label="貼上 JSON"
          placeholder="貼上模型 JSON，或整個案例檔"
          rows={4}
          value={pasted}
          onChange={(e) => setPasted(e.currentTarget.value)}
        />
        <div className="ca-editor-row">
          <button type="button" className="ca-btn ca-btn-outline" onClick={() => importText(pasted)}>
            匯入
          </button>
          <label className="ca-link">
            選擇 JSON 檔
            <input
              className="ca-sr"
              type="file"
              accept="application/json,.json"
              aria-label="選擇 JSON 檔"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0]
                if (file !== undefined) void file.text().then(importText)
              }}
            />
          </label>
          {imported && errors.length === 0 && <span className="ca-muted ca-small">已匯入</span>}
        </div>
        {errors.length > 0 && (
          <div className="ca-editor-errors" role="alert">
            <p>這份 JSON 不能用：</p>
            <ul>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
