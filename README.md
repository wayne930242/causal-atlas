# causal-atlas

Interactive structural causal models and a dataset of philosophical causation and decision cases.

## Package

`@wayne930242/causal-atlas` (0.1.0, not published) ships ESM with type declarations and one CSS file:

| Import | Contents |
| --- | --- |
| `@wayne930242/causal-atlas` | React components: `CasePage`, `CausalPlayground`, `ProbabilityPanel`, `WorldLanes`, `Supplement` |
| `@wayne930242/causal-atlas/engine` | The causal-model engine |
| `@wayne930242/causal-atlas/data` | The bundled cases: `listCases`, `getCase`, `caseIds`, `loadCase`, the schema |
| `@wayne930242/causal-atlas/style.css` | Styles for the components; import it once |

React 19 is a peer dependency. Importing the components touches no browser globals, so they render on
the server; interaction needs a client island, e.g. in Astro MDX:

```mdx
import { CasePage, WorldLanes } from '@wayne930242/causal-atlas'
import '@wayne930242/causal-atlas/style.css'

<CasePage client:visible caseId="rock-throwing" heading={false} />
<WorldLanes client:visible caseId="rock-throwing" interventions={{ SH: 0 }} actionLabel="攔下 Suzy 的石頭" />
```

The components read only the host's colour tokens (`--background`, `--foreground`, `--accent`,
`--accent-foreground`, `--muted`, `--muted-foreground`, `--border`) and define their own `--ca-*`
colours (slate, amber, green) with dark values under `[data-theme="dark"]`. Fonts inherit; numerals use
`--font-mono` when the host defines it.

A case may give graph positions as `layout: { "ST": [column, row], … }`; only the listed variables are
drawn. Without it the graph shows endogenous variables plus exogenous ones with two or more children,
laid out in layers.

## Scripts

- `pnpm dev`: the demo site (playground, a page per case, a lesson with world lanes)
- `pnpm typecheck`, `pnpm test`, `pnpm lint`
- `pnpm build`: the demo site into `dist-demo/`
- `pnpm build:lib`: the library into `dist/`
