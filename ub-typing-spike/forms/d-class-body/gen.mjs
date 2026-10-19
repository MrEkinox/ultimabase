// Copy of forms/d-named/gen.mjs (same graph and density as tools/gen.mjs) with a form switch:
//   --form class (default): `export class S0 extends App.Schema.define({...}).softDelete() { static rules = this.with({...}) }`
//   --form const: the d-named code `export const S0 = App.Schema.define({...}).softDelete().with({...})`
// and a Core switch (--lib body|named|args): body = forms/d-class-body/lib, named = forms/d-named/lib,
// args = forms/d-named/experiments/named-args/lib (read-only links; nothing is written outside this directory).
// Usage: node forms/d-class-body/gen.mjs <N> [--no-register] [--form class|const] [--lib body|named|args]
//   -> forms/d-class-body/gen-<lib>/<form>-<lib>[-noreg]-<N>/, compatible with tools/bench.mjs.
import fs from 'node:fs'
import path from 'node:path'

const formDir = path.dirname(new URL(import.meta.url).pathname)
const libs = { body: 'lib', noregmodel: 'experiments/noreg-model/lib', nomember: 'experiments/no-member-check/lib', named: '../d-named/lib', args: '../d-named/experiments/named-args/lib' }

export const generate = (count, { register = true, variant = 'body', form = 'class' } = {}) => {
	const genRoot = path.join(formDir, `gen-${variant}`)
	const dir = path.join(genRoot, `${form}-${variant}${register ? '' : '-noreg'}-${count}`)
	fs.rmSync(dir, { recursive: true, force: true })
	fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
	// One package link for every generated project: `@ultimabase/core` -> ../lib.
	fs.mkdirSync(path.join(genRoot, 'node_modules/@ultimabase'), { recursive: true })
	const link = path.join(genRoot, 'node_modules/@ultimabase/core')
	if (!fs.existsSync(link)) fs.symlinkSync(path.join(formDir, libs[variant]), link)
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
		const head = form === 'class' ? `export class ${name(i)} extends App.Schema.define({` : `export const ${name(i)} = App.Schema.define({`
		const rulesOpen = form === 'class' ? `}).softDelete() {\n\tstatic rules = this.with({` : `})\n\t.softDelete()\n\t.with({`
		const rulesClose = form === 'class' ? `\t})\n}` : `\t})`
		const body = `${head}
	className: '${name(i)}',
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
${rulesOpen}
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
${rulesClose}`
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
	const v = process.argv.indexOf('--variant')
	const f = process.argv.indexOf('--form')
	const l = process.argv.indexOf('--lib')
	console.log(
		generate(Number.parseInt(process.argv[2], 10), {
			register: !process.argv.includes('--no-register'),
			variant: l === -1 ? (v === -1 ? 'body' : process.argv[v + 1]) : process.argv[l + 1],
			form: f === -1 ? 'class' : process.argv[f + 1],
		}),
	)
}
