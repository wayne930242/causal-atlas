// Markup baseline of every bundled case: the page steps, the playground, the probability panel and the lanes.
import type { ReactNode } from 'react'
import { listCases } from '../../data/index.ts'
import { CasePage, CausalPlayground, ProbabilityPanel, WorldLanes } from '../index.ts'
import { goldenSuite } from './harness.ts'

const subjects: Record<string, Record<string, () => ReactNode>> = {}
for (const c of listCases()) {
  const caseId = c.data.id
  const variants: Record<string, () => ReactNode> = {}
  for (let step = 1; step <= 4; step += 1) variants[`page-${step}`] = () => <CasePage caseId={caseId} initialStep={step} />
  variants['page-causal'] = () => <CasePage caseId={caseId} initialStep={2} defaultNotation="causal" heading={false} />
  variants.play = () => <CausalPlayground caseId={caseId} />
  variants['play-embedded'] = () => <CausalPlayground caseId={caseId} embedded />
  variants['play-plain'] = () => <CausalPlayground caseId={caseId} presets={false} normality={false} embedUrl={false} defaultNotation="causal" />
  const showcase = c.data.showcase[0]
  if (showcase !== undefined) variants['play-showcase'] = () => <CausalPlayground caseId={caseId} initialInterventions={showcase.interventions} />
  variants['prob-sliders'] = () => <ProbabilityPanel caseId={caseId} />
  variants['prob-compare'] = () => <ProbabilityPanel caseId={caseId} view="compare" />
  for (let step = 1; step <= 3; step += 1) variants[`lanes-${step}`] = () => <WorldLanes caseId={caseId} initialStep={step} />
  subjects[`case:${caseId}`] = variants
}

goldenSuite(import.meta.url, subjects)
