# logic-atlas

Interactive structural causal models and a dataset of philosophical causation and decision cases.

[**Live demo**][demo] · [Component explorer][explorer] · [npm][npm]

## What it is

- A causal-model engine that solves structural equations, computes interventions and counterfactuals, and checks actual causation.
- React components for embedding interactive causal graphs or building and editing models.
- A bundled case dataset with stories, models, verdicts, and sources.
- Modal-logic figures (Kripke models, frame conditions, spheres) for a modal-logic lesson series.
- A Traditional Chinese (`zh-TW`) and English (`en`) interface and bilingual case text.

## Install

```sh
pnpm add logic-atlas react react-dom
```

For equations, add `katex` to the app and load `katex/dist/katex.min.css` once if the site does not already load it.

With React configured in Astro, embed a bundled case in MDX:

```mdx
import { CasePage } from 'logic-atlas/causal'
import 'logic-atlas/causal/style.css'

<CasePage client:visible caseId="rock-throwing" locale="en" />
```

## Entries

There is no root export: choose `logic-atlas/causal` or `logic-atlas/modal` explicitly. `logic-atlas/set` is reserved, not published.

| Import | Contents |
| --- | --- |
| `logic-atlas/causal` | React components: `CasePage`, `CausalPlayground`, `ConservativeExtension`, `IdentifyPanel`, `ModelEditor`, `ProbabilityPanel`, `WorldLanes`, `Supplement`, `CiteBlock`; `LocaleProvider`; `preloadCase` |
| `logic-atlas/causal/playground` | `CausalPlayground`, `preloadCase` |
| `logic-atlas/causal/probability` | `ProbabilityPanel`, `preloadCase` |
| `logic-atlas/causal/identify` | `IdentifyPanel`, `preloadCase` |
| `logic-atlas/causal/lanes` | `WorldLanes`, `preloadCase` |
| `logic-atlas/causal/extension` | `ConservativeExtension`, `preloadCase` |
| `logic-atlas/causal/case` | `CasePage`, `preloadCase` |
| `logic-atlas/causal/editor` | `ModelEditor` (it lists every case, so it carries the whole dataset) |
| `logic-atlas/causal/cite`, `logic-atlas/causal/supplement`, `logic-atlas/causal/i18n` | `CiteBlock`; `Supplement`; `LocaleProvider`, `DEFAULT_LOCALE`, `LANGUAGE_NAMES` |
| `logic-atlas/causal/engine` | The causal-model engine |
| `logic-atlas/causal/data` | The bundled cases: `listCases`, `getCase`, `caseIds`, `loadCase`, the schemas; model documents: `caseToDoc`, `docToCase`, `parseModelJson`, `encodeShare`, `decodeShare`, `sameModel` |
| `logic-atlas/modal` | Modal-logic figures: `IntensionTable`, `KripkeView`, `FrameConditions`, `StrictImplication`, `TcsCheck`, `SphereView`, `SurgeryVsSimilarity`; `parseModalJson`; the modal engine (see [Modal logic figures](docs/components.md#modal-logic-figures)) |
| `logic-atlas/causal/style.css` | Styles for the components; import it once |
| `logic-atlas/modal/style.css` | Styles for the modal figures, loaded with `style.css` |

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

Please cite logic-atlas when using it for research or teaching.
The citation is also available in [CITATION.cff](CITATION.cff) and the `CiteBlock` component.

> 洪偉（Wei Hung）（2026）。logic-atlas（0.25.1 版）。https://github.com/wayne930242/logic-atlas

> Hung, W. (2026). logic-atlas (Version 0.25.1) [Software and dataset]. https://github.com/wayne930242/logic-atlas

```bibtex
@software{hung_causal_atlas_2026,
  author  = {Hung, Wei},
  title   = {logic-atlas},
  year    = {2026},
  version = {0.25.1},
  url     = {https://github.com/wayne930242/logic-atlas},
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

[demo]: https://wayne930242.github.io/logic-atlas/
[explorer]: https://wayne930242.github.io/logic-atlas/#/explorer
[npm]: https://www.npmjs.com/package/logic-atlas
