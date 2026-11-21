import { Tex } from './Tex.tsx'

/** The same expected-utility definition in the decision chart and the case supplement. */
export function ExpectedUtility({ theory }: { readonly theory: 'EDT' | 'CDT' }) {
  const acts = theory === 'EDT' ? 'a' : '\\operatorname{do}(a)'
  const plain = theory === 'EDT' ? 'a' : 'do(a)'
  return <Tex tex={`EU_{\\mathrm{${theory}}}(a)=\\sum P(o\\mid ${acts})\\cdot U(o)`} text={`EU_${theory}(a) = Σ P(o | ${plain}) · U(o)`} />
}
