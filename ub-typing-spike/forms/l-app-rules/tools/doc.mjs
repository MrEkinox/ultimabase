// JSDoc shown by the hover at `find` (+offset). Usage: node tools/doc.mjs <dir> <file> <find> [offset]
import path from 'node:path'
import { createService } from './probe.mjs'
const [dir, file, find, offset] = process.argv.slice(2)
const ls = createService(path.resolve(dir))
const full = path.resolve(dir, file)
const info = ls.service.getQuickInfoAtPosition(full, ls.text(full).indexOf(find) + Number(offset ?? 0))
console.log(JSON.stringify((info?.documentation ?? []).map((d) => d.text).join('') || '(no documentation)'), JSON.stringify((info?.tags ?? []).map((t) => `@${t.name} ${(t.text ?? []).map((x) => x.text).join('')}`)))
