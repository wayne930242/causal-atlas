import { useState } from 'react'
import type { LoadedCase } from '../data/load.ts'
import { formatValue } from '../engine/index.ts'
import { textIn } from './editor/catalog.ts'
import type { EditorTask, TaskCheck, TaskTheory } from './editor/tasks.ts'
import { TASK_THEORIES, checkTask, guessRight } from './editor/tasks.ts'
import { useMessages } from './i18n.ts'
import { Rich } from './typeset.tsx'

/** One editor task: the question, 從它開始, the guesses, 檢查 and what it found. */
export function TaskCard({
  n,
  task,
  model,
  onStart,
}: {
  readonly n: number
  readonly task: EditorTask
  /** The edited model, when the draft builds. */
  readonly model?: LoadedCase
  readonly onStart: () => void
}) {
  const t = useMessages()
  const k = t.editor.task
  const [guess, setGuess] = useState<ReadonlySet<TaskTheory>>(new Set())
  const [result, setResult] = useState<TaskCheck | 'broken' | undefined>(undefined)
  const ids = model?.model.byId ?? new Map()
  const check = (): void => {
    if (model === undefined) {
      setResult('broken')
      return
    }
    try {
      setResult(checkTask(model, task))
    } catch {
      setResult('broken')
    }
  }
  const toggle = (th: TaskTheory): void =>
    setGuess((now) => {
      const next = new Set(now)
      if (next.has(th)) next.delete(th)
      else next.add(th)
      return next
    })
  let found = ''
  let verdictLine: string | undefined
  if (result === 'broken') found = k.broken
  else if (result !== undefined && !result.ok) {
    found =
      'missing' in result
        ? k.missing(result.missing)
        : k.counter(
            t.list(Object.entries(result.at).map(([id, v]) => `${id}=${formatValue(v)}`)),
            result.id,
            formatValue(result.yours),
            formatValue(result.goal),
          )
  } else if (result !== undefined) {
    found = k.same(t.list(result.ids))
    const verdicts = result.verdicts
    if (verdicts !== undefined && task.predict !== undefined) {
      const right = TASK_THEORIES.filter((th) => guessRight(verdicts[th], guess.has(th))).length
      found += k.score(right, TASK_THEORIES.length)
      verdictLine = TASK_THEORIES.map((th) => `${t.theory[th]} ${t.verdict[verdicts[th]]} ${guessRight(verdicts[th], guess.has(th)) ? '✓' : '✗'}`).join(t.utilitySep)
    }
  }
  return (
    <section className="ca-editor-task" aria-label={k.label(n)} data-task={task.id} data-result={result === undefined ? undefined : result !== 'broken' && result.ok ? 'pass' : 'fail'}>
      <p className="ca-editor-task-title">
        <strong>{k.label(n)}</strong> {textIn(task.title, t.locale)}
      </p>
      <p className="ca-small">
        <Rich text={textIn(task.prompt, t.locale)} ids={ids} />{' '}
        <button type="button" className="ca-link" onClick={onStart}>
          {k.start}
        </button>
      </p>
      {task.predict !== undefined && (
        <div className="ca-editor-task-guess" role="group" aria-label={k.guess(task.predict.cause, task.predict.effect)}>
          <span className="ca-muted ca-small">
            <Rich text={k.guess(task.predict.cause, task.predict.effect)} ids={ids} />
          </span>
          {TASK_THEORIES.map((th) => (
            <button key={th} type="button" className="ca-editor-chip" aria-pressed={guess.has(th)} onClick={() => toggle(th)}>
              {t.theory[th]}
            </button>
          ))}
        </div>
      )}
      <div className="ca-editor-row">
        <button type="button" className="ca-btn ca-btn-outline" onClick={check}>
          {k.check}
        </button>
      </div>
      {found !== '' && (
        <p className={`ca-editor-task-found ${result !== 'broken' && result?.ok === true ? 'ca-adj-ok' : 'ca-adj-no'}`} role="status">
          <Rich text={found} ids={ids} />
        </p>
      )}
      {verdictLine !== undefined && (
        <p className="ca-small">
          <Rich text={verdictLine} ids={ids} />
        </p>
      )}
    </section>
  )
}
