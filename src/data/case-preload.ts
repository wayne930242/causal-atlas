// Every case file, ready before the first render. The library build publishes this module as the `node`
// target of `#case-preload` (package.json `imports`), so a server render has the case the components
// draw without waiting; browsers get `case-preload-browser.ts` and load one case at a time. The demo
// site and the tests import this module directly.
export { caseFiles as preloadedCaseFiles } from './cases.ts'
