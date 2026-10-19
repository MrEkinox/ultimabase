// Generates N schemas in form D (hybrid, relation targets in getters) with the graph and density of tools/gen.mjs:
// 6 scalars, ring pointer `next`, inverse `prevs` (mappedBy 'next'), a self pointer one schema
// in five, `.softDelete()`, then one `.with({ access (local + cross filter), hooks, acl, postgres })`,
// one file per schema, one findMany per schema in usage.ts, and the one-time Register line.
// Usage: node forms/d-hybrid-getters/gen.mjs <N> [--no-register]
//   -> forms/d-hybrid-getters/gen/d-hybrid-getters-<N>/ (or -noreg-), compatible with tools/bench.mjs.
import fs from 'node:fs'
import path from 'node:path'

const formDir = path.dirname(new URL(import.meta.url).pathname)
const formId = path.basename(formDir)

export const generate = (count, { register = true } = {}) => {
	const genRoot = path.join(formDir, 'gen')
	const dir = path.join(genRoot, `${formId}${register ? '' : '-noreg'}-${count}`)
	fs.rmSync(dir, { recursive: true, force: true })
	fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
	// One package link for every generated project: `@ultimabase/core` -> ../lib.
	fs.mkdirSync(path.join(genRoot, 'node_modules/@ultimabase'), { recursive: true })
	const link = path.join(genRoot, 'node_modules/@ultimabase/core')
	if (!fs.existsSync(link)) fs.symlinkSync('../../../lib', link)
	fs.writeFileSync(
		path.join(dir, 'tsconfig.json'),
		JSON.stringify({ extends: '../../../../tsconfig.base.json', compilerOptions: { allowImportingTsExtensions: true }, include: ['src/**/*.ts'] }, null, '\t'),
	)
	fs.writeFileSync(
		path.join(dir, 'src/factory.ts'),
		`import { UltimaBase } from '@ultimabase/core'
import { accessPlugin, aclPlugin, hooksPlugin, postgresPlugin, softDeletePlugin } from '@ultimabase/core/plugins'

export const App = UltimaBase.use(accessPlugin(), hooksPlugin(), aclPlugin(), softDeletePlugin(), postgresPlugin())
`,
	)
	const name = (i) => `S${i}`
	for (let i = 0; i < count; i += 1) {
		const next = (i + 1) % count
		const previous = (i - 1 + count) % count
		const imports = [...new Set([next, previous].filter((j) => j !== i))].map((j) => `import { ${name(j)} } from './s${j}.ts'`).join('\n')
		const body = `export const ${name(i)} = App.Schema.define({
	className: '${name(i)}',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		get next() {
			return field.pointer({ target: ${name(next)}, onDelete: 'setNull' })
		},
		get prevs() {
			return field.relation({ target: ${name(previous)}, mappedBy: 'next' })
		},${i % 5 === 0 ? `\n\t\tget parent() {\n\t\t\treturn field.pointer({ target: ${name(i)} })\n\t\t},` : ''}
	}),
})
	.softDelete()
	.with({
		access: {
			read: { where: ({ where }) => where.eq('f2', false) },
			update: { where: ({ where }) => where.is('next', (next) => next.eq('f0', 'x')) },
			create: true,
		},
		hooks: {
			beforeSave: ({ item }) => {
				if (item.f0.length === 0) throw new TypeError('f0')
			},
		},
		acl: { default: (data) => (data.f0 === '' ? acl : acl.grantPublic('read')) },
		postgres: { table: 's${i}' },
	})`
		fs.writeFileSync(
			path.join(dir, 'src', `s${i}.ts`),
			`import type { ACL } from '@ultimabase/core/plugins'
import { App } from './factory.ts'
${imports}

declare const acl: ACL

${body}
`,
		)
	}
	const all = Array.from({ length: count }, (_, i) => name(i))
	const importAll = all.map((n, i) => `import { ${n} } from './s${i}.ts'`).join('\n')
	fs.writeFileSync(
		path.join(dir, 'src/application.ts'),
		`import { App } from './factory.ts'
${importAll}

export const app = new App({ schemas: [${all.join(', ')}] })
${
	register
		? `
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof app
	}
}
`
		: ''
}`,
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
	console.log(generate(Number.parseInt(process.argv[2], 10), { register: !process.argv.includes('--no-register') }))
}
