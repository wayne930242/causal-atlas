import { useId, useMemo, useState } from 'react'
import type { ModalProblem } from '../engine/errors.ts'
import { modalProblem } from '../engine/errors.ts'
import { ModalEvaluator } from '../engine/evaluate.ts'
import { kripkeModel } from '../engine/model.ts'
import type { Formula } from '../engine/formula.ts'
import type { ModalNotation } from '../engine/print.ts'
import { formulaText } from '../engine/print.ts'
import { distances } from '../engine/similarity.ts'
import type { AtomValues } from '../engine/surgery.ts'
import { literalsOf, surgery, worldWith } from '../engine/surgery.ts'
import { modelOfDoc, similarityOf, structuralEquations } from '../data/load.ts'
import type { SpheresDoc } from '../data/schema.ts'
import type { ModalMessages } from '../i18n/messages.ts'
import { modalErrorMessage, useModalMessages } from '../i18n/messages.ts'
import { namesOf, worldNames } from './doc-graph.ts'
import type { ModalCommonProps, ModalModelInput } from './parts.tsx'
import { AtomLegend, FormulaMath, ModalProblems, ModalRoot, TruthMark } from './parts.tsx'
import { layoutSpheres } from './sphere-graph.ts'
import { counterfactualView, sphereWorlds } from './sphere-view-model.ts'
import { SphereDiagram } from './SphereDiagram.tsx'
import { parseAll, unknownAtomProblem, useModalDoc } from './use-doc.ts'

export interface SurgeryVsSimilarityProps extends ModalCommonProps {
  /** A `spheres` document with `center`, `similarity` and `structural` equations (JSON text or value). */
  readonly model: ModalModelInput
  /** The antecedent, a conjunction of atoms and negated atoms (`press`); default that of the document's first A > B. */
  readonly antecedent?: string
  /** The consequent; default that of the document's first A > B. */
  readonly consequent?: string
  /** Weights to start from, overriding the document's. */
  readonly weights?: Readonly<Record<string, number>>
}

/**
 * Fine's Nixon example: on the left Lewis's closest antecedent worlds by a weighted similarity the
 * reader can adjust, on the right Pearl's minimal surgery on the boolean structural equations. Move the
 * weights to see when the two verdicts on A > B part.
 */
export function SurgeryVsSimilarity(props: SurgeryVsSimilarityProps) {
  return (
    <ModalRoot locale={props.locale} name="surgery" caption={props.caption}>
      <SurgeryBody {...props} />
    </ModalRoot>
  )
}

const KINDS = ['spheres'] as const

function firstConditional(doc: SpheresDoc): { a?: string; b?: string } {
  for (const p of parseAll(doc.formulas ?? [])) {
    if (p.ok && p.formula.kind === 'cf') return { a: formulaText(p.formula.left, 'ascii'), b: formulaText(p.formula.right, 'ascii') }
  }
  return {}
}

function SurgeryBody(props: SurgeryVsSimilarityProps) {
  const t = useModalMessages()
  const loaded = useModalDoc(props.model, KINDS)
  const doc = loaded.ok ? loaded.doc : undefined
  const sources = useMemo(() => {
    const fallback = doc === undefined ? {} : firstConditional(doc)
    return [props.antecedent ?? fallback.a ?? '', props.consequent ?? fallback.b ?? '']
  }, [doc, props.antecedent, props.consequent])
  const [a, b] = useMemo(() => parseAll(sources), [sources])
  if (!loaded.ok) return <ModalProblems problems={loaded.errors} />
  if (loaded.doc.center === undefined || loaded.doc.similarity === undefined || loaded.doc.structural === undefined) return <ModalProblems problems={[modalProblem('needs-similarity', {})]} />
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
  const atoms = loaded.doc.atoms.map((x) => x.id)
  const intervention = literalsOf(a.formula)
  const problems: ModalProblem[] = []
  const missing = unknownAtomProblem([a.formula, b.formula], atoms)
  if (missing !== undefined) problems.push(missing)
  if (intervention === undefined) problems.push(modalProblem('surgery-antecedent', { formula: formulaText(a.formula, props.notation ?? 'modern') }))
  if (problems.length > 0 || intervention === undefined) return <ModalProblems problems={problems} />
  return <SurgeryLoaded {...props} doc={loaded.doc} center={loaded.doc.center} a={a.formula} b={b.formula} intervention={intervention} />
}

function SurgeryLoaded(props: SurgeryVsSimilarityProps & { readonly doc: SpheresDoc; readonly center: string; readonly a: Formula; readonly b: Formula; readonly intervention: AtomValues }) {
  const { doc, center, a, b, intervention, notation = 'modern' } = props
  const t = useModalMessages()
  const atoms = doc.atoms.map((x) => x.id)
  const [weights, setWeights] = useState<Readonly<Record<string, number>>>(() => Object.fromEntries(atoms.map((x) => [x, props.weights?.[x] ?? doc.similarity?.weights[x] ?? 1])))
  const [costs, setCosts] = useState<readonly number[]>(() => (doc.similarity?.laws ?? []).map((l) => l.cost))
  const docWithCosts = useMemo(
    () => ({ ...doc, similarity: { weights, laws: (doc.similarity?.laws ?? []).map((l, i) => ({ ...l, cost: costs[i] ?? l.cost })) } }),
    [doc, weights, costs],
  )
  const model = useMemo(() => modelOfDoc(docWithCosts), [docWithCosts])
  const names = worldNames(doc, t.locale)
  const name = (id: string) => names.get(id) ?? id
  const layout = useMemo(() => layoutSpheres(model.spheres?.[center] ?? [], center, sphereWorlds(doc, t.locale)), [model, center, doc, t.locale])
  const view = counterfactualView(model, a, b, center, 'lewis')
  const ds = useMemo(() => [...distances(model, center, similarityOf(docWithCosts))].sort((x, y) => x.distance - y.distance), [model, center, docWithCosts])
  const equations = useMemo(() => structuralEquations(doc), [doc])
  const solved = surgery(atoms, equations, doc.worlds.find((w) => w.id === center)?.true ?? [], intervention)
  const solvedWorld = worldWith(doc.worlds, atoms, solved.values)
  // The consequent in the submodel's one solution.
  const surgeryValue = new ModalEvaluator(kripkeModel({ atoms, worlds: [{ id: 'solution', true: atoms.filter((x) => solved.values[x]) }], access: [] })).holds(b, 'solution')
  return (
    <>
      <div className="ca-modal-columns">
        <section className="ca-modal-column" data-kind="similarity">
          <h3 className="ca-modal-column-head">{t.similarityHeading}</h3>
          <SphereDiagram
            layout={layout}
            label={t.worldGraph(doc.worlds.length)}
            center={center}
            marks={view.marks}
            sphere={view.step.sphere}
            sphereName={t.sphereName}
            worldLabel={(id) => t.worldState(name(id), doc.worlds.find((w) => w.id === id)?.true ?? [])}
          />
          <p>
            <FormulaMath formula={{ kind: 'cf', left: a, right: b }} notation={notation} /> <TruthMark value={view.step.value} />
          </p>
          <p className="ca-small">{view.step.vacuous ? t.vacuous : t.closestList(namesOf(names, view.step.selected))}</p>
          <Weights atoms={atoms} weights={weights} costs={costs} doc={doc} notation={notation} onWeight={(x, v) => setWeights((w) => ({ ...w, [x]: v }))} onCost={(i, v) => setCosts((c) => c.map((old, k) => (k === i ? v : old)))} t={t} />
          <table className="ca-modal-table ca-small">
            <thead>
              <tr>
                <th scope="col">{t.world}</th>
                <th scope="col">{t.distance}</th>
              </tr>
            </thead>
            <tbody>
              {ds.map((d) => (
                <tr key={d.world} data-selected={view.step.selected.includes(d.world) ? 'true' : undefined}>
                  <th scope="row">{name(d.world)}</th>
                  <td className="ca-mono">{d.distance}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="ca-small ca-muted">{t.approxNote}</p>
        </section>
        <section className="ca-modal-column" data-kind="surgery">
          <h3 className="ca-modal-column-head">{t.surgeryHeading}</h3>
          <h4 className="ca-small">{t.equationsHeading}</h4>
          <ul className="ca-modal-equations">
            {Object.entries(equations).map(([atom, f]) => (
              <li key={atom}>
                <span className="ca-mono">{atom}</span> := <FormulaMath formula={f} notation={notation} />
              </li>
            ))}
          </ul>
          <p className="ca-small">{t.intervention(Object.entries(intervention).map(([x, v]) => `${x} = ${v ? 'T' : 'F'}`).join(', '))}</p>
          <h4 className="ca-small">{t.solution}</h4>
          <ul className="ca-modal-solution">
            {atoms.map((x) => (
              <li key={x} data-set={solved.set.includes(x) ? 'true' : undefined}>
                <span className="ca-mono">{x}</span> <TruthMark value={solved.values[x] === true} />
              </li>
            ))}
          </ul>
          <p className="ca-small">{t.solutionWorld(solvedWorld === undefined ? undefined : name(solvedWorld))}</p>
          <p>
            <FormulaMath formula={b} notation={notation} /> <TruthMark value={surgeryValue} />
          </p>
        </section>
      </div>
      <p className="ca-modal-agree" data-agree={surgeryValue === view.step.value ? 'true' : 'false'} aria-live="polite">
        {surgeryValue === view.step.value ? t.agree : t.diverge}
      </p>
      <AtomLegend atoms={doc.atoms} />
    </>
  )
}

function Weights(props: {
  readonly atoms: readonly string[]
  readonly weights: Readonly<Record<string, number>>
  readonly costs: readonly number[]
  readonly doc: SpheresDoc
  readonly notation: Exclude<ModalNotation, 'ascii'>
  readonly onWeight: (atom: string, value: number) => void
  readonly onCost: (law: number, value: number) => void
  readonly t: ModalMessages
}) {
  const { atoms, weights, costs, doc, notation, onWeight, onCost, t } = props
  const base = useId()
  const laws = parseAll((doc.similarity?.laws ?? []).map((l) => l.formula))
  return (
    <fieldset className="ca-modal-weights">
      <legend>{t.weightsHeading}</legend>
      {atoms.map((x) => (
        <Slider key={x} id={`${base}-w-${x}`} label={t.weightLabel(x)} value={weights[x] ?? 1} onChange={(v) => onWeight(x, v)} />
      ))}
      {laws.map((law, i) => (
        <Slider key={i} id={`${base}-l-${i}`} label={t.lawLabel(law.ok ? formulaText(law.formula, notation) : law.source)} value={costs[i] ?? 1} onChange={(v) => onCost(i, v)} />
      ))}
    </fieldset>
  )
}

function Slider({ id, label, value, onChange }: { readonly id: string; readonly label: string; readonly value: number; readonly onChange: (v: number) => void }) {
  return (
    <div className="ca-modal-slider">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min={0} max={12} step={0.5} value={value} onChange={(e) => onChange(Number(e.currentTarget.value))} />
      <output htmlFor={id} className="ca-mono">
        {value}
      </output>
    </div>
  )
}
