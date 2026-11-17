import { shareFromHash } from '../../data/model-doc.ts'
import type { Assignment, Value } from '../../engine/index.ts'
import { formatValue } from '../../engine/index.ts'
import type { Stochastic } from '../view-model.ts'
import { probText } from '../view-model.ts'

/**
 * The editor's state in the page address: `#case=<id>` for an unedited bundled case or host model,
 * `#model=<share value>` once the model was edited, either followed by `&do=<id>:<value>,…` for the
 * interventions on screen and `&pdo=<id>:<p>,…` for the stochastic ones (P*(id=1) = p).
 */
export interface HashState {
  /** A bundled case id, an `extraModels` id, or `blank`. */
  readonly caseId?: string
  /** A share value (`encodeShare`); wins over `caseId`. */
  readonly model?: string
  readonly interventions: Assignment
  readonly stochastic: Stochastic
}

function param(hash: string, name: string, raw = false): string | undefined {
  const m = new RegExp(`[#?&]${name}=([^&]*)`).exec(hash)
  if (m === null) return undefined
  if (raw) return m[1]
  try {
    return decodeURIComponent(m[1])
  } catch {
    return undefined
  }
}

/** `ST:0,BT:1`; ids and values are escaped, booleans written as 1/0. */
export function formatDo(interventions: Assignment): string {
  return Object.entries(interventions)
    .map(([id, value]) => `${encodeURIComponent(id)}:${encodeURIComponent(formatValue(value))}`)
    .join(',')
}

/** Reads `formatDo`'s text; numerals become numbers (the editor coerces them to the variable's domain). */
export function parseDo(text: string): Assignment {
  const out: Record<string, Value> = {}
  for (const part of text.split(',')) {
    const at = part.indexOf(':')
    if (at <= 0) continue
    try {
      const id = decodeURIComponent(part.slice(0, at))
      const raw = decodeURIComponent(part.slice(at + 1))
      out[id] = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw
    } catch {
      // a malformed escape: that intervention is dropped
    }
  }
  return out
}

/** `X:0.30,Y:0.05`: each stochastic intervention's P*(id=1). */
export function formatPdo(stochastic: Stochastic): string {
  return Object.entries(stochastic)
    .map(([id, p]) => `${encodeURIComponent(id)}:${probText(p)}`)
    .join(',')
}

/** Reads `formatPdo`'s text; an entry without a probability strictly between 0 and 1 is dropped. */
export function parsePdo(text: string): Stochastic {
  const out: Record<string, number> = {}
  for (const part of text.split(',')) {
    const at = part.indexOf(':')
    if (at <= 0) continue
    const p = Number(part.slice(at + 1))
    if (!(p > 0 && p < 1)) continue
    try {
      out[decodeURIComponent(part.slice(0, at))] = p
    } catch {
      // a malformed escape: that intervention is dropped
    }
  }
  return out
}

/** What a page hash asks the editor to show. */
export function readHashState(hash: string): HashState {
  const doText = param(hash, 'do', true)
  const pdoText = param(hash, 'pdo', true)
  const caseId = param(hash, 'case')
  return {
    model: shareFromHash(hash),
    caseId: caseId === '' ? undefined : caseId,
    interventions: doText === undefined ? {} : parseDo(doText),
    stochastic: pdoText === undefined ? {} : parsePdo(pdoText),
  }
}

/** The hash, without `#`, for a case id or a share value and the interventions. */
export function hashFragment(
  target: { readonly caseId: string } | { readonly model: string },
  interventions: Assignment,
  stochastic: Stochastic = {},
): string {
  const head = 'caseId' in target ? `case=${encodeURIComponent(target.caseId)}` : `model=${target.model}`
  const doText = formatDo(interventions)
  const pdoText = formatPdo(stochastic)
  return [head, doText === '' ? '' : `do=${doText}`, pdoText === '' ? '' : `pdo=${pdoText}`].filter((p) => p !== '').join('&')
}

const OWN_KEYS = new Set(['case', 'model', 'do', 'pdo'])

/**
 * The hash with the editor's state set to `fragment` (`case=…&do=…`). A hash route such as
 * `#/editor?lang=en` keeps its path and other parameters; any other hash is replaced.
 */
export function hashWith(hash: string, fragment: string): string {
  const route = /^#(\/[^?]*)(?:\?(.*))?$/.exec(hash)
  if (route === null) return `#${fragment}`
  const others = (route[2] ?? '').split('&').filter((p) => p !== '' && !OWN_KEYS.has(p.split('=')[0]))
  return `#${route[1]}?${[...others, fragment].join('&')}`
}

/** Point the address at `fragment` without a history entry, a scroll or a hashchange. */
export function replaceHash(fragment: string): void {
  const { pathname, search, hash } = window.location
  const next = hashWith(hash, fragment)
  if (hash === next) return
  window.history.replaceState(window.history.state, '', `${pathname}${search}${next}`)
}
