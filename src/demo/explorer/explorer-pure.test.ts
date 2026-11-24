import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LESSON_MODELS } from '../lesson-models.ts'
import { BLOG_DIFFERS, modelInfo, parseSource } from './model-info.ts'
import { COMPONENTS, EDITOR_PARAMS, RESERVED } from './registry.ts'
import { mdxText, snippet } from './snippet.ts'
import { STORIES, getStory } from './stories.ts'
import { basicState, deepEqual, parseHash, serialize, storyState } from './url-state.ts'

const state = (id: string, lang: 'zh-TW' | 'en' = 'zh-TW') => storyState(getStory(id) ?? STORIES[0], lang)
const snip = (id: string, lang: 'zh-TW' | 'en' = 'zh-TW') => snippet(state(id, lang))

describe('registry', () => {
  it('keeps explorer parameters apart from the editor’s', () => {
    for (const name of RESERVED) expect(EDITOR_PARAMS).not.toContain(name)
    for (const c of COMPONENTS) for (const p of c.props) {
      expect(RESERVED).not.toContain(p.name)
      expect(EDITOR_PARAMS).not.toContain(p.name)
    }
  })
  it('has every story prop in its component', () => {
    for (const s of STORIES) {
      const names = COMPONENTS.find((c) => c.id === s.component)?.props.map((p) => p.name) ?? []
      for (const k of Object.keys(s.args)) expect(names, `${s.id}.${k}`).toContain(k)
    }
  })
  it('covers every Interactions item', () => {
    const src = readFileSync(new URL('../Interactions.tsx', import.meta.url), 'utf8')
    const items = [...src.matchAll(/^ {2}'?([a-z-]+)'?: \(\) =>/gm)].map((m) => m[1])
    expect(items.length).toBe(20)
    for (const item of items) expect(STORIES.some((s) => s.item === item), item).toBe(true)
  })
  it('has unique story ids', () => {
    expect(new Set(STORIES.map((s) => s.id)).size).toBe(STORIES.length)
  })
})

describe('url-state', () => {
  it('round-trips every story, in both languages', () => {
    for (const s of STORIES) for (const lang of ['zh-TW', 'en'] as const) {
      const a = storyState(s, lang, lang === 'en' ? 'dark' : 'light')
      const { state: b, notices } = parseHash(serialize(a))
      expect(notices, s.id).toEqual([])
      expect(b, s.id).toEqual(a)
    }
  })
  it('round-trips edits, removed story props and a changed model', () => {
    const base = state('mediation')
    const edited = { ...base, story: base.story, args: { ...base.args, initialStep: 3, digits: undefined } }
    delete (edited.args as Record<string, unknown>).digits
    const { state: back } = parseHash(serialize(edited))
    expect(back.args).toEqual(edited.args)
    const free = { ...basicState('playground'), source: parseSource('lesson:m08-pill') ?? { kind: 'blank' as const } }
    expect(parseHash(serialize(free)).state).toEqual(free)
    const unpatched = { ...state('cut-graphs'), patch: undefined }
    expect(parseHash(serialize(unpatched)).state.patch).toBeUndefined()
  })
  it('puts the initial step in the hash', () => {
    const hash = serialize({ ...state('mediation'), args: { ...state('mediation').args, initialStep: 3 } })
    expect(hash).toContain('initialStep=3')
    expect(hash).not.toMatch(/[?&](case|model|do|pdo)=/)
  })
  it('falls back with a notice on bad input', () => {
    const json = parseHash('#/explorer?c=probability&s=mediation&mediation=%7Bnope')
    expect(json.notices.map((n) => n.code)).toEqual(['value'])
    expect(json.state.args.mediation).toEqual(state('mediation').args.mediation)
    expect(parseHash('#/explorer?c=probability&src=lesson:nope').notices[0]?.code).toBe('model')
    expect(parseHash('#/explorer?c=zzz').state.component).toBe('playground')
    expect(parseHash('#/explorer?c=playground&digits=abc').notices[0]?.code).toBe('value')
    expect(parseHash('#/explorer?c=playground&bogus=1').notices[0]?.code).toBe('param')
    expect(parseHash('#/explorer?c=case&src=lesson:m08-pill').notices[0]?.code).toBe('model')
  })
  it('deepEqual compares structure', () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true)
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false)
  })
})

describe('snippet', () => {
  it('(a) writes the mediation story as CausalModel', () => {
    expect(snip('mediation').mdx).toBe(
      '<CausalModel id="m08-pill" as="probability" view="mediation" mediation={{ treatment: "X", mediators: ["Z"], outcome: "Y=1", from: 0, to: 1 }} digits={4} />',
    )
  })
  it('(b) writes the first cf-stepper figure', () => {
    expect(snip('cf-stepper').mdx).toBe(
      '<CausalModel id="m00-firing-squad-nervous" as="probability" view="counterfactual" counterfactual={{ evidence: "D=1", do: { A: 0 }, event: "D=0" }} actionLabel="已知囚犯死了；若 A 沒開槍？" />',
    )
  })
  it('(c) writes a bundled case with client:visible', () => {
    const s = snip('responsibility-4')
    expect(s.mdx).toBe(
      '<CausalPlayground client:visible caseId="forest-fire-disjunctive" verdicts={[{ cause: "L=1", effect: "FF=1", responsibility: true }]} />',
    )
    expect(mdxText(s)).toContain("import { CausalPlayground } from 'causal-atlas'")
  })
  it('(d) adds locale="en" for English only', () => {
    expect(snip('mediation', 'en').mdx).toMatch(/ locale="en" \/>$/)
    expect(snip('mediation').mdx).not.toContain('locale')
  })
  it('(e) writes both imports for a lesson document', () => {
    expect(snip('mediation').jsx).toBe(
      `import { ProbabilityPanel } from 'causal-atlas'\nimport doc from './m08-pill.json'\n\n<ProbabilityPanel doc={doc} view="mediation" mediation={{ treatment: "X", mediators: ["Z"], outcome: "Y=1", from: 0, to: 1 }} digits={4} />`,
    )
  })
  it('leaves defaults out, collapses one-item pair lists and spreads a patch', () => {
    expect(snip('confound-slider').mdx).toBe('<CausalPlayground client:visible caseId="smoking-lesion" sliders={["N_S1"]} decision />')
    expect(snip('dsep').jsx).toContain('dsep={["G", "M"]}')
    expect(snip('cut-graphs').jsx).toContain('doc={{ ...doc, latent_as_arcs: ["U"] }}')
  })
  it('breaks long values over lines', () => {
    expect(snip('cut-graphs').jsx).toContain('\n  rules={[\n')
  })
  it('writes the editor for the blog with only locale and tasks', () => {
    const s = snippet({ ...basicState('editor'), lang: 'en', args: { digits: 3 } })
    expect(s.mdx).toBe('<CausalModelEditor locale="en" />')
    expect(s.mdxHeader).toContain('digits')
  })
})

describe('model-info', () => {
  it('reads a values model', () => {
    const info = modelInfo({ kind: 'lesson', id: 'm10-vote-5-0' })
    expect(info?.kind).toBe('values')
    expect(info?.endogenous).toContain('W')
    expect(info?.variables.find((v) => v.id === 'V1')?.values).toEqual([0, 1])
  })
  it('reads a probability model', () => {
    const info = modelInfo({ kind: 'lesson', id: 'm08-pill' })
    expect(info?.kind).toBe('probability')
    expect(info?.endogenous).toEqual(expect.arrayContaining(['X', 'Z', 'Y']))
    expect(info?.sliderable.length).toBeGreaterThan(0)
  })
  it('applies a patch', () => {
    expect(modelInfo({ kind: 'lesson', id: 'm00-firing-squad-nervous' }, { context: { U: false, W: true }, priors: null })?.kind).toBe('values')
  })
  it('lists the lesson models that differ from the blog only when the blog is present', () => {
    for (const id of BLOG_DIFFERS) expect(LESSON_MODELS[id]).toBeDefined()
    const dir = `${process.env.HOME}/knowledge-base/blog/src/data/causal/models`
    if (!existsSync(dir)) return
    const differs = Object.keys(LESSON_MODELS).filter((id) => {
      const file = `${dir}/${id}.json`
      return existsSync(file) && !deepEqual(JSON.parse(readFileSync(file, 'utf8')), LESSON_MODELS[id])
    })
    expect(differs.sort()).toEqual([...BLOG_DIFFERS].sort())
  })
})
