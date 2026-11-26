import { useMemo, useState } from 'react'
import type { Explanation } from '../engine/evaluate.ts'
import { ModalEvaluator } from '../engine/evaluate.ts'
import { kripkeModel } from '../engine/model.ts'
import { startWorld } from '../data/load.ts'
import type { KripkeDoc } from '../data/schema.ts'
import type { ModalMessages } from '../i18n/messages.ts'
import { modalErrorMessage, useModalMessages } from '../i18n/messages.ts'
import { docGraphInput, worldNames } from './doc-graph.ts'
import { explanationText, marksFor, valueOrUndefined } from './explain-text.ts'
import type { ModalCommonProps, ModalModelInput } from './parts.tsx'
import { AtomLegend, FormulaMath, ModalProblems, ModalRoot, TruthMark, UnknownMark } from './parts.tsx'
import type { ParsedFormula } from './use-doc.ts'
import { parseAll, useModalDoc } from './use-doc.ts'
import { layoutWorldGraph } from './world-graph.ts'
import { WorldGraph } from './WorldGraph.tsx'

export interface KripkeViewProps extends ModalCommonProps {
  /** A `kripke` document (JSON text or value). */
  readonly model: ModalModelInput
  /** Formulas to list, replacing the document's. */
  readonly formulas?: readonly string[]
  /** The world selected first; default the document's `actual`, else its first world. */
  readonly world?: string
  /** Explain the focused formula's value in words; default true. */
  readonly explain?: boolean
  /** Let the reader toggle atoms and arrows and type formulas; default false. */
  readonly editable?: boolean
  /** Draw wRv and vRw as one double-headed arrow; default true. */
  readonly mergeSymmetric?: boolean
  /** List false atoms as ¬p in the boxes at first; default false. */
  readonly showFalse?: boolean
}

/**
 * ⟨W, R, a⟩ drawn as Garson's boxes and arrows. Pick a world to see each formula's value there; pick
 * a formula to see, for □ and ◇, the worlds the selected one sees, the witness or the counterexample.
 */
export function KripkeView(props: KripkeViewProps) {
  return (
    <ModalRoot locale={props.locale} name="kripke" caption={props.caption}>
      <KripkeBody {...props} />
    </ModalRoot>
  )
}

const KINDS = ['kripke'] as const

function KripkeBody(props: KripkeViewProps) {
  const loaded = useModalDoc(props.model, KINDS)
  if (!loaded.ok) return <ModalProblems problems={loaded.errors} />
  return <KripkeLoaded {...props} doc={loaded.doc} />
}

function KripkeLoaded(props: KripkeViewProps & { readonly doc: KripkeDoc }) {
  const { doc, editable = false, explain = true, mergeSymmetric = true, notation = 'modern' } = props
  const t = useModalMessages()
  const [world, setWorld] = useState(() => (props.world !== undefined && doc.worlds.some((w) => w.id === props.world) ? props.world : startWorld(doc)))
  const [focus, setFocus] = useState(0)
  const [showFalse, setShowFalse] = useState(props.showFalse ?? false)
  const [extra, setExtra] = useState<readonly string[]>([])
  const [draft, setDraft] = useState('')
  const [valuation, setValuation] = useState<Readonly<Record<string, readonly string[]>>>(() => Object.fromEntries(doc.worlds.map((w) => [w.id, w.true])))
  const [pairs, setPairs] = useState<readonly (readonly [string, string])[]>(doc.access)
  const atoms = useMemo(() => doc.atoms.map((a) => a.id), [doc])
  const names = worldNames(doc, t.locale)
  const ev = useMemo(() => new ModalEvaluator(kripkeModel({ atoms, worlds: doc.worlds.map((w) => ({ id: w.id, true: valuation[w.id] ?? [] })), access: pairs })), [atoms, doc, valuation, pairs])
  const formulas: ParsedFormula[] = useMemo(() => parseAll([...(props.formulas ?? doc.formulas ?? []), ...extra]), [props.formulas, doc, extra])
  const layout = useMemo(() => layoutWorldGraph(docGraphInput(doc, t.locale, { showFalse, notation, mergeSymmetric, valuation, pairs })), [doc, t.locale, showFalse, notation, mergeSymmetric, valuation, pairs])
  const focused = formulas[focus]
  let explanation: Explanation | undefined
  let problem: string | undefined
  if (focused?.ok === true) {
    try {
      explanation = ev.explain(focused.formula, world)
    } catch (error) {
      problem = modalErrorMessage(error, t)
    }
  }
  const marks = marksFor(explanation, ev, focused?.ok === true ? focused.formula : undefined)
  const togglePair = (a: string, b: string): void =>
    setPairs((ps) => (ps.some(([x, y]) => x === a && y === b) ? ps.filter(([x, y]) => !(x === a && y === b)) : [...ps, [a, b] as const]))
  const toggleAtom = (w: string, atom: string): void =>
    setValuation((v) => ({ ...v, [w]: (v[w] ?? []).includes(atom) ? (v[w] ?? []).filter((a) => a !== atom) : [...(v[w] ?? []), atom] }))
  return (
    <div className="ca-modal-split">
      <div className="ca-modal-figure">
        <WorldGraph
          layout={layout}
          label={t.worldGraph(doc.worlds.length)}
          selected={world}
          marks={marks}
          worldLabel={(id) => `${t.selectWorld(names.get(id) ?? id)}. ${t.worldState(names.get(id) ?? id, valuation[id] ?? [])}`}
          onSelect={setWorld}
        />
      </div>
      <div className="ca-modal-side">
        <p className="ca-modal-at ca-h3">{t.at(names.get(world) ?? world)}</p>
        <ul className="ca-modal-formulas" aria-label={t.formulas}>
          {formulas.map((f, i) => (
            <li key={`${f.source}-${i}`}>
              <button type="button" className="ca-modal-formula" aria-pressed={i === focus} onClick={() => setFocus(i)}>
                {f.ok ? <FormulaMath formula={f.formula} notation={notation} /> : <code className="ca-mono">{f.source}</code>}
                <FormulaValue parsed={f} ev={ev} world={world} />
              </button>
            </li>
          ))}
        </ul>
        {explain && explanation !== undefined && (
          <p className="ca-modal-explain" aria-live="polite">
            {explanationText(explanation, names, t, notation)}
          </p>
        )}
        {problem !== undefined && (
          <p className="ca-modal-problem" role="alert">
            {problem}
          </p>
        )}
        {focused !== undefined && !focused.ok && (
          <p className="ca-modal-problem" role="alert">
            {modalErrorMessage(focused.error, t)}
          </p>
        )}
        <AtomLegend atoms={doc.atoms} />
        <label className="ca-modal-check">
          <input type="checkbox" checked={showFalse} onChange={(e) => setShowFalse(e.currentTarget.checked)} /> {t.showFalse}
        </label>
        {editable && (
          <form
            className="ca-modal-add"
            onSubmit={(e) => {
              e.preventDefault()
              if (draft.trim() === '') return
              setExtra((xs) => [...xs, draft.trim()])
              setFocus(formulas.length)
              setDraft('')
            }}
          >
            <input className="ca-modal-input ca-mono" aria-label={t.customFormula} placeholder={t.customFormula} value={draft} onChange={(e) => setDraft(e.currentTarget.value)} />
            <button type="submit" className="ca-modal-button">
              {t.add}
            </button>
          </form>
        )}
      </div>
      {editable && (
        <details className="ca-modal-edit">
          <summary>{t.editHeading}</summary>
          <EditTables doc={doc} atoms={atoms} names={names} valuation={valuation} pairs={pairs} onAtom={toggleAtom} onPair={togglePair} t={t} />
        </details>
      )}
    </div>
  )
}

function FormulaValue({ parsed, ev, world }: { readonly parsed: ParsedFormula; readonly ev: ModalEvaluator; readonly world: string }) {
  const value = valueOrUndefined(parsed, ev, world)
  return value === undefined ? <UnknownMark /> : <TruthMark value={value} />
}

function EditTables(props: {
  readonly doc: KripkeDoc
  readonly atoms: readonly string[]
  readonly names: ReadonlyMap<string, string>
  readonly valuation: Readonly<Record<string, readonly string[]>>
  readonly pairs: readonly (readonly [string, string])[]
  readonly onAtom: (w: string, atom: string) => void
  readonly onPair: (a: string, b: string) => void
  readonly t: ModalMessages
}) {
  const { doc, atoms, names, valuation, pairs, onAtom, onPair, t } = props
  const ids = doc.worlds.map((w) => w.id)
  const name = (id: string) => names.get(id) ?? id
  return (
    <div className="ca-modal-edit-tables">
      {atoms.length > 0 && (
        <table className="ca-modal-table">
          <caption>{t.atomsHeading}</caption>
          <thead>
            <tr>
              <th scope="col">{t.world}</th>
              {atoms.map((a) => (
                <th key={a} scope="col" className="ca-mono">
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ids.map((w) => (
              <tr key={w}>
                <th scope="row">{name(w)}</th>
                {atoms.map((a) => (
                  <td key={a}>
                    <input type="checkbox" aria-label={t.atomToggle(name(w), a)} checked={(valuation[w] ?? []).includes(a)} onChange={() => onAtom(w, a)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <table className="ca-modal-table">
        <caption>{t.accessHeading}</caption>
        <thead>
          <tr>
            <th scope="col">R</th>
            {ids.map((w) => (
              <th key={w} scope="col">
                {name(w)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ids.map((a) => (
            <tr key={a}>
              <th scope="row">{name(a)}</th>
              {ids.map((b) => (
                <td key={b}>
                  <input type="checkbox" aria-label={t.accessToggle(name(a), name(b))} checked={pairs.some(([x, y]) => x === a && y === b)} onChange={() => onPair(a, b)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
