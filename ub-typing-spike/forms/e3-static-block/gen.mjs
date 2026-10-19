// Generates a synthetic application of N schemas for form E3 (`static { this.access({...}); ... }`), with the same graph and
// density as tools/gen.mjs (6 scalars, ring `next`, inverse `prevs` with mappedBy, a self
// pointer one schema in five, access with a local and a cross filter, hooks, acl, postgres,
// one file per schema, one findMany per schema). Every schema also calls `.softDelete()`
// (tools/gen.mjs adds `isDeleted` to every schema through the plugin field list).
// Usage: node forms/e3-static-block/gen.mjs <N> [outRoot]  ->  <outRoot>/e3-static-block-<N>/ (default: forms/e3-static-block/gen)
// Compatible with tools/bench.mjs (src/s0.ts `f5: field.string(),`, src/usage.ts `eq: 'valid'`, `hoverProbe = q0`).
import fs from 'node:fs'
import path from 'node:path'

const formDir = path.dirname(new URL(import.meta.url).pathname)
const formId = path.basename(formDir)
const spikeRoot = path.resolve(formDir, '../..')

export const generate = (count, outRoot = path.join(formDir, 'gen')) => {
	const dir = path.join(path.resolve(outRoot), `${formId}-${count}`)
	const rel = (target) => path.relative(path.join(dir, 'src'), target).split(path.sep).join('/')
	const lib = rel(path.join(formDir, 'lib'))
	fs.rmSync(dir, { recursive: true, force: true })
	fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
	fs.writeFileSync(
		path.join(dir, 'tsconfig.json'),
		JSON.stringify(
			{ extends: path.relative(dir, path.join(spikeRoot, 'tsconfig.base.json')), compilerOptions: { allowImportingTsExtensions: true }, include: ['src/**/*.ts'] },
			null,
			'\t',
		),
	)
	fs.writeFileSync(
		path.join(dir, 'src/factory.ts'),
		`import { UltimaBase } from '${lib}/core.ts'
import { accessPlugin, aclPlugin, hooksPlugin, postgresPlugin, softDeletePlugin } from '${lib}/plugins.ts'

export const App = UltimaBase.use(accessPlugin(), hooksPlugin(), aclPlugin(), softDeletePlugin(), postgresPlugin())
`,
	)
	const name = (i) => `S${i}`
	for (let i = 0; i < count; i += 1) {
		const next = (i + 1) % count
		const previous = (i - 1 + count) % count
		const fields = `
	f0: field.string({ required: true }),
	f1: field.int(),
	f2: field.boolean({ required: true, default: false }),
	f3: field.date(),
	f4: field.enum({ values: ['a', 'b', 'c'] }),
	f5: field.string(),
	next: field.pointer({ target: () => ${name(next)}, onDelete: 'setNull' }),
	prevs: field.relation({ target: () => ${name(previous)}, mappedBy: 'next' }),${i % 5 === 0 ? `\n\tparent: field.pointer({ target: () => ${name(i)} }),` : ''}
`
		const options = `
this.access({
	read: { where: ({ where }) => where.eq('f2', false) },
	update: { where: ({ where }) => where.is('next', (next) => next.eq('f0', 'x')) },
	create: true,
})
this.hooks({
	beforeSave: ({ item }) => {
		if (item.f0.length === 0) throw new TypeError('f0')
	},
})
this.acl({ default: (data) => (data.f0 === '' ? acl : acl.grantPublic('read')) })
this.postgres({ table: 's${i}' })
`
		const imports = new Set([next, previous].filter((j) => j !== i))
		const importLines = [...imports].map((j) => `import { ${name(j)} } from './s${j}.ts'`).join('\n')
		const body = `export class ${name(i)} extends App.Schema('${name(i)}', (field) => ({${fields}})).softDelete() {
	static {${options.replace(/\n/g, '\n\t\t').replace(/\t\t$/, '\t')}}
}`
		const header = `import type { ACL } from '${lib}/plugins.ts'
import { App } from './factory.ts'
${importLines}

declare const acl: ACL
`
		fs.writeFileSync(path.join(dir, 'src', `s${i}.ts`), `${header}\n${body}\n`)
	}
	const all = Array.from({ length: count }, (_, i) => name(i))
	const importAll = all.map((n, i) => `import { ${n} } from './s${i}.ts'`).join('\n')
	fs.writeFileSync(
		path.join(dir, 'src/application.ts'),
		`import { App } from './factory.ts'
${importAll}

export const app = new App({ schemas: [${all.join(', ')}] })
`,
	)
	fs.writeFileSync(
		path.join(dir, 'src/usage.ts'),
		`${importAll}

${all
	.map(
		(n, i) =>
			`export const q${i} = await ${n}.findMany({ where: { f0: { eq: 'current' }, next: { is: { f2: { eq: true } } } }, select: { f0: true, f1: true }, include: { next: { select: { f0: true } } } })`,
	)
	.join('\n')}
export const hoverProbe = q0
export const editProbe = await S0.findMany({ where: { f0: { eq: 'valid' } } })
`,
	)
	return dir
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
	console.log(generate(Number.parseInt(process.argv[2], 10), process.argv[3]))
}
