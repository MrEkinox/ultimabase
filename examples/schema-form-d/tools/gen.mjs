// Generates N schemas in form D on the real packages, with the graph and density
// of the prototype benchmark (ub-typing-spike/tools/gen.mjs): 6 scalars, ring
// pointer `next`, inverse `prevs` (mappedBy 'next'), a self pointer one schema in
// five, `.softDelete().acl()`, then one `.with({ access (local + cross filter),
// hooks, acl, postgres })`; one file per schema, one findMany per schema in
// usage.ts, and the one-time Register line (unless --no-register).
// Usage: node tools/gen.mjs <N> [--no-register]  -> gen/form-d[-noreg]-<N>/
import process from 'node:process'
import console from 'node:console'
import { URL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const exampleDir = path.resolve(
	path.dirname(new URL(import.meta.url).pathname),
	'..',
)

export const generate = (count, { register = true } = {}) => {
	const dir = path.join(
		exampleDir,
		'gen',
		`form-d${register ? '' : '-noreg'}-${count}`,
	)
	fs.rmSync(dir, { recursive: true, force: true })
	fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
	fs.writeFileSync(
		path.join(dir, 'tsconfig.json'),
		`${JSON.stringify({ extends: '../../tsconfig.json', include: ['src/**/*.ts'] }, null, '\t')}\n`,
	)
	fs.writeFileSync(
		path.join(dir, 'src/app.ts'),
		`import { accessPlugin } from '@ultimabase/access-plugin'
import { aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

export const App = UltimaBase.use(
	accessPlugin(),
	hooksPlugin(),
	aclPlugin(),
	softDeletePlugin(),
	postgresPlugin({ url: 'postgres://localhost/bench' }),
)
`,
	)
	const name = (i) => `S${i}`
	for (let i = 0; i < count; i += 1) {
		const next = (i + 1) % count
		const previous = (i - 1 + count) % count
		const imports = [...new Set([next, previous].filter((j) => j !== i))]
			.map((j) => `import { ${name(j)} } from './s${j}.ts'`)
			.join('\n')
		fs.writeFileSync(
			path.join(dir, 'src', `s${i}.ts`),
			`import type { ACL } from '@ultimabase/acl-permissions-plugin'
import { App } from './app.ts'
${imports}

declare const acl: ACL

export const ${name(i)} = App.Schema.define({
	className: '${name(i)}',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => ${name(next)}, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => ${name(previous)}, mappedBy: 'next' }),${
			i % 5 === 0
				? `\n\t\tparent: field.pointer({ target: () => ${name(i)} }),`
				: ''
		}
	}),
})
	.softDelete()
	.acl()
	.with({
		access: {
			read: ({ where }) => where.eq('f2', false),
			update: ({ where }) => where.is('next', (next) => next.eq('f0', 'x')),
			create: true,
		},
		hooks: {
			beforeOperation: {
				update: ({ item }) => {
					if (item.f0.length === 0) throw new TypeError('f0')
				},
			},
		},
		acl: { default: ({ data }) => (data.f0 === '' ? acl : acl.grantPublic('read')) },
		postgres: { table: 's${i}' },
	})
`,
		)
	}
	const all = Array.from({ length: count }, (_, i) => name(i))
	const importAll = all
		.map((n, i) => `import { ${n} } from './s${i}.ts'`)
		.join('\n')
	fs.writeFileSync(
		path.join(dir, 'src/application.ts'),
		`import { App } from './app.ts'
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

if (
	process.argv[1] &&
	import.meta.url.endsWith(path.basename(process.argv[1]))
) {
	console.log(
		generate(Number.parseInt(process.argv[2], 10), {
			register: !process.argv.includes('--no-register'),
		}),
	)
}
