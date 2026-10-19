// Prints median tables from results/bench.jsonl, results/tsc.jsonl and results/real-baseline.jsonl.
// Usage: node tools/summarize.mjs [suffix]   (reads results/bench<suffix>.jsonl and tsc<suffix>.jsonl)
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const lines = (file) =>
	fs.existsSync(path.join(root, 'results', file))
		? fs
				.readFileSync(path.join(root, 'results', file), 'utf8')
				.split('\n')
				.filter((line) => line.startsWith('{'))
				.map((line) => JSON.parse(line))
		: []
const median = (values) => {
	const sorted = values.filter((v) => typeof v === 'number' && !Number.isNaN(v)).sort((a, b) => a - b)
	if (sorted.length === 0) return Number.NaN
	const middle = Math.floor(sorted.length / 2)
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const group = (rows, key) => {
	const map = new Map()
	for (const row of rows) map.set(row[key], [...(map.get(row[key]) ?? []), row])
	return map
}
const suffix = process.argv[2] ?? ''
const s = (ms) => (ms / 1000).toFixed(2)

console.log('| variant-N | runs | cold (s) | LS init (s) | edit→diag usage (s) | edit→diag all files (s) | schema edit (s) | peak heap (MiB) | hover (chars) | diag base/edit |')
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for (const [dir, rows] of group(lines(`bench${suffix}.jsonl`), 'dir')) {
	console.log(
		`| ${dir} | ${rows.length} | ${s(median(rows.map((r) => r.coldMs)))} | ${s(median(rows.map((r) => r.lsInitMs)))} | ${s(median(rows.map((r) => r.editToDiagnosticMs)))} | ${s(median(rows.map((r) => r.editAllFilesMs)))} | ${s(median(rows.map((r) => r.schemaEditMs)))} | ${median(rows.map((r) => r.peakHeapMiB)).toFixed(0)} | ${rows[0].hoverChars} | ${rows[0].coldDiagnostics}/${rows[0].editDiagnostics} |`,
	)
}
console.log('\n| variant-N | runs | tsc check (s) | tsc total (s) | memory used (MiB) | max RSS (MiB) | instantiations | types | errors |')
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for (const [dir, rows] of group(lines(`tsc${suffix}.jsonl`), 'dir')) {
	console.log(
		`| ${dir} | ${rows.length} | ${median(rows.map((r) => r.checkS)).toFixed(2)} | ${median(rows.map((r) => r.totalS)).toFixed(2)} | ${(median(rows.map((r) => r.memoryK)) / 1024).toFixed(0)} | ${(median(rows.map((r) => r.maxRssBytes)) / 1048576).toFixed(0)} | ${median(rows.map((r) => r.instantiations))} | ${median(rows.map((r) => r.types))} | ${rows[0].errors} |`,
	)
}
const real = suffix ? [] : lines('real-baseline.jsonl')
if (real.length) {
	console.log('\n| real Typegen N | runs | cold (s) | edit→diag (s) | peak heap (MiB) | declaration (KB) | hover (chars) | diag base/edit |')
	console.log('| --- | --- | --- | --- | --- | --- | --- | --- |')
	for (const [n, rows] of group(real, 'schemaCount')) {
		console.log(
			`| ${n} | ${rows.length} | ${s(median(rows.map((r) => r.coldTypecheckDurationMs)))} | ${s(median(rows.map((r) => r.editToDiagnosticLatencyMs)))} | ${median(rows.map((r) => r.peakHeapMiB)).toFixed(0)} | ${(rows[0].declarationBytes / 1024).toFixed(0)} | ${rows[0].hoverOutput.length} | ${rows[0].coldDiagnosticCount}/${rows[0].editDiagnosticCount} |`,
		)
	}
}
