// `logic-atlas/modal`: modal-logic figures (Kripke models, frame conditions, strict implication,
// spheres, surgery against similarity), their documents and the modal engine. The engine and the data
// functions need no React; the components render on the server.
import './modal.css'

export type { IntensionTableProps } from './components/IntensionTable.tsx'
export { IntensionTable } from './components/IntensionTable.tsx'
export type { KripkeViewProps } from './components/KripkeView.tsx'
export { KripkeView } from './components/KripkeView.tsx'
export type { FrameConditionsProps } from './components/FrameConditions.tsx'
export { FrameConditions } from './components/FrameConditions.tsx'
export type { StrictImplicationProps } from './components/StrictImplication.tsx'
export { StrictImplication } from './components/StrictImplication.tsx'
export type { TcsCheckProps, TcsItem } from './components/TcsCheck.tsx'
export { TcsCheck } from './components/TcsCheck.tsx'
export type { SphereViewProps } from './components/SphereView.tsx'
export { SphereView } from './components/SphereView.tsx'
export type { SurgeryVsSimilarityProps } from './components/SurgeryVsSimilarity.tsx'
export { SurgeryVsSimilarity } from './components/SurgeryVsSimilarity.tsx'
export type { ModalCommonProps, ModalModelInput } from './components/parts.tsx'

export type { Locale } from '../components/i18n/messages.ts'
export { DEFAULT_LOCALE, LANGUAGE_NAMES, LocaleProvider } from '../components/i18n/messages.ts'

export type { ModalImportResult } from './data/load.ts'
export { MAX_DOC_WORLDS, checkModalDoc, frameOfDoc, modelOfDoc, parseModalJson, similarityOf, structuralEquations } from './data/load.ts'
export type { FrameDoc, FrameDocInput, KripkeDoc, KripkeDocInput, ModalDoc, ModalDocInput, ModalText, SpheresDoc, SpheresDocInput } from './data/schema.ts'
export { frameDocSchema, kripkeDocSchema, modalDocSchema, spheresDocSchema } from './data/schema.ts'

export * from './engine/index.ts'
