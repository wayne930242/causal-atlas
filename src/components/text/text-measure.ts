/** Estimated text widths, and the per-value bars laid out to fit their labels. */

/** Geometry of one node's per-value bars (a chart `width` wide, `barW` bars every `pitch`, in px). */
export interface BarLayout {
  readonly pitch: number
  readonly barW: number
  readonly width: number
  /** False when the value labels would touch: only the first and last are written. */
  readonly labelsFit: boolean
}

const BAR_MAX_WIDTH = 126

/** Lay out one bar per value, in `size`-px labels, within BAR_MAX_WIDTH. */
export function barLayout(labels: readonly string[], size: number): BarLayout {
  const widest = Math.max(0, ...labels.map((l) => textWidth(l, size)))
  const wanted = Math.max(14, Math.ceil(widest) + 5)
  const pitch = Math.min(wanted, BAR_MAX_WIDTH / Math.max(1, labels.length))
  return { pitch, barW: Math.max(3, Math.min(12, pitch - 5)), width: pitch * labels.length, labelsFit: pitch >= widest + 2 }
}

/** Estimated text width in px: CJK and full-width punctuation are one em, the rest about 0.6 em. */
export function textWidth(s: string, size: number): number {
  let w = 0
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0
    w += code > 0x2e7f || '，。：；（）「」？！…—＝／、《》・'.includes(ch) ? size : size * 0.6
  }
  return w
}
