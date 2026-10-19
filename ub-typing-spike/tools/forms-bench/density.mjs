// Density check: generates every configuration at N (default 10), counts the graph elements of
// tools/gen.mjs in the generated sources and compiles the project with ./tsc (error count).
// Usage: node tools/forms-bench/density.mjs [N] [label ...]   -> results/forms/density.jsonl + markdown on stdout
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { configs, root, select } from './configs.mjs'

const n = Number.parseInt(process.argv[2] ?? '10', 10)
const chosen = select(process.argv.slice(3))
const count = (text, re) => (text.match(re) ?? []).length
const patterns = {
	scalars: /\bf[0-5]: field\./g,
	next: /(\bnext: field\.pointer|get next\(\))/g,
	prevsMappedBy: /mappedBy: 'next'/g,
	parent: /(\bparent: field\.pointer|get parent\(\))/g,
	localFilter: /eq\('f2', false\)/g,
	crossFilter: /is\('next', /g,
	createTrue: /create: true/g,
	hooks: /beforeSave/g,
	acl: /grantPublic\('read'\)/g,
	postgres: /table: 's\d+'/g,
	softDelete: /softDelete\(\)|softDelete: true/g,
	extraKeys: /\b(index|indexes|unique|delete|validate|roles)\s*:/g,
}
const expected = { scalars: 6 * n, next: n, prevsMappedBy: n, parent: Math.ceil(n / 5), localFilter: n, crossFilter: n, createTrue: n, hooks: n, acl: n, postgres: n, extraKeys: 0 }

const rows = []
for (const config of chosen) {
	spawnSync('node', [path.join(root, 'forms', config.form, 'gen.mjs'), String(n), ...config.args], { encoding: 'utf8' })
	const dir = config.dir(n)
	const src = path.join(dir, 'src')
	const decl = fs
		.readdirSync(src)
		.filter((f) => /^s\d+\.ts$/.test(f) || f === 'application.ts')
		.map((f) => fs.readFileSync(path.join(src, f), 'utf8'))
		.join('\n')
	const usage = fs.readFileSync(path.join(src, 'usage.ts'), 'utf8')
	const application = fs.readFileSync(path.join(src, 'application.ts'), 'utf8')
	const counts = Object.fromEntries(Object.entries(patterns).map(([k, re]) => [k, count(decl, re)]))
	const schemaFiles = fs.readdirSync(src).filter((f) => /^s\d+\.ts$/.test(f)).length
	const tsc = spawnSync(path.join(root, 'tsc'), ['-p', 'tsconfig.json'], { cwd: dir, encoding: 'utf8', timeout: 600_000 })
	const out = `${tsc.stdout}${tsc.stderr}`
	const codes = [...out.matchAll(/error (TS\d+)/g)].map((m) => m[1])
	const deviations = Object.entries(expected)
		.filter(([k, v]) => counts[k] !== v)
		.map(([k, v]) => `${k} ${counts[k]}/${v}`)
	const row = {
		label: config.label,
		n,
		schemaFiles,
		...counts,
		findMany: count(usage, /findMany/g),
		register: /interface Register/.test(application),
		errors: codes.length,
		errorCodes: [...new Set(codes)],
		deviations,
	}
	rows.push(row)
	fs.appendFileSync(path.join(root, 'results/forms/density.jsonl'), `${JSON.stringify(row)}\n`)
}
console.log('| config | schemas | scalars | next | prevs mappedBy | parent | local / cross filter | hooks | acl | postgres | softDelete | findMany | Register | tsc errors | deviations |')
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for (const r of rows) {
	console.log(
		`| ${r.label} | ${r.schemaFiles} | ${r.scalars} | ${r.next} | ${r.prevsMappedBy} | ${r.parent} | ${r.localFilter} / ${r.crossFilter} | ${r.hooks} | ${r.acl} | ${r.postgres} | ${r.softDelete} | ${r.findMany} | ${r.register ? 'yes' : 'no'} | ${r.errors}${r.errorCodes.length ? ` (${r.errorCodes.join(',')})` : ''} | ${r.deviations.join('; ') || '—'} |`,
	)
}
