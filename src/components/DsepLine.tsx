import type { LoadedCase } from '../data/load.ts'
import type { Assignment } from '../engine/index.ts'
import type { DsepPair, DsepView } from './dsep-view.ts'
import { MAX_PATHS, deltaText, pathReason, pathText } from './dsep-view.ts'
import { useMessages } from './i18n.ts'
import { Tip } from './parts.tsx'
import { Formula, Rich } from './typeset.tsx'

/** The line under the graph: the pair, what is known, open or blocked, δ, and up to three paths with why. */
export function DsepLine({ c, pair, observed, view }: { readonly c: LoadedCase; readonly pair: DsepPair; readonly observed: Assignment; readonly view: DsepView }) {
  const t = useMessages()
  const d = t.dsep
  const ids = c.model.byId
  const { result } = view
  const shown = result.paths.slice(0, MAX_PATHS)
  const known = Object.keys(observed)
  return (
    <div className="ca-dsep-line" data-dsep={result.separated ? 'blocked' : 'open'}>
      <p className="ca-dsep-head">
        <span className="ca-pg-now-kicker">{d.pair(pair[0], pair[1])}</span>{' '}
        <Rich text={d.known(known)} ids={ids} /> → <strong>{result.separated ? d.blocked : d.open}</strong>
{' '}
        <span className="ca-dsep-delta ca-mono">{d.delta(deltaText(view.delta))}</span> <Tip tip={d.tip} label={t.moreInfo} />
      </p>
      <ul className="ca-dsep-paths">
        {result.paths.length === 0 && <li>{d.noPath}</li>}
        {shown.map((p) => (
          <li key={p.nodes.join('-')} data-path-open={p.open ? 'true' : 'false'}>
            <Formula text={pathText(p)} />
            {d.pathSep}
            <Rich text={pathReason(t, p)} ids={ids} />
          </li>
        ))}
        {result.paths.length > MAX_PATHS && <li>{d.more(result.paths.length - MAX_PATHS)}</li>}
      </ul>
    </div>
  )
}
