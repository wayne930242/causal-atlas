import { Component, useMemo } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { CasePage, CausalPlayground, CiteBlock, ModelEditor, ProbabilityPanel, WorldLanes } from '../../components/index.ts'
import { problemOf } from '../../engine/index.ts'
import { sourceDoc, sourceProps } from './model-info.ts'
import type { ExplorerState } from './url-state.ts'

type Loose = ComponentType<Record<string, unknown>>
const Playground = CausalPlayground as unknown as Loose
const Probability = ProbabilityPanel as unknown as Loose
const Lanes = WorldLanes as unknown as Loose
const Case = CasePage as unknown as Loose
const Editor = ModelEditor as unknown as Loose
const Cite = CiteBlock as unknown as Loose

/** The figure for a state: the public component, composed as a host would, with the explorer's args as props. */
export function Figure({ state }: { readonly state: ExplorerState }) {
  const { component, source, patch, args } = state
  const props = useMemo(() => sourceProps(source, patch), [source, patch])
  const initialDoc = useMemo(() => sourceDoc(source, patch), [source, patch])
  // Props are the registry's own names, taken from a story or typed in the controls; the component rejects a wrong one.
  const a: Record<string, unknown> = args
  switch (component) {
    case 'cite':
      return <Cite {...a} />
    case 'editor':
      return source.kind === 'blank' || source.kind === 'case' && patch === undefined ? (
        <Editor {...a} initial={source.kind === 'blank' ? 'blank' : source.id} syncUrl={false} hash="" />
      ) : (
        <Editor {...a} initialDoc={initialDoc} syncUrl={false} hash="" />
      )
    case 'case':
      if (source.kind !== 'case') throw new Error('CasePage takes a bundled case.')
      return <Case {...a} caseId={source.id} />
    case 'playground':
      if (props === undefined) throw new Error('Pick a model.')
      return <Playground {...props} {...a} />
    case 'probability':
      if (props === undefined) throw new Error('Pick a model.')
      return <Probability {...props} {...a} />
    case 'lanes':
      if (props === undefined) throw new Error('Pick a model.')
      return <Lanes {...props} {...a} />
  }
}

interface BoundaryProps {
  readonly resetKey: string
  readonly title: string
  readonly children: ReactNode
}

/** Shows what a component threw (and its problem code) in place of the figure; the next state clears it. */
export class FigureBoundary extends Component<BoundaryProps, { error?: unknown; key: string }> {
  state: { error?: unknown; key: string } = { key: this.props.resetKey }

  static getDerivedStateFromError(error: unknown): { error: unknown } {
    return { error }
  }

  static getDerivedStateFromProps(props: BoundaryProps, state: { error?: unknown; key: string }): { error?: undefined; key: string } | null {
    return props.resetKey === state.key ? null : { error: undefined, key: props.resetKey }
  }

  render(): ReactNode {
    const { error } = this.state
    if (error === undefined) return this.props.children
    const message = error instanceof Error ? error.message : String(error)
    const code = problemOf(error)?.code
    return (
      <div className="ex-alert" role="alert" data-code={code}>
        <strong>{this.props.title}</strong>
        <p>{message}</p>
        {code !== undefined && <code className="ex-code">{code}</code>}
      </div>
    )
  }
}
