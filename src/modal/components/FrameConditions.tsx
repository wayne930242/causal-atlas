import { useMemo, useState } from 'react'
import { NoIcon, OkIcon } from '../../components/shared/parts.tsx'
import type { RelationCheck } from '../../logic/relations.ts'
import type { FrameCondition, FrameValidity } from '../engine/frames.ts'
import { AXIOMS, CONDITION_AXIOM, FRAME_CONDITIONS, checkCondition, systemsOf, validOnFrame } from '../engine/frames.ts'
import { frameOfDoc } from '../data/load.ts'
import type { FrameDoc, KripkeDoc } from '../data/schema.ts'
import { useModalMessages } from '../i18n/messages.ts'
import { docGraphInput, namesOf, worldNames } from './doc-graph.ts'
import type { ModalCommonProps, ModalModelInput } from './parts.tsx'
import { FormulaMath, ModalProblems, ModalRoot } from './parts.tsx'
import { useModalDoc } from './use-doc.ts'
import { layoutWorldGraph } from './world-graph.ts'
import type { WorldMark } from './WorldGraph.tsx'
import { WorldGraph } from './WorldGraph.tsx'

export interface FrameConditionsProps extends ModalCommonProps {
  /** A `frame` document, or a `kripke` one whose valuation is ignored (JSON text or value). */
  readonly frame: ModalModelInput
  /** The conditions to list, in this order; default serial, reflexive, transitive, symmetric, euclidean. */
  readonly conditions?: readonly FrameCondition[]
  /** Show each condition's axiom and whether it is valid on the frame; default true. */
  readonly axioms?: boolean
  /** Name the systems whose frame class holds the frame; default true. */
  readonly systems?: boolean
  /** The condition picked first; its counterexample is marked in the picture. */
  readonly initial?: FrameCondition
}

/**
 * A frame's conditions beside their axioms: whether R is serial, reflexive, transitive, symmetric and
 * euclidean, each failure with the worlds that break it, and whether D, M, 4, B and 5 are valid on the
 * frame, each failure with the assignment and world that falsify it. The two columns always agree.
 */
export function FrameConditions(props: FrameConditionsProps) {
  return (
    <ModalRoot locale={props.locale} name="frame" caption={props.caption}>
      <FrameBody {...props} />
    </ModalRoot>
  )
}

const KINDS = ['frame', 'kripke'] as const

function FrameBody(props: FrameConditionsProps) {
  const loaded = useModalDoc(props.frame, KINDS)
  if (!loaded.ok) return <ModalProblems problems={loaded.errors} />
  return <FrameLoaded {...props} doc={loaded.doc} />
}

interface Row {
  readonly condition: FrameCondition
  readonly check: RelationCheck
  readonly validity: FrameValidity
}

function FrameLoaded(props: FrameConditionsProps & { readonly doc: FrameDoc | KripkeDoc }) {
  const { doc, notation = 'modern', axioms = true, systems = true } = props
  const t = useModalMessages()
  const conditions = props.conditions ?? FRAME_CONDITIONS
  const frame = useMemo(() => frameOfDoc(doc), [doc])
  const rows: Row[] = useMemo(
    () => conditions.map((condition) => ({ condition, check: checkCondition(frame, condition), validity: validOnFrame(frame, AXIOMS[CONDITION_AXIOM[condition]].formula) })),
    [frame, conditions],
  )
  const [focus, setFocus] = useState<FrameCondition | undefined>(props.initial)
  const names = worldNames(doc, t.locale)
  const layout = useMemo(() => layoutWorldGraph(docGraphInput({ ...doc, kind: 'frame' } as FrameDoc, t.locale, { showFalse: false, notation, mergeSymmetric: true })), [doc, t.locale, notation])
  const focused = rows.find((r) => r.condition === focus)
  const marks = new Map<string, WorldMark>()
  if (focused !== undefined && !focused.check.holds) for (const w of focused.check.witness) marks.set(w, 'counter')
  const name = (id: string) => names.get(id) ?? id
  return (
    <div className="ca-modal-stack">
      <div className="ca-modal-figure">
        <WorldGraph layout={layout} label={t.worldGraph(doc.worlds.length)} marks={marks} worldLabel={(id) => name(id)} />
      </div>
      <div className="ca-modal-side">
        <div className="ca-modal-scroll">
          <table className="ca-modal-table ca-modal-conditions">
            <thead>
              <tr>
                <th scope="col">{t.conditionHeading}</th>
                <th scope="col">{t.holdsHeading}</th>
                {axioms && <th scope="col">{t.axiomHeading}</th>}
                {axioms && <th scope="col">{t.validHeading}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const axiom = AXIOMS[CONDITION_AXIOM[r.condition]]
                return (
                  <tr key={r.condition} data-condition={r.condition} data-selected={r.condition === focus ? 'true' : undefined} data-holds={r.check.holds ? 'true' : 'false'}>
                    <th scope="row">
                      <button type="button" className="ca-modal-pick" aria-pressed={r.condition === focus} onClick={() => setFocus(r.condition === focus ? undefined : r.condition)}>
                        {t.conditionName[r.condition]}
                      </button>
                      <span className="ca-modal-rule ca-small ca-muted">{t.conditionRule[r.condition]}</span>
                    </th>
                    <td>
                      <Verdict ok={r.check.holds} text={r.check.holds ? t.yes : t.conditionWitness(r.condition, namesOf(names, r.check.witness))} />
                    </td>
                    {axioms && (
                      <td>
                        <span className="ca-modal-axiom">{t.axiomName(axiom.name)}</span> <FormulaMath formula={axiom.formula} notation={notation} />
                      </td>
                    )}
                    {axioms && (
                      <td>
                        <Verdict
                          ok={r.validity.valid}
                          text={
                            r.validity.valid
                              ? t.yes
                              : t.axiomCounterexample(
                                  Object.fromEntries(Object.entries(r.validity.counterexample.trueAt).map(([a, ws]) => [a, namesOf(names, ws)])),
                                  name(r.validity.counterexample.world),
                                )
                          }
                        />
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {systems && <p className="ca-modal-systems">{t.systemsLine(systemsOf(frame).map((s) => t.systemName(s)))}</p>}
      </div>
    </div>
  )
}

function Verdict({ ok, text }: { readonly ok: boolean; readonly text: string }) {
  return (
    <span className="ca-modal-verdict" data-ok={ok ? 'true' : 'false'}>
      {ok ? <OkIcon size={16} /> : <NoIcon size={16} />} <span>{text}</span>
    </span>
  )
}
