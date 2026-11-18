import type { ReactNode } from 'react'
import { CausalPlayground } from '../components/index.ts'
import { lessonModel } from './lesson-models.ts'

/**
 * The lesson figures with the interactions of 0.4.0, one section per item
 * (`#/interactions/<item>`, or all of them). Labels are the lessons' own, in Chinese.
 */
const ITEMS: Readonly<Record<string, () => ReactNode>> = {
  'step-chips': () => (
    <>
      <CausalPlayground
        doc={lessonModel('m00-firing-squad-nervous')}
        presets={[
          { label: '第 1 步：看到 A 沒開槍', observed: { A: 0 } },
          { label: '第 2 步：攔住 A', interventions: { A: 0 } },
        ]}
      />
      <CausalPlayground caseId="forest-fire-disjunctive" presets={[{ label: '見證：固定 MD=0，L 改成 0', interventions: { L: 0 }, hold: { MD: 0 } }]} />
    </>
  ),
}

export function Interactions({ item }: { readonly item: string }) {
  const shown = item in ITEMS ? [item] : Object.keys(ITEMS)
  return (
    <div className="demo-article">
      {shown.map((key) => (
        <section key={key} id={key} data-item={key}>
          <h2>{key}</h2>
          {ITEMS[key]()}
        </section>
      ))}
    </div>
  )
}
