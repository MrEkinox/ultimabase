// Generates a synthetic application of N schemas for one variant.
// Usage: node tools/gen.mjs <c|d|e|r> <N>  ->  gen/<variant>-<N>/
// `r` (section 9): variant D code on lib-short/ plus the one-time application registry.
// `f` (section 10): plugin methods on lib-f/ (`.softDelete().postgres().acl().hooks().access()`),
// the only cross-schema callback in the last call, no registry.
// Each schema: 6 scalar fields, a pointer `next` (ring cycle S0 -> S1 -> ... -> S0),
// its inverse relation `prevs` (mappedBy 'next'), and every 5th schema a self pointer
// `parent`. Options: Access row filters (one crossing the `next` relation), a Hooks
// callback reading the complete record, an ACL default reading the create input.
// usage.ts runs one findMany per schema (where across a relation, select, include).
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

export const generate = (variant, count) => {
	const lib = variant === 'r' ? 'lib-short' : variant === 'f' ? 'lib-f' : 'lib'
	const dir = path.join(root, 'gen', `${variant}-${count}`)
	fs.rmSync(dir, { recursive: true, force: true })
	fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
	fs.writeFileSync(
		path.join(dir, 'tsconfig.json'),
		JSON.stringify({ extends: '../../tsconfig.base.json', compilerOptions: { allowImportingTsExtensions: true }, include: ['src/**/*.ts'] }, null, '\t'),
	)
	fs.writeFileSync(
		path.join(dir, 'src/factory.ts'),
		`import { UltimaBase${variant === 'f' ? '' : ', type SchemaOptionsOf'} } from '../../../${lib}/core.ts'
import { accessPlugin, aclPlugin, hooksPlugin, postgresPlugin, softDeletePlugin } from '../../../${lib}/plugins.ts'

export const App = UltimaBase.use(accessPlugin()).use(hooksPlugin()).use(aclPlugin()).use(softDeletePlugin()).use(postgresPlugin())

${variant === 'f' ? '' : 'export type Options<TSchema> = SchemaOptionsOf<typeof App, TSchema>\n'}`,
	)
	const name = (i) => `S${i}`
	const target = (i) => (variant === 'c' ? `'${name(i)}'` : `() => ${name(i)}`)
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
	next: field.pointer({ target: ${target(next)}, onDelete: 'setNull' }),
	prevs: field.relation({ target: ${target(previous)}, mappedBy: 'next' }),${i % 5 === 0 ? `\n\tparent: field.pointer({ target: ${target(i)} }),` : ''}
`
		const options = `
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
`
		const imports = new Set([next, previous, i].filter((j) => j !== i))
		const importLines =
			variant === 'c' ? '' : [...imports].map((j) => `import { ${name(j)} } from './s${j}.ts'`).join('\n')
		let body
		if (variant === 'f') {
			body = `export const ${name(i)} = App.Schema.define({
	className: '${name(i)}',
	fields: (field) => ({${fields.replace(/\n/g, '\n\t')}}),
})
	.softDelete()
	.postgres({ table: 's${i}' })
	.acl({ default: (data) => (data.f0 === '' ? acl : acl.grantPublic('read')) })
	.hooks({
		beforeSave: ({ item }) => {
			if (item.f0.length === 0) throw new TypeError('f0')
		},
	})
	.access({
		read: { where: ({ where }) => where.eq('f2', false) },
		update: { where: ({ where }) => where.is('next', (next) => next.eq('f0', 'x')) },
		create: true,
	})`
		} else if (variant === 'e') {
			body = `export class ${name(i)} extends App.Schema('${name(i)}', (field) => ({${fields}})) {
	static readonly options: Options<typeof ${name(i)}> = {${options.replace(/\n/g, '\n\t')}}
}`
		} else {
			body = `export const ${name(i)} = App.Schema.declare({
	className: '${name(i)}',
	fields: (field) => ({${fields.replace(/\n/g, '\n\t')}}),
}).with({${options}})`
		}
		const header = `import type { ACL } from '../../../${lib}/plugins.ts'
import { App${variant === 'e' ? ', type Options' : ''} } from './factory.ts'
${importLines}

declare const acl: ACL
`
		fs.writeFileSync(path.join(dir, 'src', `s${i}.ts`), `${header}\n${body}\n`)
	}
	const all = Array.from({ length: count }, (_, i) => name(i))
	const importAll = all.map((n, i) => `import { ${n} } from './s${i}.ts'`).join('\n')
	fs.writeFileSync(
		path.join(dir, 'src/application.ts'),
		variant === 'c'
			? `import { App } from './factory.ts'
${importAll}

export const schemas = [${all.join(', ')}] as const
export const app = new App({ schemas })

declare module '../../../lib/types.ts' {
	interface Register {
		readonly schemas: typeof schemas
	}
}
`
			: `import { App } from './factory.ts'
${importAll}

export const app = new App({ schemas: [${all.join(', ')}] })
${
	variant === 'r'
		? `
declare module '../../../lib-short/types.ts' {
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
	console.log(generate(process.argv[2], Number.parseInt(process.argv[3], 10)))
}
