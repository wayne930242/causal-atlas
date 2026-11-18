import { texHtml } from './tex-html.ts'

export interface TexProps {
  readonly tex: string
  /** The plain-text form, read by screen readers and kept as `data-text` for copying. */
  readonly text: string
}

/** One typeset formula. Needs the KaTeX stylesheet (see the README). */
export function Tex({ tex, text }: TexProps) {
  return <span className="ca-tex" role="math" aria-label={text} data-text={text} data-tex={tex} dangerouslySetInnerHTML={{ __html: texHtml(tex) }} />
}
