import type { Locale } from '../../engine/index.ts'
import type { DocPatch, ModelSource } from './model-info.ts'
import { component } from './registry.ts'
import { deepEqual } from './url-state.ts'

export interface SnippetInput {
  readonly component: Parameters<typeof component>[0]
  readonly source: ModelSource
  readonly patch?: DocPatch
  readonly args: Readonly<Record<string, unknown>>
  readonly lang: Locale
}

export interface Snippet {
  /** The JSX a package user writes. */
  readonly jsx: string
  /** The tag a blog post writes. */
  readonly mdx: string
  /** A comment line above the MDX tag (the import a bundled case needs, or what the blog wrapper leaves out). */
  readonly mdxHeader?: string
}

/** The text the MDX copy button writes: the header comment, then the tag. */
export function mdxText(s: Snippet): string {
  return s.mdxHeader === undefined ? s.mdx : `${s.mdxHeader}\n${s.mdx}`
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** A JS literal: strings double-quoted, bare keys where possible, inline up to 100 characters else one item per line. */
export function literal(value: unknown, depth = 0): string {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  const pad = '  '.repeat(depth + 1)
  const close = '  '.repeat(depth)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map((v) => literal(v, depth + 1))
    const inline = `[${items.join(', ')}]`
    if (inline.length <= 100 && !inline.includes('\n')) return inline
    return `[\n${items.map((i) => `${pad}${i},`).join('\n')}\n${close}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return '{}'
  const items = entries.map(([k, v]) => `${IDENT.test(k) ? k : `'${k}'`}: ${literal(v, depth + 1)}`)
  const inline = `{ ${items.join(', ')} }`
  if (inline.length <= 100 && !inline.includes('\n')) return inline
  return `{\n${items.map((i) => `${pad}${i},`).join('\n')}\n${close}}`
}

function attr(name: string, value: unknown): string {
  if (value === true) return name
  if (typeof value === 'string' && !value.includes('"') && !value.includes('\n')) return `${name}="${value}"`
  return `${name}={${literal(value)}}`
}

/** A one-item pair list reads better as the pair itself. */
function tidy(name: string, value: unknown): unknown {
  return (name === 'pair' || name === 'dsep') && Array.isArray(value) && value.length === 1 ? value[0] : value
}

function tag(name: string, attrs: readonly string[]): string {
  if (attrs.length === 0) return `<${name} />`
  if (attrs.some((a) => a.includes('\n'))) {
    return `<${name}\n${attrs.map((a) => `  ${a.split('\n').join('\n  ')}`).join('\n')}\n/>`
  }
  return `<${name} ${attrs.join(' ')} />`
}

function patchLiteral(patch: DocPatch): string {
  const entries = Object.entries(patch).map(([k, v]) => `${IDENT.test(k) ? k : `'${k}'`}: ${v === null ? 'undefined' : literal(v, 1)}`)
  return `{ ...doc, ${entries.join(', ')} }`
}

const hasPatch = (p: DocPatch | undefined): p is DocPatch => p !== undefined && Object.keys(p).length > 0

/** The props that differ from the component's defaults, in its prop order. */
function propAttrs(input: SnippetInput): string[] {
  const def = component(input.component)
  const out: string[] = []
  for (const prop of def.props) {
    const value = input.args[prop.name]
    if (value === undefined || deepEqual(value, prop.default)) continue
    out.push(attr(prop.name, tidy(prop.name, value)))
  }
  return out
}

export function snippet(input: SnippetInput): Snippet {
  const def = component(input.component)
  const props = propAttrs(input)
  const locale = input.lang === 'en' ? [attr('locale', 'en')] : []
  const { source } = input
  const patched = hasPatch(input.patch)
  const lesson = source.kind === 'lesson'
  const imports = [`import { ${def.jsx} } from 'causal-atlas'`]
  const sourceAttrs: string[] = []
  if (def.id === 'editor') {
    if (source.kind === 'blank') sourceAttrs.push(attr('initial', 'blank'))
    else if (source.kind === 'case' && !patched) sourceAttrs.push(attr('initial', source.id))
    else {
      if (source.kind === 'lesson') imports.push(`import doc from './${source.id}.json'`)
      sourceAttrs.push(`initialDoc={${patched ? patchLiteral(input.patch as DocPatch) : 'doc'}}`)
    }
  } else if (source.kind === 'case' && !patched) sourceAttrs.push(attr('caseId', source.id))
  else if (source.kind !== 'blank') {
    if (lesson) imports.push(`import doc from './${source.id}.json'`)
    else imports.push(`import doc from './${source.id}.json' // caseToDoc(getCase("${source.id}"))`)
    sourceAttrs.push(`doc={${patched ? patchLiteral(input.patch as DocPatch) : 'doc'}}`)
  }
  const jsx = `${imports.join('\n')}\n\n${tag(def.jsx, [...sourceAttrs, ...props, ...locale])}`

  // MDX
  if (def.blog === 'model' && lesson && !patched) {
    const as = def.blogAs === undefined ? [] : [attr('as', def.blogAs)]
    return { jsx, mdx: tag('CausalModel', [attr('id', source.id), ...as, ...props, ...locale]) }
  }
  if (def.blog === 'editor') {
    const kept = def.props.filter((p) => p.name === 'tasks' && input.args[p.name] !== undefined).map((p) => attr(p.name, input.args[p.name]))
    const dropped = [...(source.kind === 'blank' ? [] : ['initial']), ...def.props.filter((p) => p.name !== 'tasks' && input.args[p.name] !== undefined && !deepEqual(input.args[p.name], p.default)).map((p) => p.name)]
    return {
      jsx,
      mdx: tag('CausalModelEditor', [...locale, ...kept]),
      ...(dropped.length === 0 ? {} : { mdxHeader: `{/* the blog wrapper takes only locale and tasks; left out: ${dropped.join(', ')} */}` }),
    }
  }
  const header = `{/* import { ${def.jsx} } from 'causal-atlas' */}`
  const sourceMdx = source.kind === 'case' && !patched ? [attr('caseId', source.id)] : []
  const note =
    patched || (lesson && def.blog !== 'model')
      ? `{/* the blog's CausalModel takes a lesson model as it is; a patched or case-page model needs the document: see the JSX tab */}`
      : undefined
  const tagText = tag(def.jsx, ['client:visible', ...sourceMdx, ...props, ...locale])
  return { jsx, mdx: tagText, mdxHeader: note === undefined ? header : `${header}\n${note}` }
}
