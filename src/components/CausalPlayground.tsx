import { getCase } from '../data/index.ts'
import type { Assignment } from '../engine/index.ts'
import type { Locale } from './i18n.ts'
import { LocaleScope, useMessages } from './i18n.ts'
import { useModel } from './model-state.ts'
import { EquationBox, GraphBox } from './ModelPanel.tsx'
import { assignmentText } from './view-model.ts'

export interface CausalPlaygroundProps {
  /** A bundled case id, e.g. `rock-throwing`. */
  readonly caseId: string
  /** do() applied at the start. */
  readonly initialInterventions?: Assignment
  /** Show the case's preset interventions as buttons. Default true. */
  readonly presets?: boolean
  /** Link in exported images' watermark. Default https://wayneh.tw/causal/. */
  readonly exportUrl?: string
  /** Interface language. Default: the surrounding LocaleProvider's, else zh-TW. */
  readonly locale?: Locale
}

/** One case's graph and equations; click a node to set or release do() on it. */
export function CausalPlayground({ locale, ...props }: CausalPlaygroundProps) {
  return (
    <LocaleScope locale={locale}>
      <PlaygroundBody {...props} />
    </LocaleScope>
  )
}

function PlaygroundBody({ caseId, initialInterventions, presets = true, exportUrl }: Omit<CausalPlaygroundProps, 'locale'>) {
  const t = useMessages()
  const c = getCase(caseId)
  const { interventions, setInterventions, notation, setNotation, world } = useModel(c, initialInterventions)
  return (
    <div className="ca-root not-prose ca-playground" data-case={c.data.id} lang={t.locale}>
      <div className="ca-panel">
        <GraphBox c={c} world={world} interventions={interventions} onInterventions={setInterventions} legend exportUrl={exportUrl} />
        <EquationBox c={c} world={world} interventions={interventions} notation={notation} onNotation={setNotation} />
      </div>
      <div className="ca-playground-foot">
        <p className="ca-hint">{t.playgroundHint}</p>
        {presets && c.data.showcase.length > 0 && (
          <div className="ca-presets" role="group" aria-label={t.presets}>
            {c.data.showcase.map((s) => (
              <button
                key={s.label['zh-TW']}
                type="button"
                className="ca-btn ca-btn-outline"
                aria-pressed={assignmentText(s.interventions) === assignmentText(interventions)}
                onClick={() => setInterventions(s.interventions)}
              >
                {s.label[t.locale]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
