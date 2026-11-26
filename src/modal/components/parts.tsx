import type { ReactNode } from 'react'
import type { Locale } from '../../engine/types.ts'
import { LocaleScope } from '../../components/i18n/messages.ts'
import { Tex } from '../../components/text/Tex.tsx'
import type { ModalProblem } from '../engine/errors.ts'
import type { Formula } from '../engine/formula.ts'
import type { ModalNotation } from '../engine/print.ts'
import { formulaLatex, formulaText } from '../engine/print.ts'
import { modalText } from '../data/load.ts'
import type { ModalDocInput, ModalText } from '../data/schema.ts'
import { modalProblemMessage, useModalMessages } from '../i18n/messages.ts'

/** Pieces every modal component shares: the root box, problems, formulas and truth marks. */

/** A document as a component takes it: a value (as written, or checked) or JSON text. The component checks it and shows the problems when it cannot draw it. */
export type ModalModelInput = ModalDocInput | string

/** Props every modal component takes. */
export interface ModalCommonProps {
  /** Interface language; default the surrounding `LocaleProvider`'s, else zh-TW. */
  readonly locale?: Locale
  /** Display notation: `modern` (¬ ∧ ∨ ⊃, the default) or `garson` (~ and &). */
  readonly notation?: Exclude<ModalNotation, 'ascii'>
  /** A caption under the figure. */
  readonly caption?: ReactNode
}

/** The language scope and the root box with the component's class. */
export function ModalRoot({ locale, name, caption, children }: { readonly locale?: Locale; readonly name: string; readonly caption?: ReactNode; readonly children: ReactNode }) {
  return (
    <LocaleScope locale={locale}>
      <RootBox name={name} caption={caption}>
        {children}
      </RootBox>
    </LocaleScope>
  )
}

function RootBox({ name, caption, children }: { readonly name: string; readonly caption?: ReactNode; readonly children: ReactNode }) {
  const t = useModalMessages()
  return (
    <figure className={`ca-root not-prose ca-modal ca-modal-${name}`} lang={t.locale}>
      {children}
      {caption !== undefined && <figcaption className="ca-modal-caption ca-muted">{caption}</figcaption>}
    </figure>
  )
}

/** A document that could not be drawn: every problem with its code (the first as `data-code`). */
export function ModalProblems({ problems }: { readonly problems: readonly ModalProblem[] }) {
  const t = useModalMessages()
  return (
    <div className="ca-editor-errors ca-doc-error" role="alert" data-code={problems[0]?.code}>
      <p>{t.docInvalid}</p>
      <ul>
        {problems.map((p, i) => (
          <li key={`${p.code}-${i}`}>
            <code className="ca-mono">{p.code}</code> {modalProblemMessage(p, t)}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** One typeset formula; its plain text stays in `aria-label` and `data-text`. */
export function FormulaMath({ formula, notation = 'modern' }: { readonly formula: Formula; readonly notation?: ModalNotation }) {
  return <Tex tex={formulaLatex(formula, notation)} text={formulaText(formula, notation)} />
}

/** Garson's truth values: T and F, with the word for screen readers. */
export function TruthMark({ value }: { readonly value: boolean }) {
  const t = useModalMessages()
  return (
    <span className="ca-modal-truth" data-value={value ? 'T' : 'F'} aria-label={value ? t.trueWord : t.falseWord}>
      <span aria-hidden="true">{value ? 'T' : 'F'}</span>
    </span>
  )
}

/** A value that cannot be given: the formula does not parse, or is undefined at the world. */
export function UnknownMark() {
  return (
    <span className="ca-modal-truth" data-value="error" aria-hidden="true">
      ?
    </span>
  )
}

/** The atoms and what each says, when the document labels them. */
export function AtomLegend({ atoms }: { readonly atoms: readonly { readonly id: string; readonly label?: ModalText }[] }) {
  const t = useModalMessages()
  if (!atoms.some((a) => a.label !== undefined)) return null
  return (
    <dl className="ca-modal-atoms ca-small" aria-label={t.atomsHeading}>
      {atoms.map((a) => (
        <div key={a.id}>
          <dt className="ca-mono">{a.id}</dt>
          <dd>{modalText(a.label, t.locale) ?? a.id}</dd>
        </div>
      ))}
    </dl>
  )
}
