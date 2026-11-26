# causal-atlas

Interactive structural causal models and a dataset of philosophical causation and decision cases.

[**Live demo**][demo] · [Component explorer][explorer] · [npm][npm]

## What it is

- A causal-model engine that solves structural equations, computes interventions and counterfactuals, and checks actual causation.
- React components for embedding interactive causal graphs or building and editing models.
- A bundled case dataset with stories, models, verdicts, and sources.
- A Traditional Chinese (`zh-TW`) and English (`en`) interface and bilingual case text.

## Install

```sh
pnpm add causal-atlas react react-dom
```

For equations, add `katex` to the app and load `katex/dist/katex.min.css` once if the site does not already load it.

With React configured in Astro, embed a bundled case in MDX:

```mdx
import { CasePage } from 'causal-atlas'
import 'causal-atlas/style.css'

<CasePage client:visible caseId="rock-throwing" locale="en" />
```

## Entries

| Import | Contents |
| --- | --- |
| `causal-atlas` | React components: `CasePage`, `CausalPlayground`, `ConservativeExtension`, `IdentifyPanel`, `ModelEditor`, `ProbabilityPanel`, `WorldLanes`, `Supplement`, `CiteBlock`; `LocaleProvider`; `preloadCase` |
| `causal-atlas/playground` | `CausalPlayground`, `preloadCase` |
| `causal-atlas/probability` | `ProbabilityPanel`, `preloadCase` |
| `causal-atlas/identify` | `IdentifyPanel`, `preloadCase` |
| `causal-atlas/lanes` | `WorldLanes`, `preloadCase` |
| `causal-atlas/extension` | `ConservativeExtension`, `preloadCase` |
| `causal-atlas/case` | `CasePage`, `preloadCase` |
| `causal-atlas/editor` | `ModelEditor` (it lists every case, so it carries the whole dataset) |
| `causal-atlas/cite`, `/supplement`, `/i18n` | `CiteBlock`; `Supplement`; `LocaleProvider`, `DEFAULT_LOCALE`, `LANGUAGE_NAMES` |
| `causal-atlas/engine` | The causal-model engine |
| `causal-atlas/data` | The bundled cases: `listCases`, `getCase`, `caseIds`, `loadCase`, the schemas; model documents: `caseToDoc`, `docToCase`, `parseModelJson`, `encodeShare`, `decodeShare`, `sameModel` |
| `causal-atlas/style.css` | Styles for the components; import it once |

## Documentation

- [Components and API](docs/components.md): server rendering, case loading, and component props.
- [Changelog](CHANGELOG.md): changes by release.

## Development

- `pnpm dev`: run the demo site locally.
- `pnpm typecheck`, `pnpm test`, `pnpm lint`: check types, run tests, and lint the code.
- `pnpm build`: build the demo site into `dist-demo/`.
- `pnpm build:lib`: build the library into `dist/` and run `pnpm check:dist`.
- `pnpm check:dist`: check package size budgets and server rendering.

## Citation

Please cite causal-atlas when using it for research or teaching.
The citation is also available in [CITATION.cff](CITATION.cff) and the `CiteBlock` component.

> 洪偉（Wei Hung）（2026）。causal-atlas（0.24.3 版）。https://wayneh.tw/causal/

> Hung, W. (2026). causal-atlas (Version 0.24.3) [Software and dataset]. https://wayneh.tw/causal/

```bibtex
@software{hung_causal_atlas_2026,
  author  = {Hung, Wei},
  title   = {causal-atlas},
  year    = {2026},
  version = {0.24.3},
  url     = {https://wayneh.tw/causal/},
  note    = {Code: MIT; data and teaching text: CC BY 4.0}
}
```

## License

- Code: [MIT](LICENSE), copyright Wei Hung (洪偉).
- Case data (`src/data/cases/`) and teaching text: [CC BY 4.0](LICENSE-DATA), including when bundled in `dist/*.js`.
  When reusing either, credit 洪偉（Wei Hung） and cite the source.
- `package.json` declares `MIT AND CC-BY-4.0`.
- Most cases are adapted from published papers, books, court decisions and news reports, which each case lists in its `sources`.
  Those works belong to their authors; CC BY 4.0 covers only this dataset's own wording, models and teaching text.
  When reusing a case, credit its original sources as well.

[demo]: https://wayne930242.github.io/causal-atlas/
[explorer]: https://wayne930242.github.io/causal-atlas/#/explorer
[npm]: https://www.npmjs.com/package/causal-atlas
