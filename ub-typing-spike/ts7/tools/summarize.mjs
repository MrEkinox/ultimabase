// Medians of ts7/results/campaign.jsonl per (label, n): TS6 vs TS7.
import fs from 'node:fs'
const rows = fs.readFileSync('/Users/mrekinox/Desktop/ub-typing-spike/ts7/results/campaign.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const median = (xs) => {
	const v = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b)
	return v.length ? v[Math.floor(v.length / 2)] : null
}
const f = (x, d = 2) => (x === null || x === undefined ? '-' : x.toFixed(d).replace('.', ','))
const groups = new Map()
for (const r of rows) {
	const k = `${r.label}@${r.n}`
	if (!groups.has(k)) groups.set(k, [])
	groups.get(k).push(r)
}
const pick = (rs, tool, key) => median(rs.filter((r) => r.tool === tool).map((r) => r[key]))
const errs = (rs, tool) => [...new Set(rs.filter((r) => r.tool === tool).map((r) => `${r.errors}${Object.keys(r.errorCodes ?? {}).length ? ` ${JSON.stringify(r.errorCodes)}` : ''}`))].join('/')
console.log('| Forme@N | runs | erreurs tsc 6/7/7s | check 6 | check 7 | check 7 1 fil | réel 6 | réel 7 | RSS 6 | RSS 7 | RSS 7 1 fil | inst. 6 / 7 1 fil | éd.→diag 6 / 7 | éd.→tout 6 / 7 | schéma+hover 6 / 7 | règle 6 / 7 | 1er diag 6 / 7 | RSS LSP 7 | diag éd. 6/7 | hover q0 6/7 |')
console.log('| --- |'.padEnd(10) + ' --- |'.repeat(19))
for (const [k, rs] of groups) {
	const runs = rs.filter((r) => r.tool === 'tsc6').length
	const ms = (tool, key) => {
		const v = pick(rs, tool, key)
		return v === null ? null : v / 1000
	}
	console.log(
		`| ${k} | ${runs} | ${errs(rs, 'tsc6')} / ${errs(rs, 'tsc7')} / ${errs(rs, 'tsc7-single')} | ${f(pick(rs, 'tsc6', 'checkS'))} | ${f(pick(rs, 'tsc7', 'checkS'))} | ${f(pick(rs, 'tsc7-single', 'checkS'))} | ${f(pick(rs, 'tsc6', 'realS'))} | ${f(pick(rs, 'tsc7', 'realS'))} | ${f(pick(rs, 'tsc6', 'maxRssMiB'), 0)} | ${f(pick(rs, 'tsc7', 'maxRssMiB'), 0)} | ${f(pick(rs, 'tsc7-single', 'maxRssMiB'), 0)} | ${pick(rs, 'tsc6', 'instantiations')} / ${pick(rs, 'tsc7-single', 'instantiations')} | ${f(ms('ls6', 'editToDiagnosticMs'))} / ${f(ms('lsp7', 'editToDiagnosticMs'))} | ${f(ms('ls6', 'editAllFilesMs'))} / ${f(ms('lsp7', 'editAllFilesMs'))} | ${f(ms('ls6', 'schemaEditMs'))} / ${f(ms('lsp7', 'schemaEditMs'))} | ${f(ms('rule6', 'ruleEditMs'))} / ${f(ms('lsp7', 'ruleEditMs'))} | ${f(ms('ls6', 'firstUsageDiagnosticMs'))} / ${f(ms('lsp7', 'firstMs'))} | ${f(pick(rs, 'lsp7', 'serverRssMiB'), 0)} | ${pick(rs, 'ls6', 'editDiagnostics')}/${pick(rs, 'lsp7', 'editDiagnostics')} | ${pick(rs, 'ls6', 'hoverChars')}/${pick(rs, 'lsp7', 'hoverChars')} |`,
	)
}
