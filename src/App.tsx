import { caseFiles } from './data/cases.ts'
import { loadCase } from './data/load.ts'

const cases = Object.values(caseFiles).map((raw) => loadCase(raw).data)

/** Placeholder until the designed UI lands: lists the loaded case ids. */
export function App() {
  return (
    <main>
      <h1>causal-atlas</h1>
      <ul>
        {cases.map((c) => (
          <li key={c.id}>{c.id}</li>
        ))}
      </ul>
    </main>
  )
}
