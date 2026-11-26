import type { Locale } from '../i18n/messages.ts'
import { DEFAULT_LOCALE, messagesFor } from '../i18n/messages.ts'

/** Author, licence and citation strings shared by CiteBlock, the image watermark and the README. */

export { AUTHOR_EN, AUTHOR_ZH } from '../i18n/messages.ts'
const PROJECT = 'logic-atlas'
/** Replaced at build time (vite `define`, see vite.define.ts) from package.json and CITATION.cff. */
declare const __CA_VERSION__: string
declare const __CA_YEAR__: number

export const VERSION: string = __CA_VERSION__
export const YEAR: number = __CA_YEAR__
export const DEFAULT_URL = 'https://github.com/wayne930242/logic-atlas'
export const DATA_LICENSE = 'CC BY 4.0'

/** The Chinese author-year citation. */
export function authorYear(url: string = DEFAULT_URL): string {
  return messagesFor('zh-TW').cite.authorYear(YEAR, PROJECT, VERSION, url)
}

export function authorYearEn(url: string = DEFAULT_URL): string {
  return `Hung, W. (${YEAR}). ${PROJECT} (Version ${VERSION}) [Software and dataset]. ${url}`
}

export function bibtex(url: string = DEFAULT_URL): string {
  return [
    `@software{hung_causal_atlas_${YEAR},`,
    `  author  = {Hung, Wei},`,
    `  title   = {${PROJECT}},`,
    `  year    = {${YEAR}},`,
    `  version = {${VERSION}},`,
    `  url     = {${url}},`,
    `  note    = {Code: MIT; data and teaching text: ${DATA_LICENSE}}`,
    `}`,
  ].join('\n')
}

/** The line baked into exported images, in `locale`. */
export function watermarkLine(url: string = DEFAULT_URL, locale: Locale = DEFAULT_LOCALE): string {
  return messagesFor(locale).cite.watermark(PROJECT, DATA_LICENSE, url)
}
