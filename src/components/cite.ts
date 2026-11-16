/** Author, licence and citation strings shared by CiteBlock, the image watermark and the README. */

export const AUTHOR_ZH = '洪偉'
export const AUTHOR_EN = 'Wei Hung'
export const PROJECT = 'causal-atlas'
/** Replaced at build time (vite `define`, see vite.define.ts) from package.json and CITATION.cff. */
declare const __CA_VERSION__: string
declare const __CA_YEAR__: number

export const VERSION: string = __CA_VERSION__
export const YEAR: number = __CA_YEAR__
export const DEFAULT_URL = 'https://wayneh.tw/causal/'
export const DATA_LICENSE = 'CC BY 4.0'

export function authorYear(url: string = DEFAULT_URL): string {
  return `${AUTHOR_ZH}（${AUTHOR_EN}）（${YEAR}）。${PROJECT}（${VERSION} 版）。${url}`
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

/** The line baked into exported images. */
export function watermarkLine(url: string = DEFAULT_URL): string {
  return `${AUTHOR_ZH}（${AUTHOR_EN}）· ${PROJECT} · ${DATA_LICENSE} · ${url}`
}
