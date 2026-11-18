// Markup baseline of every lesson model document (src/demo/lesson-models) through the public components.
import type { ReactNode } from 'react'
import { LESSON_MODELS } from '../../demo/lesson-models.ts'
import { CausalPlayground, ProbabilityPanel, WorldLanes } from '../index.ts'
import { goldenSuite } from './harness.ts'

const subjects: Record<string, Record<string, () => ReactNode>> = {}
for (const [id, doc] of Object.entries(LESSON_MODELS)) {
  subjects[`lesson:${id}`] = {
    play: () => <CausalPlayground doc={doc} />,
    'play-causal': () => <CausalPlayground doc={doc} defaultNotation="causal" presets={false} />,
    'prob-sliders': () => <ProbabilityPanel doc={doc} />,
    'prob-compare': () => <ProbabilityPanel doc={doc} view="compare" />,
    'lanes-1': () => <WorldLanes doc={doc} initialStep={1} />,
    'lanes-2': () => <WorldLanes doc={doc} initialStep={2} />,
  }
}

goldenSuite(import.meta.url, subjects)
