import { useMemo, useState } from 'react'
import { ModalEvaluator } from '../engine/evaluate.ts'
import type { Formula } from '../engine/formula.ts'
import { F } from '../engine/formula.ts'
import { modelOfDoc, startWorld } from '../data/load.ts'
import type { KripkeDoc } from '../data/schema.ts'
import { modalErrorMessage, useModalMessages } from '../i18n/messages.ts'
import { docGraphInput, namesOf, worldNames } from './doc-graph.ts'
import type { ModalCommonProps, ModalModelInput } from './parts.tsx'
import { AtomLegend, FormulaMath, ModalProblems, ModalRoot, TruthMark } from './parts.tsx'
import { parseAll, unknownAtomProblem, useModalDoc } from './use-doc.ts'
import { layoutWorldGraph } from './world-graph.ts'
import type { WorldMark } from './WorldGraph.tsx'
import { WorldGraph } from './WorldGraph.tsx'

export interface StrictImplicationProps extends ModalCommonProps {
  /** A `kripke` document (JSON text or value). */
  readonly model: ModalModelInput
  readonly antecedent: string
  readonly consequent: string
  /** The world selected first; default the document's `actual`. */
  readonly world?: string
}

/**
 * The material conditional A ⊃ B beside the strict one □(A ⊃ B) on one model: the material one asks
 * only about the selected world, the strict one about every world it sees, and the picture marks the
 * accessible worlds where A is true and B false.
 */
export function StrictImplication(props: StrictImplicationProps) {
  return (
    <ModalRoot locale={props.locale} name="strict" caption={props.caption}>
      <StrictBody {...props} />
    </ModalRoot>
  )
}

const KINDS = ['kripke'] as const

function StrictBody(props: StrictImplicationProps) {
  const t = useModalMessages()
  const loaded = useModalDoc(props.model, KINDS)
  const [a, b] = useMemo(() => parseAll([props.antecedent, props.consequent]), [props.antecedent, props.consequent])
  if (!loaded.ok) return <ModalProblems problems={loaded.errors} />
  for (const f of [a, b]) {
    if (f !== undefined && !f.ok) {
      return (
        <p className="ca-modal-problem" role="alert">
          {modalErrorMessage(f.error, t)}
        </p>
      )
    }
  }
  if (a?.ok !== true || b?.ok !== true) return null
  const missing = unknownAtomProblem([a.formula, b.formula], loaded.doc.atoms.map((x) => x.id))
  if (missing !== undefined) return <ModalProblems problems={[missing]} />
  return <StrictLoaded {...props} doc={loaded.doc} a={a.formula} b={b.formula} />
}

function StrictLoaded(props: StrictImplicationProps & { readonly doc: KripkeDoc; readonly a: Formula; readonly b: Formula }) {
  const { doc, a, b, notation = 'modern' } = props
  const t = useModalMessages()
  const ev = useMemo(() => new ModalEvaluator(modelOfDoc(doc)), [doc])
  const [world, setWorld] = useState(() => (props.world !== undefined && doc.worlds.some((w) => w.id === props.world) ? props.world : startWorld(doc)))
  const names = worldNames(doc, t.locale)
  const name = (id: string) => names.get(id) ?? id
  const layout = useMemo(() => layoutWorldGraph(docGraphInput(doc, t.locale, { showFalse: true, notation, mergeSymmetric: true })), [doc, t.locale, notation])
  const material = F.imp(a, b)
  const strict = F.strict(a, b)
  let seen: readonly string[] = []
  let problem: string | undefined
  try {
    seen = ev.accessible(world)
  } catch (error) {
    problem = modalErrorMessage(error, t)
  }
  const bad = seen.filter((v) => ev.holds(a, v) && !ev.holds(b, v))
  const marks = new Map<string, WorldMark>(seen.map((v) => [v, bad.includes(v) ? 'counter' : 'true']))
  const materialValue = ev.holds(material, world)
  const strictValue = bad.length === 0
  return (
    <div className="ca-modal-split">
      <div className="ca-modal-figure">
        <WorldGraph
          layout={layout}
          label={t.worldGraph(doc.worlds.length)}
          selected={world}
          marks={marks}
          worldLabel={(id) => `${t.selectWorld(name(id))}. ${t.worldState(name(id), doc.worlds.find((w) => w.id === id)?.true ?? [])}`}
          onSelect={setWorld}
        />
      </div>
      <div className="ca-modal-side">
        <p className="ca-modal-at ca-h3">{t.at(name(world))}</p>
        <dl className="ca-modal-pair">
          <div data-kind="material">
            <dt>{t.materialHeading}</dt>
            <dd>
              <FormulaMath formula={material} notation={notation} /> <TruthMark value={materialValue} />
              <p className="ca-small">{materialValue ? t.materialTrue(name(world), !ev.holds(a, world)) : t.materialFalse(name(world))}</p>
            </dd>
          </div>
          <div data-kind="strict">
            <dt>{t.strictHeading}</dt>
            <dd>
              <FormulaMath formula={strict} notation={notation} /> <TruthMark value={strictValue} />
              <p className="ca-small">{strictValue ? t.strictTrue(name(world)) : t.strictFalse(name(world), namesOf(names, bad))}</p>
            </dd>
          </div>
        </dl>
        {problem !== undefined && (
          <p className="ca-modal-problem" role="alert">
            {problem}
          </p>
        )}
        <div className="ca-modal-scroll">
          <table className="ca-modal-table">
            <thead>
              <tr>
                <th scope="col">{t.world}</th>
                <th scope="col">
                  <FormulaMath formula={a} notation={notation} />
                </th>
                <th scope="col">
                  <FormulaMath formula={b} notation={notation} />
                </th>
                <th scope="col">
                  <FormulaMath formula={material} notation={notation} />
                </th>
              </tr>
            </thead>
            <tbody>
              {doc.worlds.map((w) => (
                <tr key={w.id} data-selected={w.id === world ? 'true' : undefined} data-seen={seen.includes(w.id) ? 'true' : undefined}>
                  <th scope="row">{name(w.id)}</th>
                  <td>
                    <TruthMark value={ev.holds(a, w.id)} />
                  </td>
                  <td>
                    <TruthMark value={ev.holds(b, w.id)} />
                  </td>
                  <td>
                    <TruthMark value={ev.holds(material, w.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AtomLegend atoms={doc.atoms} />
      </div>
    </div>
  )
}
