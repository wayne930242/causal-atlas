import type { LoadedCase } from '../data/load.ts'
import type { Assignment, CausalTheory, CausalVerdict, Value } from '../engine/index.ts'
import { actualCause, counterfactual, evaluate, evaluateDecision, getVariable, parseCause, probability } from '../engine/index.ts'
import { formatValue, valuesEqual } from '../engine/values.ts'
import { assignmentText, bracketText, flipValue, label } from './view-model.ts'

/** Verdict rows computed by the engine, with short plain-language sentences. */

export const THEORY_NAME: Record<CausalTheory, string> = {
  butfor: '簡單反事實',
  'hp-original': 'HP 原始定義',
  'hp-updated': 'HP 更新定義',
  'hp-modified': 'HP 修正定義',
  'hp-normality': 'HP 加上常態',
}

export const THEORY_REF: Record<CausalTheory, string> = {
  butfor: '',
  'hp-original': 'Halpern & Pearl 2001',
  'hp-updated': 'Halpern & Pearl 2005',
  'hp-modified': 'Halpern 2015',
  'hp-normality': 'Halpern & Hitchcock 2015',
}

export const VERDICT_WORD: Record<CausalVerdict, string> = {
  cause: '算',
  'not-cause': '不算',
  'part-of-cause': '算一部分',
}

const ACTUAL_THEORIES = new Set<string>(['butfor', 'hp-original', 'hp-updated', 'hp-modified', 'hp-normality'])

export interface ActualRow {
  readonly theory: CausalTheory
  readonly verdict: CausalVerdict
  readonly sentence: string
  /** The witness statement, e.g. `[ST←0, BH←0](BS=0)`; it holds in the model. */
  readonly formula?: string
  /** Variables held fixed by the witness, with their values. */
  readonly fixed?: Assignment
  /** The interventions that show the witness world on the graph. */
  readonly show?: Assignment
}

export interface ActualGroup {
  readonly cause: string
  readonly effect: string
  readonly heading: string
  readonly rows: readonly ActualRow[]
}

const EVENT = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^\s]+)\s*$/

function negateEffect(effect: string): string {
  const m = EVENT.exec(effect)
  if (m !== null && (m[2] === '1' || m[2] === '0')) return `${m[1]}=${m[2] === '1' ? '0' : '1'}`
  return `¬(${effect})`
}

function effectVariable(effect: string): string | undefined {
  return EVENT.exec(effect)?.[1]
}

function causeText(cause: string): string {
  return cause.replace(/\s+and\s+/g, ' ∧ ')
}

function changeText(a: Assignment): string {
  return Object.entries(a)
    .map(([id, v]) => `${id} 改成 ${formatValue(v)}`)
    .join('、')
}

function fixText(a: Assignment): string {
  return Object.entries(a)
    .map(([id, v]) => `${id} 固定在 ${formatValue(v)}`)
    .join('、')
}

export function actualGroups(c: LoadedCase): ActualGroup[] {
  const context = c.context
  if (context === undefined) return []
  const { model } = c
  const groups = new Map<string, { cause: string; effect: string; rows: ActualRow[] }>()
  const actual = evaluate(model, context).values
  for (const v of c.data.verdicts) {
    if (!ACTUAL_THEORIES.has(v.theory) || !('cause' in v.query)) continue
    const theory = v.theory as CausalTheory
    const { cause, effect } = v.query
    const key = `${cause}⇒${effect}`
    const group = groups.get(key) ?? { cause, effect, rows: [] }
    groups.set(key, group)
    const result = actualCause(model, context, { cause, effect }, theory, { normality: c.normality })
    const yId = effectVariable(effect)
    const yNow = (world: Assignment): string => (yId === undefined ? '' : `${yId} 是 ${formatValue(world[yId] ?? '')}`)
    const check = result.check
    let sentence: string
    let formula: string | undefined
    let fixed: Assignment | undefined
    let show: Assignment | undefined
    if (!check.ac1) {
      sentence = `${causeText(cause)} 或 ${effect} 在實際世界不成立。`
    } else if (result.verdict === 'cause' && check.witness !== undefined) {
      const w = check.witness
      const hasW = w.W.length > 0
      fixed = hasW ? w.w : undefined
      show = { ...w.xPrime, ...w.w }
      const allActual = w.W.every((id) => valuesEqual(w.w[id], actual[id]))
      const hold = hasW ? `先把 ${fixText(w.w)}${allActual ? '（實際值）' : ''}，再把` : '把'
      sentence = `${hold} ${changeText(w.xPrime)}，${yNow(w.world)}。`
      formula = `${bracketText(show)}(${negateEffect(effect)})`
    } else if (result.verdict === 'part-of-cause' && result.containedIn !== undefined) {
      sentence = `單獨不算；它是 ${assignmentText(result.containedIn.cause, ' ∧ ')} 這個原因的一部分。`
    } else if (check.smallerCause !== undefined) {
      sentence = `其中 ${assignmentText(check.smallerCause.cause, ' ∧ ')} 單獨就夠了，多出來的部分不算。`
    } else if (theory === 'hp-normality') {
      sentence = '能讓結果不發生的情況，都比實際世界更不尋常。'
    } else {
      const parsed = parseCause(model, cause)
      const flipped: Record<string, Value> = {}
      for (const [id, value] of Object.entries(parsed)) flipped[id] = flipValue(getVariable(model, id), value)
      const world = evaluate(model, context, flipped).values
      sentence =
        theory === 'butfor'
          ? `只問一件事：少了它，結果還會不會發生。把 ${changeText(flipped)}，${yNow(world)}。`
          : `固定哪些變項都一樣：把 ${changeText(flipped)}，${yNow(world)}。`
    }
    group.rows.push({ theory, verdict: result.verdict, sentence, formula, fixed, show })
  }
  return [...groups.values()].map((g) => {
    const parsed = parseCause(model, g.cause)
    const ids = Object.keys(parsed)
    const causeLabel = ids.map((id) => label(model, id)).join('、')
    const yId = effectVariable(g.effect)
    const effectLabel = yId === undefined ? '' : label(model, yId)
    return { ...g, heading: `${causeLabel}（${causeText(g.cause)}）算不算${effectLabel}（${g.effect}）的原因` }
  })
}

export interface NumberRow {
  readonly kind: 'probability' | 'counterfactual'
  readonly expression: string
  readonly value: number
}

export function numberRows(c: LoadedCase): NumberRow[] {
  const prior = c.prior
  if (prior === undefined) return []
  const rows: NumberRow[] = []
  for (const v of c.data.verdicts) {
    if (v.theory === 'probability') {
      const q = v.query
      const cond = [q.do === undefined ? '' : `do(${assignmentText(q.do)})`, q.given ?? ''].filter((s) => s !== '')
      const expression = `P(${q.event}${cond.length === 0 ? '' : ` | ${cond.join(', ')}`})`
      rows.push({ kind: 'probability', expression, value: probability(c.model, prior, q).value })
    } else if (v.theory === 'counterfactual') {
      const q = v.query
      const result = counterfactual(c.model, prior, q)
      const expression = `P(${bracketText(q.do)}(${q.event})${q.evidence === undefined ? '' : ` | ${q.evidence}`})`
      rows.push({ kind: 'counterfactual', expression, value: result.probability ?? Number.NaN })
    }
  }
  return rows
}

export interface DecisionRow {
  readonly theory: 'edt' | 'cdt'
  readonly name: string
  readonly choice: string
  readonly utilities: readonly { readonly act: string; readonly eu: number | undefined }[]
}

export function decisionRows(c: LoadedCase): DecisionRow[] {
  const prior = c.prior
  const decision = c.decision
  if (prior === undefined || decision === undefined) return []
  const result = evaluateDecision(c.model, prior, decision)
  const act = (a: Value): string => `${decision.act}=${formatValue(a)}`
  return (['edt', 'cdt'] as const).map((theory) => ({
    theory,
    name: theory === 'edt' ? '證據決策論（EDT）' : '因果決策論（CDT）',
    choice: (theory === 'edt' ? result.edtChoice : result.cdtChoice).map(act).join('、'),
    utilities: result.acts.map((a) => ({ act: act(a.act), eu: theory === 'edt' ? a.edt?.eu : a.cdt.eu })),
  }))
}

/** A see-vs-do pair for the probability panel, taken from the case's probability verdicts. */
export interface SeeDoPair {
  readonly event: string
  readonly observe: string
  readonly intervene: Assignment
}

export function seeDoPair(c: LoadedCase): SeeDoPair | undefined {
  for (const v of c.data.verdicts) {
    if (v.theory !== 'probability' || v.query.given === undefined || v.query.do !== undefined) continue
    const given = v.query.given
    const event = v.query.event
    const m = EVENT.exec(given)
    if (m === null) continue
    const match = c.data.verdicts.find(
      (w) => w.theory === 'probability' && w.query.event === event && w.query.do !== undefined && m[1] in w.query.do,
    )
    if (match !== undefined && match.theory === 'probability' && match.query.do !== undefined) {
      return { event, observe: given, intervene: match.query.do }
    }
  }
  return undefined
}

export interface Intuition {
  /** `cause⇒effect` for an actual-cause query, `choice:<var>` for a decision. */
  readonly key: string
  readonly verdict?: CausalVerdict
  /** For a decision: the expected act, e.g. `S=1`. */
  readonly choice?: string
  readonly text: string
  readonly agree: ReadonlySet<string>
}

export function intuition(c: LoadedCase): Intuition | undefined {
  const i = c.data.intuition
  if (i === undefined) return undefined
  if ('choice' in i.query) {
    return { key: `choice:${i.query.choice}`, choice: `${i.query.choice}=${formatValue(i.expected as Value)}`, text: i.text, agree: new Set(i.agree) }
  }
  return { key: `${i.query.cause}⇒${i.query.effect}`, verdict: i.expected as CausalVerdict, text: i.text, agree: new Set(i.agree) }
}

/** 「簡單反事實和直覺不一致；HP 修正定義、HP 加上常態和直覺一致。」 for the theories the case lists on that query. */
export function intuitionSummary(c: LoadedCase): string | undefined {
  const i = intuition(c)
  if (i === undefined) return undefined
  const listed = new Set<string>()
  for (const v of c.data.verdicts) {
    if (i.choice !== undefined) {
      if ((v.theory === 'edt' || v.theory === 'cdt') && 'choice' in v.query) listed.add(v.theory)
    } else if ('cause' in v.query && `${v.query.cause}⇒${v.query.effect}` === i.key) {
      listed.add(v.theory)
    }
  }
  const name = (t: string): string => (t === 'edt' ? '證據決策論' : t === 'cdt' ? '因果決策論' : THEORY_NAME[t as CausalTheory])
  const agree = [...listed].filter((t) => i.agree.has(t)).map(name)
  const differ = [...listed].filter((t) => !i.agree.has(t)).map(name)
  const parts: string[] = []
  if (differ.length > 0) parts.push(`${differ.join('、')}和直覺不一致`)
  if (agree.length > 0) parts.push(`${agree.join('、')}和直覺一致`)
  return parts.length === 0 ? undefined : `${parts.join('；')}。`
}

/** Short citations: `Hall 2004；Halpern & Pearl 2005`. */
export function shortSources(c: LoadedCase): string {
  const order = { origin: 0, treatment: 1, reference: 2 }
  return [...c.data.sources]
    .sort((a, b) => order[a.role] - order[b.role])
    .map((s) => {
      const year = /\((\d{4}[a-z]?)\)/.exec(s.citation)?.[1] ?? ''
      const head = s.citation.split(/\(\d{4}/)[0] ?? ''
      const names = [...head.matchAll(/([A-Z][A-Za-z'’-]+), (?:[A-Z]\.\s?)+/g)].map((m) => m[1])
      const who = names.length === 0 ? head.trim() : names.length <= 2 ? names.join(' & ') : `${names[0]} et al.`
      return `${who} ${year}`.trim()
    })
    .join('；')
}
