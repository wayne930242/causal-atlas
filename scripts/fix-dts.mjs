// Make tsc's declaration output consumable: relative `.ts`/`.tsx` specifiers become `.js`,
// and side-effect CSS imports (which the bundler moved to style.css) are dropped.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2]
if (root === undefined) throw new Error('usage: fix-dts.mjs <types dir>')

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (path.endsWith('.d.ts')) fix(path)
  }
}

function fix(path) {
  const before = readFileSync(path, 'utf8')
  const after = before
    .replace(/^import ['"][^'"]+\.css['"];?\n/gm, '')
    .replace(/(from\s+|import\()(['"])(\.{1,2}\/[^'"]+?)\.tsx?\2/g, '$1$2$3.js$2')
  if (after !== before) writeFileSync(path, after)
}

walk(root)
