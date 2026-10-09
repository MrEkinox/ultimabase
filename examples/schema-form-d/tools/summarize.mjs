// Medians of results/campaign.jsonl per label and size (seconds, MiB).
// Usage: node tools/summarize.mjs
import console from 'node:console'
import { URL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const exampleDir = path.resolve(
	path.dirname(new URL(import.meta.url).pathname),
	'..',
)
const rows = fs
	.readFileSync(path.join(exampleDir, 'results/campaign.jsonl'), 'utf8')
	.split('\n')
	.filter(Boolean)
	.map((line) => JSON.parse(line))
const median = (values) => {
	const sorted = values
		.filter((value) => typeof value === 'number')
		.sort((a, b) => a - b)
	return sorted.length === 0 ? null : sorted[Math.floor(sorted.length / 2)]
}
const pick = (label, n, kind, field, scale = 1) => {
	const value = median(
		rows
			.filter((row) => row.label === label && row.n === n && row.kind === kind)
			.map((row) => row[field]),
	)
	return value === null ? '—' : (value * scale).toFixed(2)
}
const loads = (label, n) => {
	const values = rows
		.filter(
			(row) =>
				row.label === label && row.n === n && typeof row.load1 === 'number',
		)
		.map((row) => row.load1)
	return values.length === 0
		? '—'
		: `${Math.min(...values).toFixed(1)}–${Math.max(...values).toFixed(1)}`
}
const sizes = [...new Set(rows.map((row) => row.n))].sort((a, b) => a - b)
const header =
	'| N | Variant | Cold (TS6 LS) | Edit→diag (TS6) | Edit→all (TS6) | Schema+hover (TS6) | Rule (TS6) | Heap MiB | tsc6 check | Instantiations | tsc7 check | tsc7 1-thread | TS7 LSP first | TS7 edit→diag | TS7 rule | Errors | Load |'
console.log(header)
console.log(
	`|${header
		.split('|')
		.slice(1, -1)
		.map(() => ' --- ')
		.join('|')}|`,
)
for (const n of sizes) {
	for (const label of ['form-d', 'form-d-noreg']) {
		if (!rows.some((row) => row.label === label && row.n === n)) continue
		const errors = median(
			rows
				.filter(
					(row) => row.label === label && row.n === n && row.kind === 'tsc6',
				)
				.map((row) => row.errors),
		)
		console.log(
			`| ${n} | ${label} | ${pick(label, n, 'bench6', 'coldMs', 1e-3)} | ${pick(label, n, 'bench6', 'editToDiagnosticMs', 1e-3)} | ${pick(label, n, 'bench6', 'editAllFilesMs', 1e-3)} | ${pick(label, n, 'bench6', 'schemaEditMs', 1e-3)} | ${pick(label, n, 'rule6', 'ruleEditMs', 1e-3)} | ${pick(label, n, 'bench6', 'peakHeapMiB')} | ${pick(label, n, 'tsc6', 'checkS')} | ${pick(label, n, 'tsc6', 'instantiations')} | ${pick(label, n, 'tsc7', 'checkS')} | ${pick(label, n, 'tsc7-single', 'checkS')} | ${pick(label, n, 'lsp7', 'firstMs', 1e-3)} | ${pick(label, n, 'lsp7', 'editToDiagnosticMs', 1e-3)} | ${pick(label, n, 'lsp7', 'ruleEditMs', 1e-3)} | ${errors} | ${loads(label, n)} |`,
		)
	}
	if (rows.some((row) => row.label === 'typegen' && row.n === n)) {
		const errors = median(
			rows
				.filter(
					(row) =>
						row.label === 'typegen' && row.n === n && row.kind === 'tsc6',
				)
				.map((row) => row.errors),
		)
		console.log(
			`| ${n} | Typegen (real) | ${pick('typegen', n, 'probe-ts6', 'coldTypecheckDurationMs', 1e-3)} | ${pick('typegen', n, 'probe-ts6', 'editToDiagnosticLatencyMs', 1e-3)} | — | — | — | ${pick('typegen', n, 'probe-ts6', 'peakHeapMiB')} | ${pick('typegen', n, 'tsc6', 'checkS')} | ${pick('typegen', n, 'tsc6', 'instantiations')} | ${pick('typegen', n, 'tsc7', 'checkS')} | ${pick('typegen', n, 'tsc7-single', 'checkS')} | — | — | — | ${errors} | ${loads('typegen', n)} |`,
		)
	}
}
