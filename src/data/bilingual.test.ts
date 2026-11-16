import { describe, expect, it } from 'vitest'
import { caseFiles } from './cases.ts'
import { caseIds, getCase } from './index.ts'
import { caseSchema } from './schema.ts'

function seed(id: string): Record<string, unknown> & { [k: string]: any } {
  const raw = caseFiles[`./cases/${id}.json`]
  if (typeof raw !== 'object' || raw === null) throw new Error(`missing seed ${id}`)
  return structuredClone(raw) as Record<string, any>
}

function issues(raw: unknown): string[] {
  const result = caseSchema.safeParse(raw)
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'))
}

describe('bilingual case files', () => {
  it.each(caseIds)('%s has every text in zh-TW and en, marked as draft copy', (id) => {
    const d = getCase(id).data
    const texts = [d.title, d.story, d.explanation, ...(d.subtitle === undefined ? [] : [d.subtitle])]
    if (d.intuition !== undefined) texts.push(d.intuition.text)
    for (const v of d.model.variables) texts.push(v.label)
    for (const t of texts) {
      expect(t['zh-TW']).not.toBe('')
      expect(t.en).not.toBe('')
      expect(t.en).not.toMatch(/[一-鿿]/)
    }
    expect(d.copy_status).toEqual({ 'zh-TW': 'draft', en: 'draft' })
  })

  it('rejects a case missing an English text', () => {
    for (const path of [['story'], ['explanation'], ['title'], ['subtitle']]) {
      const s = seed('rock-throwing')
      let at = s
      for (const key of path) at = at[key]
      delete at.en
      expect(issues(s)).toContain([...path, 'en'].join('.'))
    }
    const intuition = seed('rock-throwing')
    delete intuition.intuition.text.en
    // The intuition is a union of two shapes, so zod reports it at the union.
    expect(issues(intuition)).toContain('intuition')
    const label = seed('rock-throwing')
    delete label.model.variables[0].label.en
    expect(issues(label)).toContain('model.variables.0.label.en')
  })

  it('checks story tags against the story in their own language', () => {
    const s = seed('rock-throwing')
    s.story_tags.en[0].sentence = 'A sentence the story does not have.'
    expect(issues(s)).toContain('story_tags.en.0.sentence')
    const zh = seed('rock-throwing')
    zh.story_tags['zh-TW'][0].sentence = 'Suzy and Billy each pick up a rock.'
    expect(issues(zh)).toContain('story_tags.zh-TW.0.sentence')
  })
})
