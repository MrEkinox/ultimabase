// Summarizes the probe's error cases as a table: detected, on the faulty line, number of
// diagnostics, first message and its length. Usage: node forms/e1-annotated/faults.mjs <fixture-dir>
import fs from 'node:fs'
import path from 'node:path'
import { createService } from '../../tools/probe.mjs'

const dir = path.resolve(process.argv[2])
const spec = JSON.parse(fs.readFileSync(path.join(dir, 'probe.json'), 'utf8'))
const ls = createService(dir)
const base = ls.diagnostics().length
console.log(`baseline diagnostics: ${base}\n`)
console.log('| Cas | Détecté | Sur la ligne | Diagnostics | Premier message (longueur) |')
console.log('| --- | --- | --- | --- | --- |')
for (const c of spec.cases) {
	const file = path.join(dir, c.file)
	const original = ls.text(file)
	const index = original.indexOf(c.find)
	const line = original.slice(0, index).split('\n').length
	ls.edit(file, original.replace(c.find, c.replace))
	const diags = ls.diagnostics()
	ls.edit(file, original)
	const first = diags.find((d) => d.file === c.file && d.line === line) ?? diags[0]
	const onLine = diags.some((d) => d.file === c.file && d.line === line)
	const where = first ? `${first.file}:${first.line}` : '-'
	const message = first ? `TS${first.code} ${first.message.split('\n')[0]}` : '-'
	console.log(`| ${c.name} | ${diags.length > 0 ? 'oui' : 'non'} | ${onLine ? 'oui' : `non (${where})`} | ${diags.length} | \`${message.replace(/\|/g, '\\|')}\` (${message.length}) |`)
}
