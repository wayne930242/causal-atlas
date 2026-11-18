import type { LoadedCase } from '../../data/load.ts'
import type { Assignment, Value } from '../../engine/index.ts'
import { coerceToDomain } from '../../engine/index.ts'
import { DATA_LICENSE, DEFAULT_URL, authorYear, authorYearEn } from './cite.ts'
import { formatDo, formatPdo, parseDo, parsePdo } from './url-state.ts'
import type { Locale } from '../i18n/messages.ts'
import { messagesFor } from '../i18n/messages.ts'
import { solve } from '../model/model-state.ts'
import type { Stochastic } from '../model/assignments.ts'

/**
 * An embedded figure's state in its address: `#do=<id>:<value>,…&pdo=<id>:<p>,…&obs=<id>:<value>,…`,
 * the same encoding as the editor's `do=` and `pdo=`.
 */
export interface EmbedState {
  readonly interventions: Assignment
  readonly stochastic: Stochastic
  readonly observed: Assignment
}

/** Where a bundled case's embed page lives by default: `<base>case/<id>/`. */
export const DEFAULT_EMBED_BASE = `${DEFAULT_URL}embed/`

function param(hash: string, name: string): string | undefined {
  return new RegExp(`[#?&]${name}=([^&]*)`).exec(hash)?.[1]
}

/** The state part of an embed address, without `#`; '' when nothing is set. */
export function embedFragment(state: EmbedState): string {
  const parts: string[] = []
  const d = formatDo(state.interventions)
  const p = formatPdo(state.stochastic)
  const o = formatDo(state.observed)
  if (d !== '') parts.push(`do=${d}`)
  if (p !== '') parts.push(`pdo=${p}`)
  if (o !== '') parts.push(`obs=${o}`)
  return parts.join('&')
}

/** Reads `embedFragment`'s text from a hash; numerals become numbers (coerced to each domain by the reader). */
export function readEmbedState(hash: string): EmbedState {
  const d = param(hash, 'do')
  const p = param(hash, 'pdo')
  const o = param(hash, 'obs')
  return {
    interventions: d === undefined ? {} : parseDo(d),
    stochastic: p === undefined ? {} : parsePdo(p),
    observed: o === undefined ? {} : parseDo(o),
  }
}

/**
 * The embed page's address: `src`, with `lang=en` for an English figure, `from` (the page the figure
 * was copied from) and the state.
 */
export function embedSrc(src: string, state: EmbedState, from?: string, locale?: Locale): string {
  const url = new URL(src)
  if (locale === 'en') url.searchParams.set('lang', 'en')
  if (from !== undefined && from !== '') url.searchParams.set('from', from)
  const fragment = embedFragment(state)
  url.hash = fragment
  return url.toString()
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export interface EmbedCodeOptions {
  readonly src: string
  readonly title: string
  readonly height: number
  readonly locale: Locale
  /** Link in the citation. Default https://wayneh.tw/causal/. */
  readonly url?: string
  /** Full citations of the case's origin sources, cited after the project. */
  readonly origins?: readonly string[]
}

/**
 * What a reader pastes to embed the figure: the iframe, then the citation as it is given for the
 * academic image (author-year, licence, the case's own sources), so the credit stays beside it.
 */
export function embedCode({ src, title, height, locale, url = DEFAULT_URL, origins = [] }: EmbedCodeOptions): string {
  const m = messagesFor(locale).export
  const cite = locale === 'en' ? authorYearEn(url) : authorYear(url)
  const parts = [cite, m.embedLicence(DATA_LICENSE), ...(origins.length === 0 ? [] : [m.embedSources(origins)])]
  return [
    `<iframe src="${escapeAttr(src)}" title="${escapeAttr(m.embedTitle(title))}" width="100%" height="${Math.round(height)}" style="border:0;max-width:100%" loading="lazy"></iframe>`,
    `<p>${escapeText(parts.join(' '))}</p>`,
  ].join('\n')
}

/**
 * Where an embedded figure's credit links: `from` when it is a path on the embed page's own site
 * (the page the figure was copied from), else the project page.
 */
export function embedHome(search: string, origin: string, fallback: string = DEFAULT_URL): string {
  const from = new URLSearchParams(search).get('from')
  if (from === null || !from.startsWith('/') || from.startsWith('//')) return fallback
  return `${origin}${from}`
}

function endogenous(c: LoadedCase, a: Assignment): Assignment {
  const out: Record<string, Value> = {}
  for (const [id, value] of Object.entries(a)) {
    const v = c.model.byId.get(id)
    if (v === undefined || v.kind === 'exogenous') continue
    try {
      out[id] = coerceToDomain(v, value)
    } catch {
      try {
        // A numeral read from the address may name a text value, e.g. '2'.
        if (typeof value === 'number') out[id] = coerceToDomain(v, String(value))
      } catch {
        // dropped: not a value of this variable
      }
    }
  }
  return out
}

/**
 * The part of an embed address's state that fits the case: endogenous variables with values in
 * their domains; stochastic interventions and observations only when the case is drawn with
 * probabilities, on nodes not set otherwise; observations dropped when they cannot happen.
 */
export function fitEmbedState(c: LoadedCase, state: EmbedState): EmbedState {
  const interventions = endogenous(c, state.interventions)
  if (c.context !== undefined) return { interventions, stochastic: {}, observed: {} }
  const stochastic: Record<string, number> = {}
  for (const [id, p] of Object.entries(state.stochastic)) {
    const v = c.model.byId.get(id)
    if (v === undefined || v.kind === 'exogenous' || v.domain.kind !== 'boolean' || id in interventions || !(p > 0 && p < 1)) continue
    stochastic[id] = p
  }
  const observed: Record<string, Value> = {}
  for (const [id, value] of Object.entries(endogenous(c, state.observed))) {
    if (!(id in interventions) && !(id in stochastic)) observed[id] = value
  }
  if (Object.keys(observed).length > 0 && !((solve(c, interventions, stochastic, observed).evidence ?? 1) > 0)) {
    return { interventions, stochastic, observed: {} }
  }
  return { interventions, stochastic, observed }
}
