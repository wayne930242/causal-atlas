import type { Expr } from '../engine/index.ts'
import { causalFormulas, renderExpr } from '../engine/index.ts'
import { messagesFor } from './i18n.ts'
import type { EquationsProps } from './Equations.tsx'
import { equationIds, equationRows, outcomeVariable } from './view-model.ts'

/** One `aligned` line: `&` goes before the main relation, or at the start when there is none. */
function alignedLine(latex: string): string {
  const at = latex.search(/\\leftrightarrow|=/)
  return at < 0 ? `& ${latex}` : `${latex.slice(0, at)}& ${latex.slice(at)}`
}

/** The rows on screen as one `aligned` block; struck-out originals are left out. */
export function equationsLatex({ c, shown, notation, values, interventions, stochastic }: EquationsProps): string {
  const t = messagesFor('en')
  const ids = equationIds(c)
  let lines: string[]
  if (notation === 'causal') {
    const y = outcomeVariable(c)
    const v = values?.[y]
    if (Object.keys(interventions).length > 0 && values !== undefined) {
      const statementExpr: Expr = {
        op: 'do',
        interventions: Object.entries(interventions).map(([variable, value]) => ({ variable, value })),
        body: { op: 'eq', left: { op: 'var', name: y }, right: { op: 'const', value: v ?? '' }, negated: false },
      }
      lines = [`& ${renderExpr(statementExpr, 'latex')}`]
    } else {
      lines = ids.map((id) =>
        alignedLine(causalFormulas(c.model, id).map((f, i, all) => `${renderExpr(f, 'latex')}${i < all.length - 1 ? ' \\land' : ''}`).join(' ')),
      )
    }
  } else {
    lines = equationRows(t, c, ids, notation, values, interventions, shown, stochastic).map((r) => alignedLine(r.latex))
  }
  return `\\begin{aligned}\n${lines.join(' \\\\\n')}\n\\end{aligned}`
}
