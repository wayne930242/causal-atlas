import { useMemo, useState } from 'react'
import { Segmented } from '../../components/shared/parts.tsx'
import { Tex } from '../../components/text/Tex.tsx'
import type { ConditionalSemantics } from '../engine/evaluate.ts'
import { ModalEvaluator } from '../engine/evaluate.ts'
import { formulaLatex } from '../engine/print.ts'
import { modelOfDoc, startWorld } from '../data/load.ts'
import type { SpheresDoc } from '../data/schema.ts'
import { modalErrorMessage, useModalMessages } from '../i18n/messages.ts'
import { namesOf, worldNames } from './doc-graph.ts'
import { valueOrUndefined } from './explain-text.ts'
import type { ModalCommonProps, ModalModelInput } from './parts.tsx'
import { AtomLegend, FormulaMath, ModalProblems, ModalRoot, TruthMark, UnknownMark } from './parts.tsx'
import { layoutSpheres } from './sphere-graph.ts'
import { counterfactualView, sphereWorlds, worldSetLatex } from './sphere-view-model.ts'
import type { SphereMark } from './SphereDiagram.tsx'
import { SphereDiagram } from './SphereDiagram.tsx'
import { parseAll, useModalDoc } from './use-doc.ts'

export interface SphereViewProps extends ModalCommonProps {
  /** A `spheres` document (JSON text or value). */
  readonly model: ModalModelInput
  /** Formulas to list, replacing the document's; pick an A > B to see its closest antecedent worlds. */
  readonly formulas?: readonly string[]
  /** How `>` is read at first; default `lewis`. */
  readonly semantics?: ConditionalSemantics
  /** Show the Lewis/Stalnaker switch; default true. */
  readonly semanticsSwitch?: boolean
  /** Whose spheres to draw; default the document's centre. */
  readonly world?: string
}

/**
 * The spheres around a world: pick a counterfactual A > B to see |A|, the smallest sphere holding an
 * A-world, the closest A-worlds f(|A|, w) and the verdict, by Lewis or by Stalnaker.
 */
export function SphereView(props: SphereViewProps) {
  return (
    <ModalRoot locale={props.locale} name="spheres" caption={props.caption}>
      <SphereBody {...props} />
    </ModalRoot>
  )
}

const KINDS = ['spheres'] as const

function SphereBody(props: SphereViewProps) {
  const loaded = useModalDoc(props.model, KINDS)
  if (!loaded.ok) return <ModalProblems problems={loaded.errors} />
  return <SphereLoaded {...props} doc={loaded.doc} />
}

function SphereLoaded(props: SphereViewProps & { readonly doc: SpheresDoc }) {
  const { doc, notation = 'modern', semanticsSwitch = true } = props
  const t = useModalMessages()
  const model = useMemo(() => modelOfDoc(doc), [doc])
  const world = props.world !== undefined && model.spheres?.[props.world] !== undefined ? props.world : startWorld(doc)
  const [semantics, setSemantics] = useState<ConditionalSemantics>(props.semantics ?? 'lewis')
  const formulas = useMemo(() => parseAll(props.formulas ?? doc.formulas ?? []), [props.formulas, doc])
  const [focus, setFocus] = useState(() => Math.max(0, formulas.findIndex((f) => f.ok && f.formula.kind === 'cf')))
  const names = worldNames(doc, t.locale)
  const layout = useMemo(() => layoutSpheres(model.spheres?.[world] ?? [], world, sphereWorlds(doc, t.locale)), [model, world, doc, t.locale])
  const ev = useMemo(() => new ModalEvaluator(model, { semantics }), [model, semantics])
  const focused = formulas[focus]
  const cf = focused?.ok === true && focused.formula.kind === 'cf' ? counterfactualView(model, focused.formula.left, focused.formula.right, world, semantics) : undefined
  let marks: ReadonlyMap<string, SphereMark> | undefined = cf?.marks
  if (cf === undefined && focused?.ok === true) {
    try {
      marks = new Map(ev.truthSet(focused.formula).map((w) => [w, 'antecedent'] as const))
    } catch {
      marks = undefined
    }
  }
  const name = (id: string) => names.get(id) ?? id
  const sphereName = (i: number) => t.sphereName(i)
  return (
    <div className="ca-modal-split">
      <div className="ca-modal-figure">
        <SphereDiagram
          layout={layout}
          label={t.worldGraph(doc.worlds.length)}
          center={world}
          marks={marks}
          sphere={cf?.step.sphere}
          sphereName={sphereName}
          worldLabel={(id) => t.worldState(name(id), doc.worlds.find((w) => w.id === id)?.true ?? [])}
        />
        <ul className="ca-modal-legend" aria-hidden="true">
          <li data-mark="antecedent">{t.antecedentWorlds}</li>
          <li data-mark="selected">{t.closestWorlds}</li>
        </ul>
      </div>
      <div className="ca-modal-side">
        {semanticsSwitch && (
          <Segmented<ConditionalSemantics>
            label={t.semanticsLabel}
            options={[
              { value: 'lewis', label: 'Lewis' },
              { value: 'stalnaker', label: 'Stalnaker' },
            ]}
            value={semantics}
            onChange={setSemantics}
          />
        )}
        <p className="ca-modal-at ca-h3">{t.at(name(world))}</p>
        <ul className="ca-modal-formulas" aria-label={t.formulas}>
          {formulas.map((f, i) => {
            const value = valueOrUndefined(f, ev, world)
            return (
              <li key={`${f.source}-${i}`}>
                <button type="button" className="ca-modal-formula" aria-pressed={i === focus} onClick={() => setFocus(i)}>
                  {f.ok ? <FormulaMath formula={f.formula} notation={notation} /> : <code className="ca-mono">{f.source}</code>}
                  {value === undefined ? <UnknownMark /> : <TruthMark value={value} />}
                </button>
              </li>
            )
          })}
        </ul>
        {cf !== undefined && focused?.ok === true && focused.formula.kind === 'cf' && (
          <div className="ca-modal-explain" aria-live="polite">
            {cf.step.vacuous ? (
              <p>{t.vacuous}</p>
            ) : (
              <>
                <p>{t.smallestSphere(sphereName(cf.step.sphere as number), namesOf(names, cf.step.selected))}</p>
                <p>
                  <Tex
                    tex={`f(|${formulaLatex(focused.formula.left, notation)}|, \\text{${name(world)}}) = ${worldSetLatex(namesOf(names, cf.step.selected))}`}
                    text={`f(|A|, ${name(world)}) = {${namesOf(names, cf.step.selected).join(', ')}}`}
                  />
                </p>
                {cf.problem !== undefined ? <p className="ca-modal-problem">{t.notUnique(namesOf(names, cf.step.selected))}</p> : <p>{cf.value === true ? t.cfTrue : t.cfFalse(namesOf(names, cf.step.failures))}</p>}
              </>
            )}
          </div>
        )}
        <AtomLegend atoms={doc.atoms} />
        {focused !== undefined && !focused.ok && (
          <p className="ca-modal-problem" role="alert">
            {modalErrorMessage(focused.error, t)}
          </p>
        )}
      </div>
    </div>
  )
}
