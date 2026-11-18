import type { LoadedCase } from '../../data/load.ts'
import { checkVerdict } from '../../data/load.ts'
import type { CaseVerdict } from '../../data/schema.ts'
import type { Assignment, CausalTheory, CausalVerdict, ResponsibilityTheory, Value } from '../../engine/index.ts'
import { actualCause, counterfactual, evaluate, evaluateDecision, getVariable, parseCause, probability, responsibility, witnessStatus } from '../../engine/index.ts'
import { formatValue, valuesEqual } from '../../engine/values.ts'
import type { Messages } from '../i18n/messages.ts'
import { flipValue } from './assignments.ts'
import { normalityLine } from './normality-view.ts'
import { assignmentText, bracketText, fixed, label, probText } from './wording.ts'

/** Verdict rows computed by the engine, with short plain-language sentences in the table's language. */

export const THEORY_REF: Record<CausalTheory, string> = {
  butfor: '',
  'hp-original': 'Halpern & Pearl 2001',
  'hp-updated': 'Halpern & Pearl 2005',
  'hp-modified': 'Halpern 2015',
  'hp-normality': 'Halpern & Hitchcock 2015',
}

const ACTUAL_THEORIES = new Set<string>(['butfor', 'hp-original', 'hp-updated', 'hp-modified', 'hp-normality'])

/** A degree of responsibility (Halpern 2016, Def. 6.1.1, 6.1.6) with what attains it. */
export interface ResponsibilityCell {
  /** 0, or 1/k. */
  readonly degree: number
  /** The k behind a positive degree. */
  readonly k?: number
  /** The cause attaining k, as text (`MD=1`, or a coalition `V1=1 ∧ V2=1 ∧ V3=1`). */
  readonly cause?: string
  /** The variables the witness holds fixed, with their values (`MD=1`), empty when it holds none. */
  readonly held?: string
}

/** `0`, `1` or `1/3`. */
export function degreeText(r: ResponsibilityCell): string {
  return r.degree === 0 || r.k === undefined ? '0' : r.k === 1 ? '1' : `1/${r.k}`
}

export interface ActualRow {
  readonly theory: CausalTheory
  readonly verdict: CausalVerdict
  /** The degree of responsibility, for a query that asked for it (`responsibility: true`) under a Halpern–Pearl standard. */
  readonly responsibility?: ResponsibilityCell
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

/**
 * Whether the world `interventions` sets is a witness for `query`, per standard, standards with the
 * same answer joined: `HP 原始定義、HP 更新定義：是 L 的見證。HP 修正定義：不是，MD 沒有固定在實際值 1。`
 */
export function witnessNow(t: Messages, c: LoadedCase, query: VerdictQuery, theories: readonly CausalTheory[], interventions: Assignment): string {
  const context = c.context
  if (context === undefined) return ''
  const causeIds = Object.keys(parseCause(c.model, query.cause))
  const w = t.witness
  const sentences = new Map<string, CausalTheory[]>()
  for (const theory of theories) {
    const s = witnessStatus(c.model, context, query, theory, interventions, c.normality)
    let sentence: string
    if (s.witness) sentence = w.is(t.list(causeIds))
    else {
      const f = s.failure ?? 'cause-not-changed'
      const reason =
        f === 'not-actual'
          ? w.failure.notActual(causeText(query.cause), query.effect)
          : f === 'cause-not-changed'
            ? w.failure.causeNotChanged(t.list(causeIds))
            : f === 'holds-others'
              ? w.failure.holdsOthers(t.list(causeIds))
              : f === 'not-at-actual'
                ? w.failure.notAtActual(t.list(s.ids ?? []), t.list((s.ids ?? []).map((id) => formatValue(s.actual[id] ?? ''))))
                : f === 'effect-holds'
                  ? w.failure.effectHolds(query.effect)
                  : f === 'not-sufficient'
                    ? w.failure.notSufficient(causeText(query.cause), query.effect)
                    : c.normality === undefined
                      ? w.failure.lessNormal
                      : normalityLine(t, c.model, s.world, s.actual, c.normality, true)
      sentence = w.not(reason)
    }
    sentences.set(sentence, [...(sentences.get(sentence) ?? []), theory])
  }
  return w.join([...sentences].map(([sentence, names]) => w.group(t.list(names.map((n) => t.theory[n])), sentence)))
}

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

function changeText(t: Messages, a: Assignment): string {
  return t.list(Object.entries(a).map(([id, v]) => t.changeItem(id, formatValue(v))))
}

function fixText(t: Messages, a: Assignment): string {
  return t.list(Object.entries(a).map(([id, v]) => t.fixItem(id, formatValue(v))))
}

/** An actual-cause question asked of a figure: is `cause` a cause of `effect`, under `theories`. */
export interface VerdictQuery {
  readonly cause: string
  readonly effect: string
  /** Default: but-for and the three HP definitions, and HP with normality when the model has defaults. */
  readonly theories?: readonly CausalTheory[]
  /**
   * Each Halpern–Pearl cell also gives the degree of responsibility of `cause` (a single event) for
   * `effect`, 1/k (Halpern 2016, Def. 6.1.1 and 6.1.6), with its witness in the ⓘ; the but-for cell
   * has none, the degree is defined for the HP definitions.
   */
  readonly responsibility?: boolean
}

/** The standards a playground's verdict row shows by default for this case. */
export function defaultTheories(c: LoadedCase): CausalTheory[] {
  const out: CausalTheory[] = ['butfor', 'hp-original', 'hp-updated', 'hp-modified']
  if (c.normality !== undefined) out.push('hp-normality')
  return out
}

/**
 * The verdict rows grouped by question: the case file's actual-cause verdicts, or, given
 * `queries`, each query under its theories.
 */
export function actualGroups(t: Messages, c: LoadedCase, queries?: readonly VerdictQuery[]): ActualGroup[] {
  const context = c.context
  if (context === undefined) return []
  const { model } = c
  const groups = new Map<string, { cause: string; effect: string; rows: ActualRow[] }>()
  const actual = evaluate(model, context).values
  const asked: { theory: CausalTheory; cause: string; effect: string; responsibility: boolean }[] =
    queries === undefined
      ? c.data.verdicts.flatMap((v) =>
          ACTUAL_THEORIES.has(v.theory) && 'cause' in v.query
            ? [{ theory: v.theory as CausalTheory, cause: v.query.cause, effect: v.query.effect, responsibility: false }]
            : [],
        )
      : queries.flatMap((q) => (q.theories ?? defaultTheories(c)).map((theory) => ({ theory, cause: q.cause, effect: q.effect, responsibility: q.responsibility === true })))
  for (const { theory, cause, effect, responsibility: withDegree } of asked) {
    const key = `${cause}⇒${effect}`
    const group = groups.get(key) ?? { cause, effect, rows: [] }
    groups.set(key, group)
    const result = actualCause(model, context, { cause, effect }, theory, { normality: c.normality })
    const yId = effectVariable(effect)
    const yNow = (world: Assignment): string => (yId === undefined ? '' : t.outcomeIs(yId, formatValue(world[yId] ?? '')))
    const check = result.check
    let sentence: string
    let formula: string | undefined
    let fixed: Assignment | undefined
    let show: Assignment | undefined
    if (!check.ac1) {
      sentence = t.notActual(causeText(cause), effect)
    } else if (result.verdict === 'cause' && check.witness !== undefined) {
      const w = check.witness
      const hasW = w.W.length > 0
      fixed = hasW ? w.w : undefined
      show = { ...w.xPrime, ...w.w }
      const allActual = w.W.every((id) => valuesEqual(w.w[id], actual[id]))
      sentence = t.witnessSentence(hasW ? fixText(t, w.w) : undefined, allActual, changeText(t, w.xPrime), yNow(w.world))
      formula = `${bracketText(show)}(${negateEffect(effect)})`
    } else if (result.verdict === 'part-of-cause' && result.containedIn !== undefined) {
      sentence = t.partOfCause(assignmentText(result.containedIn.cause, ' ∧ '))
    } else if (check.smallerCause !== undefined) {
      sentence = t.smallerCause(assignmentText(check.smallerCause.cause, ' ∧ '))
    } else if (theory === 'hp-normality') {
      sentence = t.lessNormal
    } else {
      const parsed = parseCause(model, cause)
      const flipped: Record<string, Value> = {}
      for (const [id, value] of Object.entries(parsed)) flipped[id] = flipValue(getVariable(model, id), value)
      const world = evaluate(model, context, flipped).values
      sentence =
        theory === 'butfor'
          ? t.butForSentence(changeText(t, flipped), yNow(world))
          : t.anyFixSentence(changeText(t, flipped), yNow(world))
    }
    group.rows.push({
      theory,
      verdict: result.verdict,
      sentence,
      formula,
      fixed,
      show,
      ...(withDegree && theory !== 'butfor' ? { responsibility: responsibilityCell(c, context, cause, effect, theory) } : {}),
    })
  }
  return [...groups.values()].map((g) => {
    const parsed = parseCause(model, g.cause)
    const ids = Object.keys(parsed)
    const causeLabel = t.list(ids.map((id) => label(model, id, t.locale)))
    const yId = effectVariable(g.effect)
    const effectLabel = yId === undefined ? '' : label(model, yId, t.locale)
    return { ...g, heading: t.verdictHeading(causeLabel, causeText(g.cause), effectLabel, g.effect) }
  })
}

function responsibilityCell(c: LoadedCase, context: Assignment, cause: string, effect: string, theory: ResponsibilityTheory): ResponsibilityCell {
  const r = responsibility(c.model, context, { cause, effect }, theory, { normality: c.normality })
  if (r.degree === 0 || r.k === undefined) return { degree: 0 }
  const held = r.witness === undefined || r.witness.W.length === 0 ? '' : assignmentText(r.witness.w, ', ')
  return { degree: r.degree, k: r.k, cause: assignmentText(r.cause ?? parseCause(c.model, cause), ' ∧ '), held }
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

export function decisionRows(t: Messages, c: LoadedCase): DecisionRow[] {
  const prior = c.prior
  const decision = c.decision
  if (prior === undefined || decision === undefined) return []
  const result = evaluateDecision(c.model, prior, decision)
  const act = (a: Value): string => `${decision.act}=${formatValue(a)}`
  return (['edt', 'cdt'] as const).map((theory) => ({
    theory,
    name: t.decisionName[theory],
    choice: t.list((theory === 'edt' ? result.edtChoice : result.cdtChoice).map(act)),
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

export function intuition(t: Messages, c: LoadedCase): Intuition | undefined {
  const i = c.data.intuition
  if (i === undefined) return undefined
  const text = i.text[t.locale]
  if ('choice' in i.query) {
    return { key: `choice:${i.query.choice}`, choice: `${i.query.choice}=${formatValue(i.expected as Value)}`, text, agree: new Set(i.agree) }
  }
  return { key: `${i.query.cause}⇒${i.query.effect}`, verdict: i.expected as CausalVerdict, text, agree: new Set(i.agree) }
}

/** Which theories the case lists on the intuition's query agree with it and which do not, as one sentence. */
export function intuitionSummary(t: Messages, c: LoadedCase): string | undefined {
  const i = intuition(t, c)
  if (i === undefined) return undefined
  const listed = new Set<string>()
  for (const v of c.data.verdicts) {
    if (i.choice !== undefined) {
      if ((v.theory === 'edt' || v.theory === 'cdt') && 'choice' in v.query) listed.add(v.theory)
    } else if ('cause' in v.query && `${v.query.cause}⇒${v.query.effect}` === i.key) {
      listed.add(v.theory)
    }
  }
  const name = (x: string): string => (x === 'edt' || x === 'cdt' ? t.decisionShort[x] : t.theory[x as CausalTheory])
  const agree = [...listed].filter((x) => i.agree.has(x)).map(name)
  const differ = [...listed].filter((x) => !i.agree.has(x)).map(name)
  return t.intuitionSummary(differ, agree)
}

function shortCitation(citation: string): string {
  const year = /\((\d{4}[a-z]?)\)/.exec(citation)?.[1] ?? ''
  const head = citation.split(/\(\d{4}/)[0] ?? ''
  const names = [...head.matchAll(/([A-Z][A-Za-z'’-]+), (?:[A-Z]\.\s?)+/g)].map((m) => m[1])
  const who = names.length === 0 ? head.trim() : names.length <= 2 ? names.join(' & ') : `${names[0]} et al.`
  return `${who} ${year}`.trim()
}

/** Short citations: `Hall 2004；Halpern & Pearl 2005`. */
export function shortSources(t: Messages, c: LoadedCase): string {
  const order = { origin: 0, treatment: 1, reference: 2 }
  const sorted = [...c.data.sources]
    .sort((a, b) => order[a.role] - order[b.role])
    .map((s) => shortCitation(s.citation))
  return t.sourceList(sorted)
}

/** Where the case comes from, short form: `Hall 2004`. */
export function originSources(t: Messages, c: LoadedCase): string {
  return t.sourceList(c.data.sources.filter((s) => s.role === 'origin').map((s) => shortCitation(s.citation)))
}

/** Full citations of the case's origin sources, for the academic export's citation reminder. */
export function originCitations(c: LoadedCase): string[] {
  return c.data.sources.filter((s) => s.role === 'origin').map((s) => s.citation)
}

/** One row of the editor's verdict table: what the case file records and what the engine computes. */
export interface VerdictTableRow {
  readonly theory: CaseVerdict['theory']
  readonly name: string
  /** The question; typeset whole when `formula`, else as a sentence naming ids. */
  readonly query: string
  readonly formula: boolean
  readonly expected: string
  readonly engine: string
  /** Raw values for data attributes: the expected value and the engine's, as `checkVerdict` gives them. */
  readonly rawExpected: string
  readonly rawEngine: string
  readonly ok: boolean
}

const numberText = (x: number): string => (Number.isInteger(x) ? String(x) : fixed(x, 2))

/**
 * Every verdict of the case, recomputed by the engine, in the case file's order; with `on`, each
 * is recomputed on that model instead (the editor's edited one), its decision falling back to the case's.
 */
export function verdictTable(t: Messages, c: LoadedCase, on?: LoadedCase): VerdictTableRow[] {
  const e = t.editor
  const target: LoadedCase = on === undefined ? c : { ...on, decision: on.decision ?? c.decision, data: { ...on.data, verdicts: c.data.verdicts } }
  const decision = target.decision
  let decided: ReturnType<typeof evaluateDecision> | undefined
  const act = (a: Value): string => `${decision?.act ?? ''}=${formatValue(a)}`
  return c.data.verdicts.map((v): VerdictTableRow => {
    let name: string
    let query: string
    let formula = true
    let show: (value: Value) => string = (value) => (typeof value === 'number' ? numberText(value) : formatValue(value))
    switch (v.theory) {
      case 'butfor':
      case 'hp-original':
      case 'hp-updated':
      case 'hp-modified':
      case 'hp-normality':
        name = t.theory[v.theory]
        query = `${causeText(v.query.cause)} ⇒ ${v.query.effect}`
        show = (value) => t.verdict[value as CausalVerdict] ?? String(value)
        break
      case 'probability': {
        const q = v.query
        const cond = [q.do === undefined ? '' : `do(${assignmentText(q.do)})`, q.given ?? ''].filter((s) => s !== '')
        name = t.probability
        query = `P(${q.event}${cond.length === 0 ? '' : ` | ${cond.join(', ')}`})`
        show = (value) => (typeof value === 'number' ? probText(value) : String(value))
        break
      }
      case 'counterfactual':
        name = e.counterfactual
        query = `P(${bracketText(v.query.do)}(${v.query.event})${v.query.evidence === undefined ? '' : ` | ${v.query.evidence}`})`
        show = (value) => (typeof value === 'number' ? probText(value) : String(value))
        break
      case 'edt':
      case 'cdt': {
        name = t.decisionName[v.theory]
        formula = false
        const q = v.query
        if ('choice' in q) {
          query = e.bestAct(q.choice)
          show = act
        } else {
          query = e.expectedUtilityOf(act(q.expectedUtility))
        }
        break
      }
    }
    try {
      const check = checkVerdict(target, v)
      let engine = show(check.actual)
      if ((v.theory === 'edt' || v.theory === 'cdt') && 'choice' in v.query && decision !== undefined && target.prior !== undefined) {
        decided ??= evaluateDecision(target.model, target.prior, decision)
        const choice = v.theory === 'edt' ? decided.edtChoice : decided.cdtChoice
        if (choice.length !== 1) engine = e.tie(t.list(choice.map(act)))
      }
      return {
        theory: v.theory,
        name,
        query,
        formula,
        expected: show(check.expected),
        engine,
        rawExpected: String(check.expected),
        rawEngine: String(check.actual),
        ok: check.ok,
      }
    } catch {
      return { theory: v.theory, name, query, formula, expected: show(v.expected), engine: e.verdictTable.failed, rawExpected: String(v.expected), rawEngine: '', ok: false }
    }
  })
}
