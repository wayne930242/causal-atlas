import { useMemo, useState } from 'react'
import type { Formula } from '../engine/formula.ts'
import type { Inference, InferenceAt, TcsPattern } from '../engine/inference.ts'
import { checkInferenceAt, tcsInference } from '../engine/inference.ts'
import type { ModalModel } from '../engine/model.ts'
import { collapseSpheres } from '../engine/model.ts'
import type { ModalNotation } from '../engine/print.ts'
import { modalText, modelOfDoc, startWorld } from '../data/load.ts'
import type { ModalText, SpheresDoc } from '../data/schema.ts'
import type { ModalMessages } from '../i18n/messages.ts'
import { modalErrorMessage, useModalMessages } from '../i18n/messages.ts'
import { worldNames } from './doc-graph.ts'
import type { ModalCommonProps, ModalModelInput } from './parts.tsx'
import { AtomLegend, FormulaMath, ModalProblems, ModalRoot, TruthMark } from './parts.tsx'
import { layoutSpheres } from './sphere-graph.ts'
import { sphereWorlds } from './sphere-view-model.ts'
import { SphereDiagram } from './SphereDiagram.tsx'
import { parseAll, unknownAtomProblem, useModalDoc } from './use-doc.ts'

/** One inference to check: its pattern, the spheres model and the formulas A, B (and C for transitivity and strengthening). */
export interface TcsItem {
  readonly pattern: TcsPattern
  readonly model: ModalModelInput
  readonly a: string
  readonly b: string
  readonly c?: string
  /** A heading for the example; default the document's title. */
  readonly title?: ModalText
}

export interface TcsCheckProps extends ModalCommonProps {
  readonly items: readonly TcsItem[]
  /** Show the strict-implication column; default true. */
  readonly showStrict?: boolean
  /** Start with the spheres pressed into one; default false. */
  readonly collapsed?: boolean
}

/**
 * Transitivity, contraposition and strengthening the antecedent, each on its own spheres model:
 * with strict implication the inference holds; with the counterfactual on spheres a counterexample
 * appears at the centre. Pressing the spheres into one makes the counterfactual strict, and the
 * counterexample goes away.
 */
export function TcsCheck(props: TcsCheckProps) {
  return (
    <ModalRoot locale={props.locale} name="tcs" caption={props.caption}>
      <TcsBody {...props} />
    </ModalRoot>
  )
}

function TcsBody({ items, showStrict = true, collapsed: initial = false, notation = 'modern' }: TcsCheckProps) {
  const t = useModalMessages()
  const [collapsed, setCollapsed] = useState(initial)
  return (
    <>
      <label className="ca-modal-check">
        <input type="checkbox" checked={collapsed} onChange={(e) => setCollapsed(e.currentTarget.checked)} /> {t.collapse}
      </label>
      <p className="ca-small ca-muted">{t.collapseHint}</p>
      <div className="ca-modal-cards">
        {items.map((item, i) => (
          <TcsCard key={`${item.pattern}-${i}`} item={item} showStrict={showStrict} collapsed={collapsed} notation={notation} />
        ))}
      </div>
    </>
  )
}

const KINDS = ['spheres'] as const

function TcsCard({ item, showStrict, collapsed, notation }: { readonly item: TcsItem; readonly showStrict: boolean; readonly collapsed: boolean; readonly notation: Exclude<ModalNotation, 'ascii'> }) {
  const t = useModalMessages()
  const loaded = useModalDoc(item.model, KINDS)
  const parsed = useMemo(() => parseAll(item.c === undefined ? [item.a, item.b] : [item.a, item.b, item.c]), [item.a, item.b, item.c])
  const title = modalText(item.title ?? (loaded.ok ? loaded.doc.title : undefined), t.locale)
  const heading = <h3 className="ca-h3">{title === undefined ? t.patternName[item.pattern] : t.exampleTitle(t.patternName[item.pattern], title)}</h3>
  if (!loaded.ok) {
    return (
      <section className="ca-modal-card" data-pattern={item.pattern}>
        {heading}
        <ModalProblems problems={loaded.errors} />
      </section>
    )
  }
  const bad = parsed.find((p) => !p.ok)
  if (bad !== undefined && !bad.ok) {
    return (
      <section className="ca-modal-card" data-pattern={item.pattern}>
        {heading}
        <p className="ca-modal-problem" role="alert">
          {modalErrorMessage(bad.error, t)}
        </p>
      </section>
    )
  }
  const [a, b, c] = parsed.map((p) => (p.ok ? p.formula : undefined)) as [Formula, Formula, Formula | undefined]
  const missing = unknownAtomProblem([a, b, ...(c === undefined ? [] : [c])], loaded.doc.atoms.map((x) => x.id))
  return (
    <section className="ca-modal-card" data-pattern={item.pattern}>
      {heading}
      {missing !== undefined ? <ModalProblems problems={[missing]} /> : <TcsColumns doc={loaded.doc} pattern={item.pattern} a={a} b={b} c={c} showStrict={showStrict} collapsed={collapsed} notation={notation} t={t} />}
    </section>
  )
}

function TcsColumns(props: {
  readonly doc: SpheresDoc
  readonly pattern: TcsPattern
  readonly a: Formula
  readonly b: Formula
  readonly c: Formula | undefined
  readonly showStrict: boolean
  readonly collapsed: boolean
  readonly notation: Exclude<ModalNotation, 'ascii'>
  readonly t: ModalMessages
}) {
  const { doc, pattern, a, b, c, showStrict, collapsed, notation, t } = props
  const model = useMemo(() => modelOfDoc(doc), [doc])
  const flat = useMemo(() => collapseSpheres(model), [model])
  const world = startWorld(doc)
  const shown: ModalModel = collapsed ? flat : model
  const layout = useMemo(() => layoutSpheres(shown.spheres?.[world] ?? [], world, sphereWorlds(doc, t.locale)), [shown, world, doc, t.locale])
  const names = worldNames(doc, t.locale)
  const strict = tcsInference(pattern, 'strict', a, b, c)
  const cf = tcsInference(pattern, 'counterfactual', a, b, c)
  return (
    <>
      <SphereDiagram layout={layout} label={t.worldGraph(doc.worlds.length)} center={world} sphereName={t.sphereName} worldLabel={(id) => t.worldState(names.get(id) ?? id, doc.worlds.find((w) => w.id === id)?.true ?? [])} />
      <div className="ca-modal-columns">
        {showStrict && <InferenceColumn heading={t.strictHeading} kind="strict" inference={strict} at={checkInferenceAt(flat, strict, world)} world={names.get(world) ?? world} notation={notation} t={t} />}
        <InferenceColumn heading={t.counterfactualHeading} kind="counterfactual" inference={cf} at={checkInferenceAt(shown, cf, world)} world={names.get(world) ?? world} notation={notation} t={t} />
      </div>
      <AtomLegend atoms={doc.atoms} />
    </>
  )
}

function InferenceColumn(props: {
  readonly heading: string
  readonly kind: 'strict' | 'counterfactual'
  readonly inference: Inference
  readonly at: InferenceAt
  readonly world: string
  readonly notation: Exclude<ModalNotation, 'ascii'>
  readonly t: ModalMessages
}) {
  const { heading, kind, inference, at, world, notation, t } = props
  const verdict = at.counterexample ? t.inferenceCounterexample(world) : at.premises.every(Boolean) ? t.inferenceHolds(world) : t.inferenceVacuous(world)
  return (
    <div className="ca-modal-column" data-kind={kind} data-counterexample={at.counterexample ? 'true' : 'false'}>
      <h4 className="ca-modal-column-head">{heading}</h4>
      <ol className="ca-modal-inference">
        {inference.premises.map((p, i) => (
          <li key={i}>
            <span className="ca-small ca-muted">{t.premise}</span> <FormulaMath formula={p} notation={notation} /> <TruthMark value={at.premises[i] as boolean} />
          </li>
        ))}
        <li data-conclusion="true">
          <span className="ca-small ca-muted">{t.conclusion}</span> <FormulaMath formula={inference.conclusion} notation={notation} /> <TruthMark value={at.conclusion} />
        </li>
      </ol>
      <p className="ca-small">{verdict}</p>
    </div>
  )
}
