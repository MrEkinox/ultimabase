// Compares two probe-both.mjs outputs (TS6 vs TS7) and prints a markdown report.
// Usage: node ts7/tools/compare.mjs <ts6.json> <ts7.json> <title>
import fs from 'node:fs'
const [a, b] = [process.argv[2], process.argv[3]].map((f) => JSON.parse(fs.readFileSync(f, 'utf8')))
const title = process.argv[4]
const lines = [`# ${title}`, '', `Baseline diagnostics: TS6 ${a.baseline.length}, TS7 ${b.baseline.length}`]
for (const d of b.baseline) lines.push(`- TS7 ${d.file}:${d.line} TS${d.code} ${d.message.split('\n')[0]}`)
const hoverTable = (ha, hb, label) => {
	lines.push('', `## Hovers ${label}`, '', '| Point | TS6 | TS7 | Same text |', '| --- | --- | --- | --- |')
	ha.forEach((h, i) => lines.push(`| ${h.name.replace(/\|/g, '\\|')} | ${h.length} | ${hb[i].length} | ${h.text === hb[i].text ? 'yes' : 'NO'} |`))
	ha.forEach((h, i) => {
		if (h.text !== hb[i].text) lines.push('', `### ${h.name}`, '', 'TS6:', '```', h.text, '```', 'TS7:', '```', hb[i].text, '```')
	})
}
hoverTable(a.hovers, b.hovers, '')
a.hoverSets.forEach((s, i) => hoverTable(s.hovers, b.hoverSets[i].hovers, `— ${s.name} (diag TS6 ${s.diagnostics}, TS7 ${b.hoverSets[i].diagnostics})`))
lines.push('', '## Completions', '')
a.completions.forEach((c, i) => {
	const other = b.completions[i].names
	const same = JSON.stringify(c.names) === JSON.stringify(other)
	lines.push(`- ${c.name}: TS6 ${c.names.length}, TS7 ${other.length}, ${same ? 'same' : `DIFF (only TS6: ${c.names.filter((n) => !other.includes(n)).join(', ') || '-'}; only TS7: ${other.filter((n) => !c.names.includes(n)).join(', ') || '-'})`}`)
})
lines.push('', '## Cases', '', '| Case | Diag TS6/TS7 | On line TS6/TS7 | Primary code TS6/TS7 | Primary length TS6/TS7 | Same message | Same diagnostic set |', '| --- | --- | --- | --- | --- | --- | --- |')
const key = (d) => `${d.file}:${d.line}:${d.col}:${d.code}`
a.cases.forEach((c, i) => {
	const d = b.cases[i]
	const sameSet = JSON.stringify(c.diagnostics.map(key).sort()) === JSON.stringify(d.diagnostics.map(key).sort())
	lines.push(`| ${c.name} | ${c.count}/${d.count} | ${c.onLine ? 'yes' : 'no'}/${d.onLine ? 'yes' : 'no'} | ${c.primary?.code ?? '-'}/${d.primary?.code ?? '-'} | ${c.primary?.message.length ?? '-'}/${d.primary?.message.length ?? '-'} | ${c.primary?.message === d.primary?.message ? 'yes' : 'NO'} | ${sameSet ? 'yes' : 'NO'} |`)
})
a.cases.forEach((c, i) => {
	const d = b.cases[i]
	if (c.primary?.message !== d.primary?.message || c.count !== d.count) {
		lines.push('', `### ${c.name}`, '', `TS6 (${c.primary?.file}:${c.primary?.line}):`, '```', c.primary?.message ?? '(none)', '```', `TS7 (${d.primary?.file}:${d.primary?.line}):`, '```', d.primary?.message ?? '(none)', '```')
		const extra7 = d.diagnostics.filter((x) => !c.diagnostics.some((y) => key(y) === key(x)))
		const extra6 = c.diagnostics.filter((x) => !d.diagnostics.some((y) => key(y) === key(x)))
		for (const x of extra6) lines.push(`- only TS6: ${key(x)} ${x.message.split('\n')[0].slice(0, 200)}`)
		for (const x of extra7) lines.push(`- only TS7: ${key(x)} ${x.message.split('\n')[0].slice(0, 200)}`)
	}
})
console.log(lines.join('\n'))
