// Medians of tools/editbench.mjs or tools/measure.mjs JSON lines.
// Usage: node tools/summarize-editbench.mjs <file.jsonl>...
import process from 'node:process'
import console from 'node:console'
import fs from 'node:fs'

const rows = process.argv
	.slice(2)
	.flatMap((file) => fs.readFileSync(file, 'utf8').split('\n'))
	.filter((line) => line.startsWith('{'))
	.map((line) => JSON.parse(line))
const median = (values) => {
	const sorted = values
		.filter((v) => typeof v === 'number')
		.sort((a, b) => a - b)
	return sorted.length === 0 ? null : sorted[Math.floor(sorted.length / 2)]
}
const groups = new Map()
for (const row of rows) {
	const key = `${row.n ?? ''}\t${row.ts}\t${row.label}`
	groups.set(key, [...(groups.get(key) ?? []), row])
}
console.log('n\tts\tvariant\truns\tmedian\truns\tloads\terrors')
for (const [key, group] of [...groups].sort()) {
	const field =
		'editToDiagnosticMs' in group[0] ? 'editToDiagnosticMs' : 'instantiations'
	const values = group.map((row) => row[field])
	const scale = field === 'editToDiagnosticMs' ? 1000 : 1
	console.log(
		`${key}\t${group.length}\t${(median(values) / scale).toFixed(field === 'instantiations' ? 0 : 2)}\t${JSON.stringify(values.map((v) => (v === null ? null : Number((v / scale).toFixed(2)))))}\t${JSON.stringify(group.map((row) => row.load))}\t${JSON.stringify(group.map((row) => row.error ?? row.errors).filter(Boolean))}`,
	)
}
