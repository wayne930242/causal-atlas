import { useRef, useState } from 'react'
import { getCase } from '../data/index.ts'
import type { LoadedCase } from '../data/load.ts'
import type { Assignment } from '../engine/index.ts'
import { useModel } from './model-state.ts'
import { EquationBox, GraphBox } from './ModelPanel.tsx'
import type { UiNotation } from './notation.ts'
import { Arrow, Progress } from './parts.tsx'
import { ProbabilityPanelFor } from './ProbabilityPanel.tsx'
import { Verdicts } from './Verdicts.tsx'
import { intuitionSummary, seeDoPair, shortSources } from './verdict-rows.ts'
import { doText, label } from './view-model.ts'

export interface CasePageProps {
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
}

const FAMILY: Record<LoadedCase['data']['family'], string> = {
  actual: '實際因果',
  omission: '不作為',
  norms: '常態與規範',
  law: '法律',
  decision: '因果決策',
}

const TOTAL = 4

interface StorySentence {
  readonly text: string
  readonly tags: readonly string[]
}

/** The story in paragraphs of two sentences; a sentence named in story_tags carries its variable ids. */
function storyParagraphs(c: LoadedCase): StorySentence[][] {
  const tags = c.data.story_tags ?? []
  return c.data.story_zh
    .split(/(?<=[。？！])/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .reduce<StorySentence[][]>((paras, text, i) => {
      const own = tags.filter((t) => text.includes(t.sentence.trim())).flatMap((t) => t.variables)
      const sentence = { text, tags: [...new Set(own)] }
      if (i % 2 === 0) paras.push([sentence])
      else paras[paras.length - 1].push(sentence)
      return paras
    }, [])
}

/** Each step opens on the notation that shows its point: logic, then arithmetic under do(), then [X←x]. */
function notationFor(step: number): UiNotation {
  if (step === 3) return 'arithmetic'
  if (step === 4) return 'causal'
  return 'propositional'
}

/**
 * Direction 1 case page: story → graph → do (or probabilities) → verdicts.
 * Each step adds one thing; 補充 stays closed until asked.
 */
export function CasePage({ caseId, heading = true, initialStep = 1, lessonHref, lessonLabel, next, exportUrl }: CasePageProps) {
  const c = getCase(caseId)
  const probabilistic = c.context === undefined
  const preset = c.data.showcase[0]
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 1), TOTAL))
  const presetDo: Assignment = !probabilistic && step >= 3 && preset !== undefined ? preset.interventions : {}
  const model = useModel(c, presetDo, notationFor(step))
  const [witness, setWitness] = useState<Assignment | undefined>(undefined)
  const panelRef = useRef<HTMLDivElement>(null)
  const pair = seeDoPair(c)

  const go = (to: number): void => {
    const target = Math.min(Math.max(to, 1), TOTAL)
    setStep(target)
    setWitness(undefined)
    if (!probabilistic) {
      model.setInterventions(target >= 3 && preset !== undefined ? preset.interventions : {})
      model.setNotation(notationFor(target))
    }
  }

  const nextLabel = (): string => {
    if (step === 1) return '畫成圖'
    if (step === 2) return probabilistic ? '把 0／1 改成機率' : '動手改一條式子'
    return probabilistic ? '比較觀察和動手' : '看各定義怎麼判'
  }

  const stepNote = (): string[] => {
    if (step === 3 && !probabilistic) {
      if (preset === undefined) return ['點圖上的節點，套上干預，看其他變項怎麼重算。']
      const ids = Object.keys(preset.interventions).join('、')
      return [
        `現在套上 ${doText(preset.interventions)}（${preset.label.zh}）：${ids} 的式子換成常數，其餘照式子重算。`,
        '點圖上的節點，可以改別的變項。',
      ]
    }
    if (step === 3) {
      return [
        '外生變項原本只取 0 或 1。這一步把它們改成機率 p。',
        '節點裡填色的高度，是這個變項等於 1 的機率。',
        '拉滑桿，圖上的數字會跟著變。',
      ]
    }
    if (step === 4 && probabilistic && pair !== undefined) {
      const obs = /^\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(pair.observe)?.[1] ?? ''
      return [
        `左邊是看到 ${pair.observe}（${label(c.model, obs)}）之後的機率。`,
        `右邊是動手設定 ${doText(pair.intervene)} 之後的機率。`,
      ]
    }
    if (step === 4) {
      const summary = intuitionSummary(c)
      return summary === undefined ? ['下面列出各個標準的判定，一個標準一列。'] : ['下面列出各個標準的判定，一個標準一列。', summary]
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
    <article className="ca-root not-prose ca-case" data-case={c.data.id} data-step={step}>
      {heading && (
        <header className="ca-case-head">
          <p className="ca-kicker ca-mono">
            CASE <span aria-hidden="true">·</span> {FAMILY[c.data.family]}
          </p>
          <h1 className="ca-h1">{c.data.title.zh}</h1>
          {c.data.subtitle !== undefined && <p className="ca-subtitle">{c.data.subtitle}</p>}
        </header>
      )}
      <p className="ca-sr" aria-live="polite">
        第 {step} 步，共 {TOTAL} 步
      </p>
      <div className="ca-case-body">
        <div className="ca-case-left">
          <section className="ca-story" aria-label="故事">
            {storyParagraphs(c).map((p, i) => (
              <p key={i}>
                {p.map((s) => (
                  <span key={s.text} className="ca-story-sentence">
                    {s.text}
                    {s.tags.length > 0 && (
                      <span className="ca-story-tags" aria-label={`對應變項 ${s.tags.join('、')}`}>
                        {s.tags.map((id) => (
                          <span key={id} className="ca-story-tag ca-mono" aria-hidden="true">
                            {id}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                ))}
              </p>
            ))}
          </section>
          {step >= 2 && (
            <section className="ca-explain" aria-label="模型記了什麼" data-reveal="explanation">
              <p>{c.data.explanation_zh}</p>
            </section>
          )}
          {notes.length > 0 && (
            <section className="ca-stepnote" data-reveal={`step-${step}`}>
              {notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </section>
          )}
          <nav className="ca-stepnav" aria-label="步驟">
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
                從頭再看
              </button>
            )}
            <Progress step={step} total={TOTAL} />
            {step > 1 && (
              <button type="button" className="ca-link ca-stepnav-back" onClick={() => go(step - 1)}>
                上一步
              </button>
            )}
          </nav>
        </div>
        <div className={`ca-case-right${rightEmpty ? ' is-empty' : ''}`} ref={panelRef}>
          {rightEmpty ? (
            <div className="ca-placeholder" aria-hidden="true">
              <span className="ca-muted ca-small">下一步把故事畫成圖</span>
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
        <span className="ca-muted">來源</span> {shortSources(c)}
      </footer>
    </article>
  )
}
