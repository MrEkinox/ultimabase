// Generator of form L (rules at the application level) for tools/bench.mjs.
// Usage: node forms/l-app-rules/gen.mjs <N> [--registry] [--no-soft-delete]
//   -> forms/l-app-rules/gen/l-app-rules-<N>/ (same graph and density as tools/gen.mjs:
//   6 scalars, ring pointer `next`, inverse `prevs` (mappedBy), a self pointer one schema
//   in five, access with a local and a cross filter, hooks, acl, postgres, one file per
//   schema, one findMany per schema). `softDelete: true` in every define by default (shape
//   option of these forms); every rule is in application.ts. `--registry` declares the schema
//   tuple once (`Register { schemas }`); `Register { app }` cycles in this form (TS7022).
import fs from 'node:fs'
import path from 'node:path'

const formDir = path.dirname(new URL(import.meta.url).pathname)
const id = path.basename(formDir)

export const generate = (count, { registry = false, softDelete = true } = {}) => {
	const dir = path.join(formDir, 'gen', `${id}${registry ? '-registry' : ''}-${count}`)
	const lib = path.relative(path.join(dir, 'src'), path.join(formDir, 'lib'))
	fs.rmSync(dir, { recursive: true, force: true })
	fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
	fs.writeFileSync(
		path.join(dir, 'tsconfig.json'),
		JSON.stringify(
			{ extends: path.relative(dir, path.join(formDir, '../../tsconfig.base.json')), compilerOptions: { allowImportingTsExtensions: true }, include: ['src/**/*.ts'] },
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
		const imports = new Set([next, previous].filter((j) => j !== i))
		fs.writeFileSync(
			path.join(dir, 'src', `s${i}.ts`),
			`import { App } from './factory.ts'
${[...imports].map((j) => `import { ${name(j)} } from './s${j}.ts'`).join('\n')}

export const ${name(i)} = App.Schema.define({
	className: '${name(i)}',${softDelete ? '\n\tsoftDelete: true,' : ''}
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => ${name(next)}, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => ${name(previous)}, mappedBy: 'next' }),${i % 5 === 0 ? `\n\t\tparent: field.pointer({ target: () => ${name(i)} }),` : ''}
	}),
})
`,
		)
	}
	const all = Array.from({ length: count }, (_, i) => i)
	const rules = (i) => `		${name(i)}: {
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
		},`
	fs.writeFileSync(
		path.join(dir, 'src/application.ts'),
		`import type { ACL } from '${lib}/plugins.ts'
import { App } from './factory.ts'
${all.map((i) => `import { ${name(i)} } from './s${i}.ts'`).join('\n')}

declare const acl: ACL
${
	registry
		? `
export const schemas = [${all.map(name).join(', ')}] as const

declare module '${lib}/types.ts' {
	interface Register {
		readonly schemas: typeof schemas
	}
}
`
		: ''
}
export const app = new App({
	schemas: ${registry ? 'schemas' : `[${all.map(name).join(', ')}]`},
	rules: {
${all.map(rules).join('\n')}
	},
})
`,
	)
	fs.writeFileSync(
		path.join(dir, 'src/usage.ts'),
		`${all.map((i) => `import { ${name(i)} } from './s${i}.ts'`).join('\n')}

${all
	.map(
		(i) =>
			`export const q${i} = await ${name(i)}.findMany({ where: { f0: { eq: 'current' }, next: { is: { f2: { eq: true } } } }, select: { f0: true, f1: true }, include: { next: { select: { f0: true } } } })`,
	)
	.join('\n')}
export const hoverProbe = q0
export const editProbe = await S0.findMany({ where: { f0: { eq: 'valid' } } })
`,
	)
	return dir
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
	const args = process.argv.slice(2)
	console.log(generate(Number.parseInt(args[0], 10), { registry: args.includes('--registry'), softDelete: !args.includes('--no-soft-delete') }))
}
