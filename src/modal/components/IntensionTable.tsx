import { useMemo, useState } from 'react'
import { Tex } from '../../components/text/Tex.tsx'
import { ModalEvaluator } from '../engine/evaluate.ts'
import { formulaLatex, formulaText } from '../engine/print.ts'
import { modelOfDoc, startWorld } from '../data/load.ts'
import type { KripkeDoc } from '../data/schema.ts'
import { useModalMessages } from '../i18n/messages.ts'
import { namesOf, worldNames } from './doc-graph.ts'
import { valueOrUndefined } from './explain-text.ts'
import type { ModalCommonProps, ModalModelInput } from './parts.tsx'
import { AtomLegend, FormulaMath, ModalProblems, ModalRoot, TruthMark, UnknownMark } from './parts.tsx'
import { worldSetLatex } from './sphere-view-model.ts'
import { parseAll, useModalDoc } from './use-doc.ts'

export interface IntensionTableProps extends ModalCommonProps {
  /** A `kripke` document (JSON text or value); R is needed only for formulas with □ or ◇. */
  readonly model: ModalModelInput
  /** Formulas, one per row, replacing the document's. */
  readonly formulas?: readonly string[]
  /** The world whose column is picked first; default the document's `actual`. */
  readonly highlight?: string
}

/**
 * Intensions as functions from worlds to truth values: one row per sentence, one column per world.
 * Pick a world to read a_w(A) down its column; pick a sentence to see its truth set |A|.
 */
export function IntensionTable(props: IntensionTableProps) {
  return (
    <ModalRoot locale={props.locale} name="intension" caption={props.caption}>
      <IntensionBody {...props} />
    </ModalRoot>
  )
}

const KINDS = ['kripke'] as const

function IntensionBody(props: IntensionTableProps) {
  const loaded = useModalDoc(props.model, KINDS)
  if (!loaded.ok) return <ModalProblems problems={loaded.errors} />
  return <IntensionLoaded {...props} doc={loaded.doc} />
}

function IntensionLoaded(props: IntensionTableProps & { readonly doc: KripkeDoc }) {
  const { doc, notation = 'modern' } = props
  const t = useModalMessages()
  const ev = useMemo(() => new ModalEvaluator(modelOfDoc(doc)), [doc])
  const formulas = useMemo(() => parseAll(props.formulas ?? doc.formulas ?? doc.atoms.map((a) => a.id)), [props.formulas, doc])
  const [world, setWorld] = useState(() => (props.highlight !== undefined && doc.worlds.some((w) => w.id === props.highlight) ? props.highlight : startWorld(doc)))
  const [row, setRow] = useState(0)
  const names = worldNames(doc, t.locale)
  const ids = doc.worlds.map((w) => w.id)
  const picked = formulas[row]
  const value = picked === undefined ? undefined : valueOrUndefined(picked, ev, world)
  return (
    <>
      <p className="ca-modal-reading" aria-live="polite">
        {picked?.ok === true && value !== undefined && (
          <Tex
            tex={`a_{\\text{${names.get(world) ?? world}}}(${formulaLatex(picked.formula, notation)}) = \\mathrm{${value ? 'T' : 'F'}}`}
            text={`a_${names.get(world) ?? world}(${formulaText(picked.formula, notation)}) = ${value ? 'T' : 'F'}`}
          />
        )}
      </p>
      <div className="ca-modal-scroll">
        <table className="ca-modal-table ca-modal-intension">
          <caption>{t.intensionCaption}</caption>
          <thead>
            <tr>
              <th scope="col">{t.formula}</th>
              {ids.map((w) => (
                <th key={w} scope="col" data-selected={w === world ? 'true' : undefined}>
                  <button type="button" className="ca-modal-pick" aria-pressed={w === world} aria-label={t.selectWorld(names.get(w) ?? w)} onClick={() => setWorld(w)}>
                    {names.get(w) ?? w}
                  </button>
                </th>
              ))}
              <th scope="col">{t.truthSet}</th>
            </tr>
          </thead>
          <tbody>
            {formulas.map((f, i) => {
              let set: string[] | undefined
              try {
                set = f.ok ? ev.truthSet(f.formula) : undefined
              } catch {
                set = undefined
              }
              return (
                <tr key={`${f.source}-${i}`} data-selected={i === row ? 'true' : undefined}>
                  <th scope="row">
                    <button type="button" className="ca-modal-pick" aria-pressed={i === row} onClick={() => setRow(i)}>
                      {f.ok ? <FormulaMath formula={f.formula} notation={notation} /> : <code className="ca-mono">{f.source}</code>}
                    </button>
                  </th>
                  {ids.map((w) => {
                    const v = valueOrUndefined(f, ev, w)
                    return (
                      <td key={w} data-selected={w === world ? 'true' : undefined} data-in-set={i === row && set?.includes(w) ? 'true' : undefined}>
                        {v === undefined ? <UnknownMark /> : <TruthMark value={v} />}
                      </td>
                    )
                  })}
                  <td>{set !== undefined && <Tex tex={worldSetLatex(namesOf(names, set))} text={`{${namesOf(names, set).join(', ')}}`} />}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <AtomLegend atoms={doc.atoms} />
    </>
  )
}
