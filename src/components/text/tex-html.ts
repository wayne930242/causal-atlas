import katex from 'katex'

/** LaTeX to KaTeX HTML. Server-safe; a bad input comes back as `katex-error` markup rather than throwing. */
export function texHtml(tex: string): string {
  return katex.renderToString(tex, { throwOnError: false, output: 'html', strict: 'ignore', trust: false })
}

