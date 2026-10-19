// Median tables for forms/BENCH.md from results/forms/{bench,tsc,rule,real-baseline}.jsonl.
// Usage: node tools/forms-bench/summarize.mjs   (markdown on stdout)
import fs from 'node:fs'
import path from 'node:path'
import { configs, root } from './configs.mjs'

const read = (file) => {
	const p = path.join(root, 'results/forms', file)
	return fs.existsSync(p)
		? fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l))
		: []
}
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
const int = (x) => (Number.isNaN(x) ? '—' : Math.round(x).toLocaleString('fr-FR').replace(/ /g, ' '))
const bench = read('bench.jsonl')
const tsc = read('tsc.jsonl')
const rule = read('rule.jsonl')
const sizes = [...new Set(tsc.map((r) => r.n))].sort((a, b) => a - b)
const pick = (rows, label, n) => rows.filter((r) => r.label === label && r.n === n && !r.failed)
const stats = {}
const anomalies = []
for (const n of sizes) {
	console.log(`\n### ${n} schémas\n`)
	console.log('| Forme | Froid | Éd.→diag | Éd.→tout | Schéma+hover | Règle (fichier) | Tas max | tsc check | tsc mém. | RSS max | Instanciations | Types | Erreurs |')
	console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
	for (const { label } of configs) {
		const b = pick(bench, label, n)
		const t = pick(tsc, label, n)
		const r = pick(rule, label, n)
		const failedBench = bench.filter((x) => x.label === label && x.n === n && x.failed).length
		if (!t.length && !b.length) continue
		const s = {
			cold: median(b.map((x) => x.coldMs)) / 1000,
			edit: median(b.map((x) => x.editToDiagnosticMs)) / 1000,
			editAll: median(b.map((x) => x.editAllFilesMs)) / 1000,
			schema: median(b.map((x) => x.schemaEditMs)) / 1000,
			rule: median(r.map((x) => x.ruleEditMs)) / 1000,
			heap: median(b.map((x) => x.peakHeapMiB)),
			check: median(t.map((x) => x.checkS)),
			mem: median(t.map((x) => x.memoryK)) / 1024,
			rss: median(t.map((x) => x.maxRssBytes)) / 1048576,
			inst: median(t.map((x) => x.instantiations)),
			types: median(t.map((x) => x.types)),
			errors: t[0]?.errors ?? NaN,
			errorCodes: t[0]?.errorCodes ?? {},
			coldDiag: b[0]?.coldDiagnostics,
			editDiag: b[0]?.editDiagnostics,
			ruleDiag: r[0]?.ruleEditDiagnostics,
			runs: [b.length, t.length, r.length],
		}
		stats[`${label}@${n}`] = s
		const ruleCol = `${fr(s.rule)}${label.startsWith('l-') ? ' (app)' : ''}`
		const err = `${int(s.errors)}${Object.keys(s.errorCodes).length ? ` (${Object.entries(s.errorCodes).map(([c, k]) => `${c}×${k}`).join(', ')})` : ''}${failedBench ? `, bench KO ×${failedBench}` : ''}`
		console.log(`| ${label} | ${fr(s.cold)} | ${fr(s.edit)} | ${fr(s.editAll)} | ${fr(s.schema)} | ${ruleCol} | ${int(s.heap)} | ${fr(s.check)} | ${int(s.mem)} | ${int(s.rss)} | ${int(s.inst)} | ${int(s.types)} | ${err} |`)
		const series = {
			cold: b.map((x) => x.coldMs),
			edit: b.map((x) => x.editToDiagnosticMs),
			editAll: b.map((x) => x.editAllFilesMs),
			schema: b.map((x) => x.schemaEditMs),
			rule: r.map((x) => x.ruleEditMs),
			check: t.map((x) => x.checkS),
		}
		for (const [k, v] of Object.entries(series)) {
			const sp = spread(v)
			if (sp > 0.15) anomalies.push(`${label}@${n} ${k}: écart ${(sp * 100).toFixed(0)} % (${v.map((x) => (k === 'check' ? x : x / 1000).toFixed(2)).join(' / ')})`)
		}
		if (s.coldDiag !== 0 || s.editDiag !== 1 || s.ruleDiag !== 1) anomalies.push(`${label}@${n} diagnostics: froid ${s.coldDiag}, édition ${s.editDiag}, règle ${s.ruleDiag}`)
		if (s.runs.some((k) => k !== 3)) anomalies.push(`${label}@${n} runs bench/tsc/règle = ${s.runs.join('/')}`)
	}
}
console.log('\n### Croissance 10 → 200\n')
console.log('| Forme | Froid | Éd.→diag | Éd.→tout | Schéma+hover | Règle | Tas | tsc check | Instanciations |')
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for (const { label } of configs) {
	const a = stats[`${label}@10`]
	const z = stats[`${label}@200`]
	if (!a || !z) continue
	const g = (k) => `×${fr(z[k] / a[k], 1)}`
	console.log(`| ${label} | ${g('cold')} | ${g('edit')} | ${g('editAll')} | ${g('schema')} | ${g('rule')} | ${g('heap')} | ${g('check')} | ${g('inst')} |`)
}
for (const key of ['check', 'edit', 'schema', 'rule']) {
	const ranked = configs
		.map(({ label }) => [label, stats[`${label}@200`]])
		.filter(([, s]) => s && s.errors === 0)
		.sort((a, b) => a[1][key] - b[1][key])
	console.log(`\nClassement 200 par ${key} : ${ranked.map(([l, s]) => `${l} ${fr(s[key])}`).join(' < ')}`)
}
const realRows = read('real-baseline.jsonl').filter((r) => !r.failed)
if (realRows.length) {
	console.log('\n| Typegen réel N | runs | Froid | Éd.→diag | Tas max | Déclaration (Ko) | diag base/édition |')
	console.log('| --- | --- | --- | --- | --- | --- | --- |')
	for (const n of [...new Set(realRows.map((r) => r.schemaCount))]) {
		const rows = realRows.filter((r) => r.schemaCount === n)
		console.log(`| ${n} | ${rows.length} | ${fr(median(rows.map((r) => r.coldTypecheckDurationMs)) / 1000)} | ${fr(median(rows.map((r) => r.editToDiagnosticLatencyMs)) / 1000)} | ${int(median(rows.map((r) => r.peakHeapMiB)))} | ${int(rows[0].declarationBytes / 1024)} | ${rows[0].coldDiagnosticCount}/${rows[0].editDiagnosticCount} |`)
		const sp = spread(rows.map((r) => r.coldTypecheckDurationMs))
		if (sp > 0.15) anomalies.push(`real-${n} froid: écart ${(sp * 100).toFixed(0)} %`)
	}
}
console.log('\n### Anomalies\n')
for (const a of anomalies) console.log(`- ${a}`)
