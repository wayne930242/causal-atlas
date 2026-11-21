import { describe, expect, it } from 'vitest'
import { docToCase } from '../../data/index.ts'
import type { DPath } from '../../engine/index.ts'
import { LESSON_MODELS } from '../../demo/lesson-models.ts'
import { EN } from '../i18n/en.ts'
import { ZH } from '../i18n/zh.ts'
import type { PathMarks } from './dsep-view.ts'
import { dsepView, edgeTipText } from './dsep-view.ts'

const sprinkler = (): ReturnType<typeof docToCase> => {
  const doc = LESSON_MODELS['m04-sprinkler-cpt']
  if (doc === undefined) throw new Error('no m04-sprinkler-cpt')
  return docToCase(doc)
}

const tip = (marks: PathMarks, key: string, t = ZH): string => edgeTipText(t, marks, key, marks.open.has(key) ? 'open' : 'blocked')

describe('an edge tip names its paths and says why each is open or blocked', () => {
  it('lesson 04 sprinkler: the collider, its descendant, and the fork in the lesson’s words', () => {
    const c = sprinkler()
    const none = dsepView(c, ['S', 'R'], {}, {}, {}).marks
    expect(tip(none, 'S>W')).toBe('虛線：路徑 S → W ← R 在 W 被堵住。W 是對撞點，W 和它的後代 F 都未知。')
    expect(tip(none, 'S>W', EN)).toBe('Dashed line: The path S → W ← R is blocked at W: W is a collider, and W and its descendant F are unknown.')
    expect(tip(none, 'C>S')).toBe('紅色粗線：路徑 S ← C → R 暢通。中間點 C 未知。')
    const season = dsepView(c, ['S', 'R'], { C: 1 }, {}, {}).marks
    expect(tip(season, 'C>R')).toBe('虛線：路徑 S ← C → R 在 C 被堵住。C 是叉的中間點，已知。')
    expect(tip(season, 'C>R', EN)).toBe('Dashed line: The path S ← C → R is blocked at C: C is the middle of a fork, and it is known.')
    const wet = dsepView(c, ['S', 'R'], { F: 1 }, {}, {}).marks
    expect(tip(wet, 'R>W')).toBe('紅色粗線：路徑 S → W ← R 暢通。對撞點 W 的後代 F 已知。')
  })

  it('a chain middle, and more than two paths: two named, then the count', () => {
    const e = (from: string, to: string) => ({ from, to })
    const chain = (m: string): DPath => ({ nodes: ['X', m, 'Y'], edges: [e('X', m), e(m, 'Y')], open: false, blockedBy: m, kind: 'known' })
    const direct: DPath = { nodes: ['X', 'Y'], edges: [e('X', 'Y')], open: true, opened: [] }
    const marks: PathMarks = { open: new Set(['X>Y']), blocked: new Set(['X>A', 'X>B', 'X>D']), ends: ['X', 'Y'], paths: [direct, chain('A'), chain('B'), chain('D')] }
    // Each of the three blocked paths runs through its own first edge; give them a shared one to list them together.
    const shared: PathMarks = { ...marks, paths: marks.paths.map((p) => (p.open ? p : { ...p, edges: [e('X', 'Q'), ...p.edges.slice(1)] })) }
    expect(tip(marks, 'X>A')).toBe('虛線：路徑 X → A → Y 在 A 被堵住。A 是鏈的中間點，已知。')
    expect(tip({ ...shared, blocked: new Set(['X>Q']) }, 'X>Q')).toBe(
      '虛線：路徑 X → A → Y 在 A 被堵住。A 是鏈的中間點，已知。路徑 X → B → Y 在 B 被堵住。B 是鏈的中間點，已知。等 3 條。',
    )
    expect(tip(marks, 'X>Y', EN)).toBe('Thick red line: The path X → Y is open: its two ends are directly joined.')
  })
})
