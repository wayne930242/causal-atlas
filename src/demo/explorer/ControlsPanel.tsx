import { controlsFor } from './controls.ts'
import { Field } from './editors.tsx'
import { TEXT } from './explorer-text.ts'
import { modelInfo } from './model-info.ts'
import { component } from './registry.ts'
import type { ExplorerState, Theme } from './url-state.ts'
import type { Locale } from '../../engine/index.ts'

export interface ControlsPanelProps {
  readonly state: ExplorerState
  readonly onArg: (key: string, value: unknown) => void
  readonly onLang: (lang: Locale) => void
  readonly onTheme: (theme: Theme) => void
}

export function ControlsPanel({ state, onArg, onLang, onTheme }: ControlsPanelProps) {
  const t = TEXT[state.lang]
  const info = modelInfo(state.source, state.patch)
  const specs = controlsFor(state.component, info, state.args, state.lang)
  const defaults = Object.fromEntries(component(state.component).props.map((p) => [p.name, p.default]))
  return (
    <section className="ex-controls" aria-label={t.controls}>
      <h2 className="ex-h">{t.controls}</h2>
      <fieldset className="ex-page">
        <legend>{t.page}</legend>
        <label className="ex-field">
          <span className="ex-label">{t.language}</span>
          <select className="ex-input" value={state.lang} onChange={(e) => onLang(e.currentTarget.value === 'en' ? 'en' : 'zh-TW')}>
            <option value="zh-TW">中文</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="ex-field">
          <span className="ex-label">{t.theme}</span>
          <select className="ex-input" value={state.theme} onChange={(e) => onTheme(e.currentTarget.value === 'dark' ? 'dark' : 'light')}>
            <option value="light">{t.light}</option>
            <option value="dark">{t.dark}</option>
          </select>
        </label>
      </fieldset>
      {specs.map((spec) => (
        <Field
          key={`${state.component}-${spec.key}`}
          spec={spec}
          value={state.args[spec.key]}
          fallback={defaults[spec.key]}
          text={t}
          onChange={(v) => onArg(spec.key, v)}
        />
      ))}
    </section>
  )
}
