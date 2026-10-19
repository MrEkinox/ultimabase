// Benchmark generator for form G (same graph and density as tools/gen.mjs).
// Usage: node forms/g-class/gen.mjs <N> [--register]
//   -> forms/g-class/gen/g-class-<N>/ (spec form) or gen/g-class-reg-<N>/ (plus the one-time Register).
// Each schema: 6 scalar fields, pointer `next` (ring S0 -> S1 -> ... -> S0), inverse relation
// `prevs` (mappedBy 'next'), every 5th schema a self pointer `parent`; header shape options
// softDelete + postgres table; static rules: access (local filter + filter across `next`),
// hooks reading the record, acl default reading the create input. usage.ts: one findMany per
// schema; markers `hoverProbe = q0`, `eq: 'valid'` and `f5: field.string(),` for tools/bench.mjs.
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname)

export const generate = (count, register) => {
	const dir = path.join(here, 'gen', `g-class${register ? '-reg' : ''}-${count}`)
	fs.rmSync(dir, { recursive: true, force: true })
	fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
	fs.writeFileSync(
		path.join(dir, 'tsconfig.json'),
		JSON.stringify({ extends: '../../../../tsconfig.base.json', compilerOptions: { allowImportingTsExtensions: true }, include: ['src/**/*.ts'] }, null, '\t'),
	)
	fs.writeFileSync(
		path.join(dir, 'src/factory.ts'),
		`import { UltimaBase } from '../../../lib/core.ts'
import { accessPlugin, aclPlugin, hooksPlugin, postgresPlugin, softDeletePlugin } from '../../../lib/plugins.ts'

export const App = UltimaBase.use(accessPlugin(), hooksPlugin(), aclPlugin(), softDeletePlugin(), postgresPlugin())

export const { field } = App
`,
	)
	const name = (i) => `S${i}`
	for (let i = 0; i < count; i += 1) {
		const next = (i + 1) % count
		const previous = (i - 1 + count) % count
		const imports = [...new Set([next, previous].filter((j) => j !== i))].map((j) => `import { ${name(j)} } from './s${j}.ts'`).join('\n')
		fs.writeFileSync(
			path.join(dir, 'src', `s${i}.ts`),
			`import { ACL } from '../../../lib/plugins.ts'
import { App, field } from './factory.ts'
${imports}

const acl = new ACL()

export class ${name(i)} extends App.Schema(
	'${name(i)}',
	{
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum(['a', 'b', 'c']),
		f5: field.string(),
		next: field.pointer(() => ${name(next)}, { onDelete: 'setNull' }),
		prevs: field.relation(() => ${name(previous)}, { mappedBy: 'next' }),${i % 5 === 0 ? `\n\t\tparent: field.pointer(() => ${name(i)}),` : ''}
	},
	{ softDelete: true, postgres: { table: 's${i}' } },
) {
	static access = this.rules.access({
		read: { where: (s) => s.eq('f2', false) },
		update: { where: (s) => s.is('next', (next) => next.eq('f0', 'x')) },
		create: true,
	})

	static hooks = this.rules.hooks({
		beforeSave: ({ item }) => {
			if (item.f0.length === 0) throw new TypeError('f0')
		},
	})

	static acl = this.rules.acl({ default: (data) => (data.f0 === '' ? acl : acl.grantPublic('read')) })
}
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
declare module '../../../lib/types.ts' {
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
	console.log(generate(Number.parseInt(process.argv[2], 10), process.argv.includes('--register')))
}
