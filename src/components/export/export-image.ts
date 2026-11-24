import { DEFAULT_URL, authorYear, authorYearEn, bibtex, watermarkLine } from './cite.ts'
import type { Locale } from '../i18n/messages.ts'
import { DEFAULT_LOCALE, messagesFor } from '../i18n/messages.ts'
import { saveFile } from './download.ts'
import { SUB_DY, SUB_IDENT, SUB_SIZE, ZWSP, subscriptParts } from '../text/subscript.ts'
import { textWidth } from '../text/text-measure.ts'

/**
 * Image export: copy a live graph SVG, replace every class with literal presentation attributes
 * taken from the chosen theme's palette, frame it with a title, tags and a watermark strip, and
 * hand it over as SVG or as a 2× PNG. Touches the DOM only when called.
 */

export type ExportTheme = 'light' | 'dark'
export type ExportFormat = 'png' | 'svg'
/** `color`: the page's look with a watermark strip. `academic`: black and white line art, nothing else. */
export type ExportStyle = 'color' | 'academic'

interface Translucent {
  readonly color: string
  readonly alpha: number
}

export interface Palette {
  readonly background: string
  readonly foreground: string
  readonly accent: string
  readonly accentForeground: string
  readonly muted: string
  readonly mutedForeground: string
  readonly border: string
  readonly slate: string
  readonly slateText: string
  readonly onSlate: string
  readonly amber: string
  readonly amberText: string
  readonly amberFill: Translucent
  readonly green: string
  readonly onGreen: string
  readonly idle: string
  readonly guide: string
  /** Counterfactual tint: slate mixed into the background. */
  readonly cf: string
}

function hex(c: string): [number, number, number] {
  const n = Number.parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** `color-mix(in srgb, a w, b)` as a hex literal. */
export function mix(a: string, w: number, b: string): string {
  const x = hex(a)
  const y = hex(b)
  return `#${x
    .map((v, i) => Math.round(v * w + y[i] * (1 - w)))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`
}

/** The blog's light and dark tokens (src/demo/theme.css) plus the components' --ca-* colours (styles.css). */
export const PALETTES: Record<ExportTheme, Palette> = {
  light: {
    background: '#f5f5f2',
    foreground: '#111111',
    accent: '#e3311d',
    accentForeground: '#ffffff',
    muted: '#e7e7e2',
    mutedForeground: '#686864',
    border: '#c9c9c3',
    slate: '#5b6f7a',
    slateText: '#4a5d68',
    onSlate: '#ffffff',
    amber: '#b07d0b',
    amberText: '#7a5600',
    amberFill: { color: '#c39a1f', alpha: 0.18 },
    green: '#2f7a52',
    onGreen: '#ffffff',
    idle: '#7f7f79',
    guide: '#b4b4ae',
    cf: mix('#5b6f7a', 0.1, '#f5f5f2'),
  },
  dark: {
    background: '#111111',
    foreground: '#f2f2ed',
    accent: '#ff5948',
    accentForeground: '#111111',
    muted: '#242421',
    mutedForeground: '#a6a6a0',
    border: '#444440',
    slate: '#8aa3b0',
    slateText: '#8aa3b0',
    onSlate: '#111111',
    amber: '#e0b54a',
    amberText: '#e0b54a',
    amberFill: { color: '#e0b54a', alpha: 0.16 },
    green: '#6cc497',
    onGreen: '#111111',
    idle: '#7d7d77',
    guide: '#5a5a55',
    cf: mix('#8aa3b0', 0.12, '#111111'),
  },
}

/** Academic style: only black and white; every difference the colours carried is carried by line and shape. */
export const ACADEMIC_PALETTE: Palette = {
  background: '#ffffff',
  foreground: '#000000',
  accent: '#000000',
  accentForeground: '#ffffff',
  muted: '#ffffff',
  mutedForeground: '#000000',
  border: '#000000',
  slate: '#000000',
  slateText: '#000000',
  onSlate: '#ffffff',
  amber: '#000000',
  amberText: '#000000',
  amberFill: { color: '#ffffff', alpha: 1 },
  green: '#000000',
  onGreen: '#ffffff',
  idle: '#000000',
  guide: '#000000',
  cf: '#ffffff',
}

const SANS = "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', 'Helvetica Neue', Arial, sans-serif"
const MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"

type Decl = Readonly<Record<string, string>>

interface Rule {
  readonly tag?: 'text' | 'tspan'
  readonly cls: readonly string[]
  readonly decl: (p: Palette) => Decl
}

const translucent = (t: Translucent): Decl => ({ fill: t.color, 'fill-opacity': String(t.alpha) })

/** styles.css's SVG rules, in cascade order (later wins). Keep in step with that file. */
const RULES: readonly Rule[] = [
  { cls: ['ca-svg-label'], decl: () => ({ 'font-size': '14' }) },
  { cls: ['ca-svg-small'], decl: () => ({ 'font-size': '12' }) },
  { cls: ['ca-svg-tiny'], decl: () => ({ 'font-size': '11' }) },
  { cls: ['ca-svg-num'], decl: () => ({ 'font-size': '16', 'font-weight': '700' }) },
  { cls: ['ca-svg-bold'], decl: () => ({ 'font-weight': '700' }) },
  { cls: ['ca-mono'], decl: () => ({ 'font-family': MONO }) },
  { cls: ['ca-fill-fg'], decl: (p) => ({ fill: p.foreground }) },
  { cls: ['ca-fill-bg'], decl: (p) => ({ fill: p.background }) },
  { cls: ['ca-fill-idle'], decl: (p) => ({ fill: p.idle }) },
  { cls: ['ca-fill-reset'], decl: (p) => ({ fill: p.mutedForeground }) },
  { cls: ['ca-stroke-reset'], decl: (p) => ({ stroke: p.mutedForeground, 'stroke-width': '2', 'stroke-dasharray': '4 2', fill: 'none' }) },
  { cls: ['ca-fill-accent'], decl: (p) => ({ fill: p.accent }) },
  { cls: ['ca-fill-slate-bg'], decl: (p) => ({ fill: p.slate }) },
  { cls: ['ca-fill-green'], decl: (p) => ({ fill: p.green }) },
  { cls: ['ca-stroke-green'], decl: (p) => ({ stroke: p.green }) },
  { cls: ['ca-stroke-on-green'], decl: (p) => ({ stroke: p.onGreen }) },
  { cls: ['ca-fill-amber-mark'], decl: (p) => ({ fill: p.amber }) },
  { cls: ['ca-stroke-amber'], decl: (p) => ({ stroke: p.amber }) },
  { cls: ['ca-node-on'], decl: (p) => ({ fill: p.foreground, stroke: p.foreground, 'stroke-width': '1.5' }) },
  { cls: ['ca-node-off'], decl: (p) => ({ fill: p.background, stroke: p.foreground, 'stroke-width': '1.5' }) },
  { cls: ['ca-node-outline'], decl: (p) => ({ fill: 'none', stroke: p.foreground, 'stroke-width': '1.5' }) },
  { cls: ['ca-ring'], decl: (p) => ({ fill: 'none', stroke: p.foreground, 'stroke-width': '1.5' }) },
  { cls: ['ca-stroke-live'], decl: (p) => ({ stroke: p.foreground, 'stroke-width': '2.25', fill: 'none' }) },
  { cls: ['ca-stroke-idle'], decl: (p) => ({ stroke: p.idle, 'stroke-width': '1.5', fill: 'none' }) },
  {
    cls: ['ca-stroke-cut'],
    decl: (p) => ({ stroke: p.idle, 'stroke-width': '1.5', 'stroke-dasharray': '4 4', fill: 'none' }),
  },
  {
    cls: ['ca-stroke-arc'],
    decl: (p) => ({ stroke: p.foreground, 'stroke-width': '1.5', 'stroke-dasharray': '7 4', fill: 'none' }),
  },
  {
    cls: ['ca-stroke-slash'],
    decl: (p) => ({ stroke: p.accent, 'stroke-width': '2.5', 'stroke-linecap': 'square', fill: 'none' }),
  },
  {
    cls: ['ca-stroke-clamp'],
    decl: (p) => ({ stroke: p.accent, 'stroke-width': '2.5', 'stroke-linecap': 'square', fill: 'none' }),
  },
  { cls: ['ca-inhibit'], decl: (p) => ({ fill: p.background, stroke: p.idle, 'stroke-width': '1.5' }) },
  { cls: ['ca-inhibit', 'is-live'], decl: (p) => ({ stroke: p.foreground, 'stroke-width': '2.25' }) },
  {
    cls: ['ca-hull'],
    decl: (p) => ({ fill: 'none', stroke: p.amber, 'stroke-width': '1.75', 'stroke-dasharray': '5 4' }),
  },
  { cls: ['ca-amber-tag'], decl: (p) => ({ ...translucent(p.amberFill), stroke: p.amber }) },
  { cls: ['ca-hair'], decl: (p) => ({ stroke: p.border, 'stroke-width': '1' }) },
  {
    cls: ['ca-guide'],
    decl: (p) => ({ stroke: p.guide, 'stroke-width': '1', 'stroke-dasharray': '1 5', fill: 'none' }),
  },
  { cls: ['ca-lane-cf'], decl: (p) => ({ fill: p.cf }) },
  { cls: ['ca-lane-mask'], decl: (p) => ({ fill: p.cf }) },
  { cls: ['ca-diff-bg'], decl: (p) => ({ fill: p.muted }) },
  { cls: ['ca-lane-tag-fg'], decl: (p) => ({ fill: p.foreground }) },
  { cls: ['ca-lane-tag-slate'], decl: (p) => ({ fill: p.slate }) },
  { cls: ['ca-lane-tag-accent'], decl: (p) => ({ fill: p.accent }) },
  { cls: ['ca-lane-tag-amber'], decl: (p) => ({ ...translucent(p.amberFill), stroke: p.amber }) },
  // `.ca-graph text` and the text colour classes outrank the single-class rules above.
  { tag: 'text', cls: [], decl: (p) => ({ fill: p.foreground }) },
  { tag: 'text', cls: ['ca-fill-muted'], decl: (p) => ({ fill: p.mutedForeground }) },
  { tag: 'tspan', cls: ['ca-fill-muted'], decl: (p) => ({ fill: p.mutedForeground, 'font-weight': '400' }) },
  { tag: 'text', cls: ['ca-fill-bg-text'], decl: (p) => ({ fill: p.background }) },
  { tag: 'text', cls: ['ca-fill-on-accent'], decl: (p) => ({ fill: p.accentForeground }) },
  { tag: 'text', cls: ['ca-fill-on-slate'], decl: (p) => ({ fill: p.onSlate }) },
  { tag: 'text', cls: ['ca-fill-amber'], decl: (p) => ({ fill: p.amberText }) },
  { tag: 'text', cls: ['ca-fill-slate'], decl: (p) => ({ fill: p.slateText }) },
  { tag: 'text', cls: ['ca-svg-text'], decl: (p) => ({ fill: p.foreground }) },
  { cls: ['ca-lane-tag-text-fg'], decl: (p) => ({ fill: p.background }) },
  { cls: ['ca-lane-tag-text-slate'], decl: (p) => ({ fill: p.onSlate }) },
  { cls: ['ca-lane-tag-text-accent'], decl: (p) => ({ fill: p.accentForeground }) },
  { cls: ['ca-lane-tag-text-amber'], decl: (p) => ({ fill: p.amberText }) },
]

/**
 * Academic overrides, after RULES: print-friendly widths (none under 0.75), a dashed cut edge
 * with its two slashes, a dotted hull for the witness, thin idle edges against thick live ones.
 */
const ACADEMIC_RULES: readonly Rule[] = [
  { cls: ['ca-stroke-idle'], decl: (p) => ({ stroke: p.idle, 'stroke-width': '1', fill: 'none' }) },
  { cls: ['ca-stroke-live'], decl: (p) => ({ stroke: p.foreground, 'stroke-width': '2', fill: 'none' }) },
  { cls: ['ca-stroke-cut'], decl: (p) => ({ stroke: p.idle, 'stroke-width': '1.25', 'stroke-dasharray': '5 3', fill: 'none' }) },
  { cls: ['ca-stroke-arc'], decl: (p) => ({ stroke: p.foreground, 'stroke-width': '1.25', 'stroke-dasharray': '7 3', fill: 'none' }) },
  { cls: ['ca-stroke-slash'], decl: (p) => ({ stroke: p.foreground, 'stroke-width': '2', 'stroke-linecap': 'butt', fill: 'none' }) },
  { cls: ['ca-stroke-clamp'], decl: (p) => ({ stroke: p.foreground, 'stroke-width': '2', 'stroke-linecap': 'butt', fill: 'none' }) },
  {
    cls: ['ca-hull'],
    decl: (p) => ({ fill: 'none', stroke: p.foreground, 'stroke-width': '1.5', 'stroke-dasharray': '1.5 3', 'stroke-linecap': 'round' }),
  },
  { cls: ['ca-guide'], decl: (p) => ({ stroke: p.guide, 'stroke-width': '0.75', 'stroke-dasharray': '1 3', fill: 'none' }) },
  { cls: ['ca-hair'], decl: (p) => ({ stroke: p.border, 'stroke-width': '0.75' }) },
]

const DROP_ATTRS = /^(class|role|tabindex|aria-.*|data-.*|style)$/i

/** A copy of `svg` with classes resolved to literal attributes; focus rings, the open value control and ARIA removed. */
export function inlineSvg(svg: SVGSVGElement, palette: Palette, style: ExportStyle = 'color'): SVGSVGElement {
  const rules = style === 'academic' ? [...RULES, ...ACADEMIC_RULES] : RULES
  const clone = svg.cloneNode(true) as SVGSVGElement
  for (const ring of [...clone.querySelectorAll('.ca-focus-ring, .ca-lit-ring, .ca-open-ring, .ca-edge-hit, .ca-arc-tip-box, .ca-bars title')]) ring.remove()
  const all = [clone, ...clone.querySelectorAll('*')]
  for (const el of all) {
    const tag = el.tagName.toLowerCase()
    const classes = new Set((el.getAttribute('class') ?? '').split(/\s+/).filter((s) => s !== ''))
    const decl: Record<string, string> = {}
    for (const rule of rules) {
      if (rule.tag !== undefined && rule.tag !== tag) continue
      if (rule.tag === undefined && rule.cls.length === 0) continue
      if (!rule.cls.every((c) => classes.has(c))) continue
      Object.assign(decl, rule.decl(palette))
    }
    for (const name of [...el.getAttributeNames()]) if (DROP_ATTRS.test(name)) el.removeAttribute(name)
    for (const [name, value] of Object.entries(decl)) el.setAttribute(name, value)
  }
  subscriptTextNodes(clone)
  return clone
}

export type ExportTagTone = 'fg' | 'slate' | 'accent' | 'outline' | 'amber'

export interface ExportTag {
  readonly text: string
  readonly tone: ExportTagTone
  readonly mono?: boolean
}

export interface ExportPanel {
  readonly svg: SVGSVGElement
  /** Shown above the graph, like the box head on the page (e.g. After intervention + do(SH=0)). */
  readonly tags?: readonly ExportTag[]
  /** One line under the graph, e.g. a probability. */
  readonly foot?: string
  /** Counterfactual tint behind the panel. */
  readonly tint?: boolean
}

export interface ExportSource {
  /** File name without theme and extension, e.g. `rock-throwing-graph`. */
  readonly name: string
  readonly title: string
  readonly panels: readonly ExportPanel[]
  readonly legend?: string
  /** Short origin citations, e.g. `Hall 2004`; adds the case-source line to the watermark. */
  readonly origin?: string
  /** Full origin citations of a case graph; the academic SVG carries them in its description. */
  readonly originCitations?: readonly string[]
  /** Releases anything drawn only for this export (a graph rendered in another language). */
  readonly dispose?: () => void
}

export interface ExportOptions {
  /** Default `color`. `academic` ignores `theme` and draws no watermark or case-source strip. */
  readonly style?: ExportStyle
  readonly theme: ExportTheme
  /** Link in the watermark. Default https://wayneh.tw/causal/. */
  readonly url?: string
  /** Language of the watermark lines. Default zh-TW; the title, tags and legend come in the source. */
  readonly locale?: Locale
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Math labels use lowered tspans; prose, titles and citations use plain escaping. */
function withSubscripts(text: string): string {
  return subscriptParts(text).map((part) => typeof part === 'string' ? esc(part) :
    `${part.head}<tspan dy="${SUB_DY}" font-size="${SUB_SIZE}">${part.sub}</tspan><tspan dy="-${SUB_DY}">${ZWSP}</tspan>`).join('')
}

/** The same, on the text nodes of a cloned `<text>` tree. */
function subscriptTextNodes(root: Element): void {
  const doc = root.ownerDocument
  const ns = 'http://www.w3.org/2000/svg'
  const walker = doc.createTreeWalker(root, 4)
  const nodes: Text[] = []
  for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
    if (n.parentElement?.closest('text') != null && SUB_IDENT.test(n.nodeValue ?? '')) nodes.push(n as Text)
    SUB_IDENT.lastIndex = 0
  }
  for (const node of nodes) {
    const text = node.nodeValue ?? ''
    const frag = doc.createDocumentFragment()
    let last = 0
    for (const m of text.matchAll(SUB_IDENT)) {
      frag.append(text.slice(last, m.index) + m[1])
      const sub = doc.createElementNS(ns, 'tspan')
      sub.setAttribute('dy', SUB_DY)
      sub.setAttribute('font-size', SUB_SIZE)
      sub.textContent = m[2]
      const back = doc.createElementNS(ns, 'tspan')
      back.setAttribute('dy', `-${SUB_DY}`)
      back.textContent = ZWSP
      frag.append(sub, back)
      last = m.index + m[0].length
    }
    frag.append(text.slice(last))
    node.replaceWith(frag)
  }
}

interface Box {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** The drawing's extent: the viewBox, grown to anything drawn outside it (labels, tags). */
function extent(svg: SVGSVGElement): Box {
  const vb = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number)
  const view: Box =
    vb.length === 4 && vb.every((n) => Number.isFinite(n))
      ? { x: vb[0], y: vb[1], w: vb[2], h: vb[3] }
      : { x: 0, y: 0, w: Number(svg.getAttribute('width') ?? 0), h: Number(svg.getAttribute('height') ?? 0) }
  if (typeof svg.getBBox !== 'function') return view
  try {
    const b = svg.getBBox()
    if (b.width === 0 && b.height === 0) return view
    const pad = 6
    const x = Math.min(view.x, b.x - pad)
    const y = Math.min(view.y, b.y - pad)
    return { x, y, w: Math.max(view.x + view.w, b.x + b.width + pad) - x, h: Math.max(view.y + view.h, b.y + b.height + pad) - y }
  } catch {
    return view
  }
}

const TAG_H = 22
const TAG_SIZE = 12

function tagWidth(t: ExportTag): number {
  return Math.round(textWidth(t.text, TAG_SIZE) + 20)
}

function tagSvg(t: ExportTag, x: number, y: number, p: Palette): string {
  const w = tagWidth(t)
  const [bg, fg, stroke]: [string, string, string | undefined] =
    t.tone === 'fg'
      ? [p.foreground, p.background, undefined]
      : t.tone === 'slate'
        ? [p.slate, p.onSlate, undefined]
        : t.tone === 'accent'
          ? [p.accent, p.accentForeground, undefined]
          : t.tone === 'amber'
            ? [p.amberFill.color, p.amberText, p.amber]
            : ['none', p.foreground, p.foreground]
  const opacity = t.tone === 'amber' ? ` fill-opacity="${p.amberFill.alpha}"` : ''
  const strokeAttr = stroke === undefined ? '' : ` stroke="${stroke}"`
  const family = t.mono === true ? ` font-family="${esc(MONO)}"` : ''
  return (
    `<g transform="translate(${x} ${y})"><rect width="${w}" height="${TAG_H}" fill="${bg}"${opacity}${strokeAttr}/>` +
    `<text x="${w / 2}" y="15.5" text-anchor="middle" font-size="${TAG_SIZE}" font-weight="700" fill="${fg}"${family}>${withSubscripts(t.text)}</text></g>`
  )
}

export interface BuiltSvg {
  readonly svg: string
  readonly width: number
  readonly height: number
}

/** `<title>`, `<desc>` and `<metadata>` carrying the citation of an academic image; none of it is drawn. */
function citationMetadata(source: ExportSource, url: string, locale: Locale): string {
  const m = messagesFor(locale).export
  const desc = [m.citeLead, locale === 'en' ? authorYearEn(url) : authorYear(url), ...(source.originCitations ?? [])].join('\n')
  return `<title>${esc(source.title)}</title><desc>${esc(desc)}</desc><metadata>${esc(bibtex(url))}</metadata>`
}

/** The framed export: title, panels with their tags, legend, and the watermark strip. */
function buildExportSvg(source: ExportSource, options: ExportOptions): BuiltSvg {
  const academic = options.style === 'academic'
  const p = academic ? ACADEMIC_PALETTE : PALETTES[options.theme]
  const url = options.url ?? DEFAULT_URL
  const PAD = 24
  const INNER = 14
  const GAP = 20
  const TITLE = 20
  const title = source.title
  const headH = TITLE + 18

  const panels = source.panels.map((panel) => {
    const box = extent(panel.svg)
    const tags = panel.tags ?? []
    const tagsW = tags.reduce((s, t) => s + tagWidth(t) + 8, 0)
    const footW = panel.foot === undefined ? 0 : textWidth(panel.foot, 13)
    const w = Math.ceil(Math.max(box.w, tagsW, footW) + INNER * 2)
    const h = Math.ceil((tags.length > 0 ? TAG_H + 10 : 0) + box.h + (panel.foot === undefined ? 0 : 26) + INNER * 2)
    return { panel, box, tags, w, h }
  })
  const contentW = panels.reduce((s, x) => s + x.w, 0) + GAP * Math.max(panels.length - 1, 0)
  const contentH = Math.max(0, ...panels.map((x) => x.h))
  const legendH = source.legend === undefined ? 0 : 26

  const locale = options.locale ?? DEFAULT_LOCALE
  const origin = source.origin === undefined || source.origin === '' ? [] : [messagesFor(locale).export.caseSource(source.origin)]
  const lines = academic ? [] : [watermarkLine(url, locale), ...origin]
  const WM_SIZE = 12
  const wmH = academic ? 0 : 14 + lines.length * 18 + 8
  const width = Math.ceil(
    Math.max(
      contentW,
      textWidth(title, TITLE) * 1.05,
      source.legend === undefined ? 0 : textWidth(source.legend, 12),
      ...lines.map((l) => textWidth(l, WM_SIZE)),
    ) +
      PAD * 2,
  )
  const height = Math.ceil(PAD + headH + contentH + legendH + (academic ? 8 : 16) + wmH)

  const parts: string[] = []
  parts.push(`<rect width="${width}" height="${height}" fill="${p.background}"/>`)
  parts.push(
    `<text x="${PAD}" y="${PAD + TITLE - 2}" font-size="${TITLE}" font-weight="900" fill="${p.foreground}">${esc(title)}</text>`,
  )
  let x = PAD + (width - PAD * 2 - contentW) / 2
  const top = PAD + headH
  const serializer = new XMLSerializer()
  for (const { panel, box, tags, w, h } of panels) {
    parts.push(
      `<rect x="${x + 0.5}" y="${top + 0.5}" width="${w - 1}" height="${h - 1}" fill="${panel.tint === true ? p.cf : p.background}" stroke="${p.border}"/>`,
    )
    let y = top + INNER
    let tx = x + INNER
    for (const t of tags) {
      parts.push(tagSvg(t, tx, y, p))
      tx += tagWidth(t) + 8
    }
    if (tags.length > 0) y += TAG_H + 10
    const clone = inlineSvg(panel.svg, p, options.style)
    clone.setAttribute('x', String(x + (w - box.w) / 2))
    clone.setAttribute('y', String(y))
    clone.setAttribute('width', String(box.w))
    clone.setAttribute('height', String(box.h))
    clone.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`)
    clone.setAttribute('overflow', 'visible')
    parts.push(serializer.serializeToString(clone))
    y += box.h
    if (panel.foot !== undefined) {
      parts.push(
        `<text x="${x + INNER}" y="${y + 20}" font-size="13" font-weight="700" font-family="${esc(MONO)}" fill="${p.foreground}">${withSubscripts(panel.foot)}</text>`,
      )
    }
    x += w + GAP
  }
  let y = top + contentH
  if (source.legend !== undefined) {
    parts.push(`<text x="${PAD}" y="${y + 19}" font-size="12" fill="${p.mutedForeground}">${esc(source.legend)}</text>`)
    y += legendH
  }
  if (!academic) {
    const wmTop = height - wmH
    parts.push(`<rect x="0" y="${wmTop}" width="${width}" height="${wmH}" fill="${p.muted}"/>`)
    lines.forEach((line, i) => {
      parts.push(
        `<text x="${PAD}" y="${wmTop + 14 + 12 + i * 18}" font-size="${WM_SIZE}" ${i === 0 ? 'font-weight="700" ' : ''}fill="${i === 0 ? p.foreground : p.mutedForeground}">${esc(line)}</text>`,
      )
    })
  }
  const meta = academic ? citationMetadata(source, url, locale) : ''
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ` +
    `font-family="${esc(SANS)}" font-size="16">${meta}${parts.join('')}</svg>`
  return { svg, width, height }
}

/** Draw the SVG onto a canvas at `scale` and return a PNG. Browser only. */
async function rasterize(built: BuiltSvg, scale = 2): Promise<Blob> {
  const img = new Image()
  img.decoding = 'sync'
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(built.svg)}`
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(built.width * scale)
  canvas.height = Math.round(built.height * scale)
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('canvas 2d context unavailable')
  ctx.scale(scale, scale)
  ctx.drawImage(img, 0, 0, built.width, built.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob === null ? reject(new Error('PNG encoding failed')) : resolve(blob)), 'image/png')
  })
}

/** Build and save the image: `<name>-<theme>.svg` (`-academic` for the academic style) or `.png` (2×), with `-en` for English. */
export async function exportImage(source: ExportSource, options: ExportOptions & { readonly format: ExportFormat }): Promise<void> {
  const built = buildExportSvg(source, options)
  const base = `${source.name}-${options.style === 'academic' ? 'academic' : options.theme}${(options.locale ?? DEFAULT_LOCALE) === 'en' ? '-en' : ''}`
  if (options.format === 'svg') {
    saveFile(`${base}.svg`, built.svg, 'image/svg+xml')
    return
  }
  saveFile(`${base}.png`, await rasterize(built, 2))
}

export { pageTheme } from './page-theme.ts'
