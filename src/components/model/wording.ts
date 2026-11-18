import type { Assignment, CausalModel, Value } from '../../engine/index.ts'
import { getVariable } from '../../engine/index.ts'
import type { Locale } from '../../engine/types.ts'
import { formatValue } from '../../engine/values.ts'
import type { Messages } from '../i18n/messages.ts'
import { messagesFor } from '../i18n/messages.ts'
import type { Stochastic } from './assignments.ts'

/** How variables, values, settings and probabilities read in the interface text. Pure; no DOM access. */

export function label(model: CausalModel, id: string, locale: Locale): string {
  return getVariable(model, id).label[locale]
}

/**
 * The label as drawn after the id: without a repeat of the id. A label equal to the id gives '';
 * one that ends with " <id>" or starts with "<id> " loses that part ("共同原因 Z" for Z is drawn
 * "Z 共同原因", not "Z 共同原因 Z").
 */
export function nameAfterId(id: string, name: string): string {
  const text = name.trim()
  if (text === id) return ''
  if (text.endsWith(` ${id}`)) return text.slice(0, -id.length).trim()
  if (text.startsWith(`${id} `)) return text.slice(id.length).trim()
  return text
}

/** The variable's label in `locale` as drawn beside its id (see `nameAfterId`). */
export function shortLabel(model: CausalModel, id: string, locale: Locale): string {
  return nameAfterId(id, label(model, id, locale))
}

/** The id and its label as one line of text, `X` alone when the label only repeats it. */
export function idWithName(id: string, name: string): string {
  return name === '' ? id : `${id} ${name}`
}

export function assignmentText(a: Assignment, sep = ', '): string {
  return Object.entries(a)
    .map(([id, v]) => `${id}=${formatValue(v)}`)
    .join(sep)
}

/**
 * A variable's label with its value, worded by value: a boolean 0 says the label's event did not
 * happen, so the label alone is never read as the event having occurred. `text` is `A=0` or `do(A=0)`.
 */
function valuePhrase(model: CausalModel, locale: Locale, id: string, value: Value, text: string, doing: boolean): string {
  const t = messagesFor(locale).phrase
  const name = label(model, id, locale)
  if (getVariable(model, id).domain.kind !== 'boolean' || ![true, false, 0, 1].includes(value as never)) return t.other(name, text)
  const on = value === true || value === 1
  return (doing ? (on ? t.doOn : t.doOff) : on ? t.seeOn : t.seeOff)(name, text)
}

/** `valuePhrase` for an observation text like `A=0`, or for the first entry of a do() assignment. */
export function phraseOf(model: CausalModel, locale: Locale, text: string, doing: boolean, assignment?: Assignment): string {
  const [id, value] = assignment !== undefined ? (Object.entries(assignment)[0] ?? ['', 0]) : (/^\s*([A-Za-z_]\w*)\s*=\s*(\S+)\s*$/.exec(text)?.slice(1) ?? ['', '0'])
  if (id === '') return text
  const v: Value = value === '0' ? 0 : value === '1' ? 1 : value === 'true' ? true : value === 'false' ? false : (value as Value)
  return valuePhrase(model, locale, id, v, text, doing)
}

/** `P(X=1)=0.30` for each stochastic intervention. */
function stochasticText(s: Stochastic, sep = ', '): string {
  return Object.entries(s)
    .map(([id, p]) => `P(${id}=1)=${probText(p)}`)
    .join(sep)
}

/** `do(X=1, P(Y=1)=0.30)`: the hard interventions, then the stochastic ones. */
export function doText(a: Assignment, s: Stochastic = {}): string {
  return `do(${[assignmentText(a), stochasticText(s)].filter((x) => x !== '').join(', ')})`
}

/**
 * What the graph is conditioned on: `do(X=1), Z=1`, `do(X=1)` or `Z=1` (the do() first, then the
 * observations, read as P(· | do(…), …)); '' when nothing is set.
 */
function settingText(a: Assignment, s: Stochastic = {}, observed: Assignment = {}): string {
  const hasDo = Object.keys(a).length > 0 || Object.keys(s).length > 0
  return [hasDo ? doText(a, s) : '', assignmentText(observed)].filter((x) => x !== '').join(', ')
}

/**
 * What is set, as the chip reads it: `settingText` for the interventional reading; for the
 * counterfactual one the evidence, then 若 and the do(): `D=1 ⇒ 若 do(A=0)`.
 */
export function readingText(t: Messages, counterfactualReading: boolean, a: Assignment, s: Stochastic = {}, observed: Assignment = {}): string {
  if (!counterfactualReading) return settingText(a, s, observed)
  const hasDo = Object.keys(a).length > 0 || Object.keys(s).length > 0
  const evidence = assignmentText(observed)
  if (!hasDo) return evidence
  return evidence === '' ? doText(a, s) : t.cf.head(evidence, doText(a, s))
}

export function bracketText(a: Assignment): string {
  return `[${Object.entries(a)
    .map(([id, v]) => `${id}←${formatValue(v)}`)
    .join(', ')}]`
}

/**
 * A probability as text: two decimals, except that a value within 0.01 of 0 or 1 (and not exactly
 * 0 or 1) gets enough decimals to show two significant digits of its distance from that end, so
 * 0.0001 reads 0.0001 and 0.9999 reads 0.9999 rather than 0.00 and 1.00 (trailing zeros past the
 * second decimal are dropped). Below 1e-6 from an end
 * it reads as a bound.
 */
export function probText(p: number): string {
  if (Number.isNaN(p)) return '—'
  if (p <= 0 || p >= 1) return fixed(p, 2)
  const gap = Math.min(p, 1 - p)
  if (gap >= 0.01) return fixed(p, 2)
  if (gap < 1e-6) return p < 0.5 ? '<0.000001' : '>0.999999'
  const digits = Math.ceil(-Math.log10(gap) - 1e-9) + 1
  return fixed(p, Math.min(digits, 7)).replace(/(\.\d\d\d*?)0+$/, '$1')
}

/**
 * `x` with `digits` decimals, a half rounded away from zero. `toFixed` rounds the binary value,
 * so 0.175 (stored as 0.17499…) would read 0.17 and 0.325 (0.32500…01) 0.33; here the scaled
 * value is first cut to 12 significant digits, which drops that error.
 */
export function fixed(x: number, digits: number): string {
  const scale = 10 ** digits
  const n = Math.round(Number((Math.abs(x) * scale).toPrecision(12)))
  return ((Math.sign(x) * n) / scale).toFixed(digits)
}

/** Two probabilities closer than this read as the same number (no 原本 note). */
export const SAME_PROBABILITY = 0.005

/**
 * 原本 v (or `word`'s note) under each number that moved from `base` by SAME_PROBABILITY or more;
 * nodes that did not move get no entry. The playground and the compare panel use the same rule.
 */
export function changeNotes(
  t: Messages,
  base: Readonly<Record<string, number>>,
  now: Readonly<Record<string, number>>,
  shown: readonly string[],
  word: (value: string) => string = t.was,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const id of shown) {
    const b = base[id]
    const n = now[id]
    if (b === undefined || n === undefined || Number.isNaN(b) || Number.isNaN(n)) continue
    if (Math.abs(n - b) >= SAME_PROBABILITY) out[id] = word(probText(b))
  }
  return out
}

/** Legend for probability readouts (the value legend is `t.valueLegend`): fill for 0/1 variables, bars for the others. */
export function probLegend(t: Messages, model: CausalModel, shown: readonly string[]): string {
  const finite = shown.filter((id) => getVariable(model, id).domain.kind === 'finite').length
  if (finite === 0) return t.probLegend
  return finite === shown.length ? t.probLegendBars : t.probLegendFinite
}
