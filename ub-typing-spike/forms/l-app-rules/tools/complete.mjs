// Completion names at `find` + offset (default: end of find) in a fixture file.
// Usage: node tools/complete.mjs <fixture-dir> <file> <find> [offset]
import path from 'node:path'
import { createService } from './probe.mjs'
const [dir, file, find, offset] = process.argv.slice(2)
const ls = createService(path.resolve(dir))
const full = path.resolve(dir, file)
const text = ls.text(full)
const index = text.indexOf(find.replace(/\\n/g, '\n').replace(/\\t/g, '\t'))
if (index < 0) throw new Error('marker not found')
const pos = index + (offset ? Number(offset) : find.replace(/\\n/g, '\n').replace(/\\t/g, '\t').length)
const result = ls.service.getCompletionsAtPosition(full, pos, {})
console.log((result?.entries ?? []).filter((e) => e.kind !== 'keyword').map((e) => `${e.name}`).join(', ') || '(none)')
