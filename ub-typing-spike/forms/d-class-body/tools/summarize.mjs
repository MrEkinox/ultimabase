// Median tables from forms/d-class-body/results/campaign.jsonl (markdown on stdout).
// Usage: node forms/d-class-body/tools/summarize.mjs
import fs from 'node:fs'
import path from 'node:path'

const file = path.join(path.dirname(new URL(import.meta.url).pathname), '../results/campaign.jsonl')
const rows = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l))
const median = (values) => {
	const v = values.filter((x) => typeof x === 'number' && !Number.isNaN(x)).sort((a, b) => a - b)
	if (!v.length) return Number.NaN
	const m = Math.floor(v.length / 2)
	return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}
const spread = (values) => {
	const v = values.filter((x) => typeof x === 'number')
	return v.length < 2 ? 0 : (Math.max(...v) - Math.min(...v)) / median(v)
}
const fr = (x, d = 2) => (Number.isNaN(x) ? '—' : x.toFixed(d).replace('.', ','))
const int = (x) => (Number.isNaN(x) ? '—' : Math.round(x).toLocaleString('fr-FR').replace(/\s/g, ' '))
const labels = [...new Set(rows.map((r) => r.label))]
const sizes = [...new Set(rows.map((r) => r.n))].sort((a, b) => a - b)
const pick = (label, n, tool) => rows.filter((r) => r.label === label && r.n === n && r.tool === tool && !r.failed)
const wide = []
console.log('| N | Variante | TS6 froid | TS6 éd.→diag | TS6 éd.→tout | TS6 schéma+hover | TS6 règle | TS6 tas | TS6 check | TS6 inst. | TS7 check (1 fil) | TS7 éd.→diag | TS7 règle | Erreurs 6/7 | Charge |')
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for (const n of sizes) {
	for (const label of labels) {
		const ls = pick(label, n, 'ls6')
		const rule = pick(label, n, 'rule6')
		const t6 = pick(label, n, 'tsc6')
		const t7 = pick(label, n, 'tsc7')
		const t7s = pick(label, n, 'tsc7-single')
		const lsp = pick(label, n, 'lsp7')
		if (!t6.length) continue
		const metrics = {
			cold: ls.map((x) => x.coldMs / 1000),
			edit: ls.map((x) => x.editToDiagnosticMs / 1000),
			editAll: ls.map((x) => x.editAllFilesMs / 1000),
			schema: ls.map((x) => x.schemaEditMs / 1000),
			rule: rule.map((x) => x.ruleEditMs / 1000),
			check6: t6.map((x) => x.checkS),
			check7: t7.map((x) => x.checkS),
			edit7: lsp.map((x) => x.editToDiagnosticMs / 1000),
		}
		for (const [k, v] of Object.entries(metrics)) if (spread(v) > 0.15 && median(v) >= 0.1) wide.push(`${label}@${n} ${k}: ${v.map((x) => x.toFixed(2)).join(' / ')}`)
		console.log(
			`| ${n} | ${label} | ${fr(median(metrics.cold))} | ${fr(median(metrics.edit))} | ${fr(median(metrics.editAll))} | ${fr(median(metrics.schema))} | ${fr(median(metrics.rule))} | ${int(median(ls.map((x) => x.peakHeapMiB)))} | ${fr(median(metrics.check6))} | ${int(median(t6.map((x) => x.instantiations)))} | ${fr(median(metrics.check7))} (${fr(median(t7s.map((x) => x.checkS)))}) | ${fr(median(metrics.edit7))} | ${fr(median(lsp.map((x) => x.ruleEditMs / 1000)))} | ${t6[0].errors}/${t7[0]?.errors ?? '—'} | ${fr(median(t6.map((x) => x.load1)), 1)} |`,
		)
	}
}
console.log(`\nRuns per point: ${[...new Set(rows.map((r) => r.run))].length}. Spread > 15 % (values >= 0,1 s): ${wide.length ? wide.join('; ') : 'none'}`)
const checks = rows.filter((r) => r.tool === 'ls6' || r.tool === 'lsp7')
console.log(`Diagnostics: cold/initial ${[...new Set(checks.map((r) => r.coldDiagnostics ?? r.initialUsageDiagnostics))].join(',')}; after query edit ${[...new Set(checks.map((r) => r.editDiagnostics))].join(',')}; hover q0 chars ${[...new Set(checks.map((r) => r.hoverChars))].join(',')}`)
