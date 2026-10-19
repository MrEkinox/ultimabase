// Developer cost of one fixture: non-blank lines per file and occurrences of each schema
// name (identifier or string, rules constants counted separately) outside usage/probe files.
// Usage: node tools/count.mjs <fixture-dir>
import fs from 'node:fs'
import path from 'node:path'
const dir = path.resolve(process.argv[2], 'src')
const skip = new Set(['usage.ts', 'extra.ts', 'completion-probe.ts', 'tag-extra-rules.ts'])
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'))
let total = 0
for (const f of files) {
	const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter((l) => l.trim() !== '').length
	if (!skip.has(f)) total += lines
	console.log(`${f}: ${lines}${skip.has(f) ? ' (not counted)' : ''}`)
}
console.log(`total (declaration + registration files): ${total}`)
const text = files.filter((f) => !skip.has(f)).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n')
for (const name of ['TodoUser', 'TodoRole', 'Todo', 'Tag']) {
	const own = (text.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length
	const rules = (text.match(new RegExp(`\\b${name[0].toLowerCase()}${name.slice(1)}Rules\\b`, 'g')) ?? []).length
	console.log(`${name}: ${own} times${rules ? ` + ${rules} times ${name[0].toLowerCase()}${name.slice(1)}Rules` : ''}`)
}
