// Markup baseline of the demo's interaction page, one subject per item, and the editor, citation and supplement.
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Interactions } from '../../demo/Interactions.tsx'
import { lessonModel } from '../../demo/lesson-models.ts'
import { CiteBlock, ModelEditor, Supplement } from '../index.ts'
import { goldenSuite } from './harness.ts'

/** The item keys, read from the page that shows them all. */
const items = [...renderToStaticMarkup(<Interactions item="" />).matchAll(/data-item="([^"]+)"/g)].map((m) => m[1])

const subjects: Record<string, Record<string, () => ReactNode>> = {
  interactions: Object.fromEntries(items.map((item) => [item, () => <Interactions item={item} />])),
  editor: {
    blank: () => <ModelEditor initial="blank" />,
    default: () => <ModelEditor />,
    'rock-throwing': () => <ModelEditor initial="rock-throwing" />,
    newcomb: () => <ModelEditor initial="newcomb" defaultNotation="causal" />,
    'no-sync': () => <ModelEditor initial="forest-fire-conjunctive" syncUrl={false} hash="#model=1.abc" />,
    doc: () => <ModelEditor initialDoc={lessonModel('m05-backdoor')} />,
    extras: () => (
      <ModelEditor
        initial="rock-throwing"
        caseLinks={{ 'rock-throwing': [{ href: '/causal/lessons/08/', title: '第 8 課' }] }}
        extraModels={[{ id: 'm05-backdoor', title: '後門', doc: lessonModel('m05-backdoor') }]}
        modelsLabel="課程模型"
      />
    ),
    'extra-initial': () => <ModelEditor initial="m05-backdoor" extraModels={[{ id: 'm05-backdoor', title: { 'zh-TW': '後門', en: 'Back door' }, group: '講義', doc: lessonModel('m05-backdoor') }]} />,
  },
  cite: {
    default: () => <CiteBlock />,
    url: () => <CiteBlock url="https://example.org/causal/" />,
  },
  supplement: {
    closed: () => <Supplement title="標題">內文</Supplement>,
    open: () => (
      <Supplement title="標題" kicker="" defaultOpen className="x">
        內文
      </Supplement>
    ),
  },
}

goldenSuite(import.meta.url, subjects)
