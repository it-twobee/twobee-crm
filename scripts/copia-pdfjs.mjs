// §415 — Il worker di pdf.js si serve da `public/`, non dal bundle: il
// minificatore di Next 14 lo tratta come script classico e si ferma su
// `import.meta` («cannot be used outside of module code»). Si copia prima di
// `dev` e di `build`, con la versione nel percorso, così una versione nuova
// non si trova in cache quella vecchia.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = dirname(require.resolve('pdfjs-dist/package.json'))
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const target = join('public', 'pdfjs', version)
mkdirSync(target, { recursive: true })
copyFileSync(join(root, 'build', 'pdf.worker.min.mjs'), join(target, 'pdf.worker.min.mjs'))
console.log(`pdf.js ${version}: worker in ${target}`)
