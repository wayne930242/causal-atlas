// Server rendering from the built package, as a host such as Astro runs it under Node: each component
// entry renders a bundled case by id with the figure in the markup, because `#case-preload` resolves to
// every case under Node. Run after `pnpm build:lib`: `node scripts/check-dist-ssr.mjs`.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

const { preloadedCaseFiles } = await import('#case-preload')
if (preloadedCaseFiles === undefined || Object.keys(preloadedCaseFiles).length === 0) {
  throw new Error('#case-preload resolved to the browser target under Node')
}

const checks = [
  ['causal-atlas', 'CausalPlayground', { caseId: 'rock-throwing' }, 'ca-graph'],
  ['causal-atlas/playground', 'CausalPlayground', { caseId: 'rock-throwing' }, 'ca-graph'],
  ['causal-atlas/probability', 'ProbabilityPanel', { caseId: 'smoking-lesion', view: 'compare' }, 'data-level'],
  ['causal-atlas/identify', 'IdentifyPanel', { caseId: 'smoking-lesion' }, 'ca-identify'],
  ['causal-atlas/lanes', 'WorldLanes', { caseId: 'rock-throwing', interventions: { SH: 0 }, initialStep: 2 }, 'data-lane="cf"'],
  ['causal-atlas/case', 'CasePage', { caseId: 'rock-throwing', initialStep: 3 }, 'ca-graph'],
  ['causal-atlas/extension', 'ConservativeExtension', { models: ['rock-throwing', 'rock-throwing'] }, 'ca-graph'],
  ['causal-atlas/editor', 'ModelEditor', { initial: 'rock-throwing' }, 'ca-editor'],
]

const failures = []
for (const [entry, name, props, expected] of checks) {
  const mod = await import(entry)
  const html = renderToString(createElement(mod[name], props))
  if (!html.includes(expected)) failures.push(`${entry} ${name}: markup lacks ${expected}`)
}
if (failures.length > 0) {
  console.error(`server render check failed:\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
console.log(`server render check passed (${checks.length} entries)`)
