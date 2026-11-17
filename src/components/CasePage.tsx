import { useRef, useState } from 'react'
import { getCase } from '../data/index.ts'
import type { Assignment } from '../engine/index.ts'
import type { Locale } from './i18n.ts'
import { LocaleScope, useMessages } from './i18n.ts'
import { useModel } from './model-state.ts'
import { EquationBox, GraphBox } from './ModelPanel.tsx'
import type { UiNotation } from './notation.ts'
import { Arrow, Progress } from './parts.tsx'
import { Story } from './Story.tsx'
import { Rich } from './typeset.tsx'
import { ProbabilityPanelFor } from './ProbabilityPanel.tsx'
import { Verdicts } from './Verdicts.tsx'
import { intuitionSummary, seeDoPair, shortSources } from './verdict-rows.ts'
import { doText, phraseOf } from './view-model.ts'

export interface CasePageProps {
  /** Notation the equations start in; the reader can still switch. Default 'propositional'. */
  readonly defaultNotation?: UiNotation
  readonly caseId: string
  /** Show the kicker and title. Turn off when the page around it already has them. Default true. */
  readonly heading?: boolean
  /** Start at this step (1–4). Default 1. */
  readonly initialStep?: number
  /** Link in the 補充 box. */
  readonly lessonHref?: string
  readonly lessonLabel?: string
  /** Shown on the last step in place of the next button. */
  readonly next?: { readonly href: string; readonly label: string }
  /** Link in exported images' watermark. Default https://wayneh.tw/causal/. */
  readonly exportUrl?: string
  /** Interface and case language. Default: the surrounding LocaleProvider's, else zh-TW. */
  readonly locale?: Locale
}

const TOTAL = 4

/** Each step opens on the notation that shows its point: logic, then arithmetic under do(), then [X←x]. */
function notationFor(step: number, fixed?: UiNotation): UiNotation {
  if (fixed !== undefined) return fixed
  if (step === 3) return 'arithmetic'
  if (step === 4) return 'causal'
  return 'propositional'
}

/**
 * Direction 1 case page: story → graph → do (or probabilities) → verdicts.
 * Each step adds one thing; 補充 stays closed until asked.
 */
export function CasePage({ locale, ...props }: CasePageProps) {
  return (
    <LocaleScope locale={locale}>
      <CasePageBody {...props} />
    </LocaleScope>
  )
}

function CasePageBody({ caseId, heading = true, initialStep = 1, lessonHref, lessonLabel, next, exportUrl, defaultNotation }: Omit<CasePageProps, 'locale'>) {
  const t = useMessages()
  const c = getCase(caseId)
  const probabilistic = c.context === undefined
  const preset = c.data.showcase[0]
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 1), TOTAL))
  const presetDo: Assignment = !probabilistic && step >= 3 && preset !== undefined ? preset.interventions : {}
  const model = useModel(c, presetDo, notationFor(step, defaultNotation))
  const [witness, setWitness] = useState<Assignment | undefined>(undefined)
  const panelRef = useRef<HTMLDivElement>(null)
  const pair = seeDoPair(c)

  const go = (to: number): void => {
    const target = Math.min(Math.max(to, 1), TOTAL)
    setStep(target)
    setWitness(undefined)
    if (!probabilistic) {
      model.setInterventions(target >= 3 && preset !== undefined ? preset.interventions : {})
      model.setNotation(notationFor(target, defaultNotation))
    }
  }

  const nextLabel = (): string => {
    if (step === 1) return t.next.graph
    if (step === 2) return probabilistic ? t.next.toProbability : t.next.intervene
    return probabilistic ? t.next.compare : t.next.verdicts
  }

  const stepNote = (): string[] => {
    if (step === 3 && !probabilistic) {
      if (preset === undefined) return [t.noteClickToIntervene]
      const ids = t.list(Object.keys(preset.interventions))
      return [t.notePreset(doText(preset.interventions), preset.label[t.locale], ids), t.noteClickOther]
    }
    if (step === 3) return [...t.noteProbability]
    if (step === 4 && probabilistic && pair !== undefined) {
      return [t.noteSee(phraseOf(c.model, t.locale, pair.observe, false)), t.noteDo(doText(pair.intervene))]
    }
    if (step === 4) {
      const summary = intuitionSummary(t, c)
      return summary === undefined ? [t.noteVerdicts] : [t.noteVerdicts, summary]
    }
    return []
  }

  const showWitness = (interventions: Assignment, fixed: Assignment | undefined): void => {
    model.setInterventions(interventions)
    setWitness(fixed)
    panelRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }

  const notes = stepNote()
  const rightEmpty = step === 1
  return (
    <article
      className={`ca-root not-prose ca-case${heading ? '' : ' is-embedded'}`}
      data-case={c.data.id}
      data-step={step}
      lang={t.locale}
    >
      {!heading && (
        <p className="ca-case-caption ca-mono">
          CASE <span aria-hidden="true">·</span> {t.family[c.data.family]} <span aria-hidden="true">·</span>{' '}
          <span className="ca-case-caption-title">{c.data.title[t.locale]}</span>
        </p>
      )}
      {heading && (
        <header className="ca-case-head">
          <p className="ca-kicker ca-mono">
            CASE <span aria-hidden="true">·</span> {t.family[c.data.family]}
          </p>
          <h1 className="ca-h1">{c.data.title[t.locale]}</h1>
          {c.data.subtitle !== undefined && <p className="ca-subtitle">{c.data.subtitle[t.locale]}</p>}
        </header>
      )}
      <p className="ca-sr" aria-live="polite">
        {t.stepOf(step, TOTAL)}
      </p>
      <div className="ca-case-body">
        <div className="ca-case-left">
          <Story c={c} />
          {step >= 2 && (
            <section className="ca-explain" aria-label={t.explanation} data-reveal="explanation">
              <p>
                <Rich text={c.data.explanation[t.locale]} ids={c.model.byId} />
              </p>
            </section>
          )}
          {notes.length > 0 && (
            <section className="ca-stepnote" data-reveal={`step-${step}`}>
              {notes.map((n) => (
                <p key={n}>
                  <Rich text={n} ids={c.model.byId} />
                </p>
              ))}
            </section>
          )}
          <nav className="ca-stepnav" aria-label={t.steps}>
            {step < TOTAL ? (
              <button type="button" className="ca-btn ca-btn-primary" onClick={() => go(step + 1)}>
                {nextLabel()}
                <Arrow />
              </button>
            ) : next !== undefined ? (
              <a className="ca-btn ca-btn-primary" href={next.href}>
                {next.label}
                <Arrow />
              </a>
            ) : (
              <button type="button" className="ca-btn ca-btn-outline" onClick={() => go(1)}>
                {t.startOver}
              </button>
            )}
            <Progress step={step} total={TOTAL} />
            {step > 1 && (
              <button type="button" className="ca-link ca-stepnav-back" onClick={() => go(step - 1)}>
                {t.back}
              </button>
            )}
          </nav>
        </div>
        <div className={`ca-case-right${rightEmpty ? ' is-empty' : ''}`} ref={panelRef}>
          {rightEmpty ? (
            <div className="ca-placeholder" aria-hidden="true">
              <span className="ca-placeholder-mark">{t.placeholder}</span>
            </div>
          ) : probabilistic && step >= 3 ? (
            <ProbabilityPanelFor
              c={c}
              view={step === 4 && pair !== undefined ? 'compare' : 'sliders'}
              pair={pair}
              exportUrl={exportUrl}
            />
          ) : (
            <>
              <GraphBox
                c={c}
                world={model.world}
                interventions={model.interventions}
                onInterventions={
                  step >= 3
                    ? (n) => {
                        setWitness(undefined)
                        model.setInterventions(n)
                      }
                    : undefined
                }
                witness={witness}
                legend
                exportUrl={exportUrl}
              />
              <EquationBox
                c={c}
                world={model.world}
                interventions={model.interventions}
                notation={model.notation}
                onNotation={model.setNotation}
              />
            </>
          )}
        </div>
      </div>
      {step === TOTAL && (
        <section className="ca-case-verdicts" data-reveal="verdicts">
          <Verdicts c={c} onShow={probabilistic ? undefined : showWitness} lessonHref={lessonHref} lessonLabel={lessonLabel} />
        </section>
      )}
      <footer className="ca-sources">
        <span className="ca-muted">{t.sources}</span> {shortSources(t, c)}
      </footer>
    </article>
  )
}
