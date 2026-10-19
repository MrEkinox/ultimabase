// Generates N models on the prototype with the graph and density of the
// previous base's `schema-form-d` generator (README.md, "Baseline"): six
// scalars, a ring `next`, its inverse `prevs`, a self relation one model in
// five, `softDelete` in `defineModel`, then one `.with({ access, hooks, acl,
// postgres })` whose read filter crosses a relation; one file per model, one
// `findMany` per model in `usage.ts`, and the `Register` declaration.
// `--field-rules` adds field rules in both D-44 forms, loose and with a
// declared record, combined with `anyOf`. `--wide <K>` gives `S0` K more
// scalars in the same cycle of types (D-12's large model); with
// `--field-rules`, one in six gets a loose rule and one in six a declared one.
// Usage: node bench/typing/gen.ts <N> [--field-rules] [--wide <K>]
//   -> bench/typing/gen/proto[-rules]-<N>[-wide<K>]/
// Files are overwritten, never deleted: one N always writes the same files.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const count = Number.parseInt(process.argv[2] ?? '', 10)
if (!Number.isInteger(count) || count < 2) {
	throw new Error('usage: gen.ts <N> [--field-rules], with N >= 2')
}
const fieldRules = process.argv.includes('--field-rules')
const wideAt = process.argv.indexOf('--wide')
const wide =
	wideAt === -1 ? 0 : Number.parseInt(process.argv[wideAt + 1] ?? '', 10)
if (!Number.isInteger(wide) || wide < 0) {
	throw new Error('usage: --wide <K>, with K >= 0')
}

const here = dirname(fileURLToPath(import.meta.url))
const project = join(
	here,
	'gen',
	`proto${fieldRules ? '-rules' : ''}-${count}${wide > 0 ? `-wide${wide}` : ''}`,
)
mkdirSync(join(project, 'src'), { recursive: true })
const write = (path: string, text: string): void => {
	writeFileSync(join(project, path), text)
}

write(
	'tsconfig.json',
	`${JSON.stringify(
		{
			extends: '../../../../tsconfig.base.json',
			compilerOptions: {
				allowImportingTsExtensions: true,
				composite: false,
				declaration: false,
				declarationMap: false,
				isolatedDeclarations: false,
				noEmit: true,
			},
			include: ['src/**/*.ts', '../../prototype/plugins.ts'],
		},
		null,
		'\t',
	)}\n`,
)

const name = (i: number): string => `S${i}`
const kernel = '../../../prototype/index.ts'

const scalars = fieldRules
	? `		f0: string().with({
			access: { update: ({ value }) => value.length > 0 },
		}),
		f1: number({ optional: true }),
		f2: boolean({ default: false }),
		f3: date({ optional: true }),
		f4: enumOf(['a', 'b', 'c'], { optional: true }),
		f5: string({ optional: true }).with<{ f2: boolean; f4: 'a' | 'b' | 'c' | null }>({
			access: {
				read: ({ record }) => record.f4 !== 'c',
				update: anyOf(({ record }) => record.f2, allow.private),
			},
		}),`
	: `		f0: string(),
		f1: number({ optional: true }),
		f2: boolean({ default: false }),
		f3: date({ optional: true }),
		f4: enumOf(['a', 'b', 'c'], { optional: true }),
		f5: string({ optional: true }),`

const wideField = (k: number): string => {
	const kind = k % 6
	if (kind === 0) {
		return fieldRules
			? `\t\tw${k}: string().with({ access: { update: ({ value }) => value.length > 0 } }),`
			: `\t\tw${k}: string(),`
	}
	if (kind === 1) return `\t\tw${k}: number({ optional: true }),`
	if (kind === 2) return `\t\tw${k}: boolean(),`
	if (kind === 3) return `\t\tw${k}: date({ optional: true }),`
	if (kind === 4)
		return `\t\tw${k}: enumOf(['a', 'b', 'c'], { optional: true }),`
	return fieldRules
		? `\t\tw${k}: string({ optional: true }).with<{ w${k - 3}: boolean; w${k - 1}: 'a' | 'b' | 'c' | null }>({
			access: {
				read: ({ record }) => record.w${k - 1} !== 'c',
				update: anyOf(({ record }) => record.w${k - 3}, allow.private),
			},
		}),`
		: `\t\tw${k}: string({ optional: true }),`
}
const wideFields = Array.from(
	{ length: wide },
	(_, k) => `\n${wideField(k)}`,
).join('')

for (let i = 0; i < count; i += 1) {
	const next = (i + 1) % count
	const previous = (i - 1 + count) % count
	const imports = [...new Set([next, previous])]
		.filter((j) => j !== i)
		.map((j) => `import { ${name(j)} } from './s${j}.ts'`)
		.join('\n')
	const builders = fieldRules
		? 'allow, anyOf, boolean, date, defineModel, enumOf, many, number, one, string'
		: 'allow, boolean, date, defineModel, enumOf, many, number, one, string'
	write(
		`src/s${i}.ts`,
		`import { ${builders} } from '${kernel}'
${imports}

export const ${name(i)} = defineModel({
	name: '${name(i)}',
	softDelete: true,
	fields: {
${scalars}${i === 0 ? wideFields : ''}
		next: one(() => ${name(next)}, { optional: true, onDelete: 'setNull' }),
		prevs: many(() => ${name(previous)}, { inverse: 'next' }),${
			i % 5 === 0
				? `\n\t\tparent: one(() => ${name(i)}, { optional: true }),`
				: ''
		}
	},
}).with({
	access: {
		read: ({ caller }) =>
			caller.kind === 'master' || {
				where: { f2: { equals: false }, next: { is: { f0: { equals: 'x' } } } },
			},
		update: ({ record }) => record.f0 !== 'x',
		create: allow.public,
	},
	hooks: {
		beforeUpdate: ({ record }) => {
			if (record.f0.length === 0) throw new TypeError('f0')
		},
	},
	acl: { default: { read: allow.public } },
	postgres: { table: 's${i}' },
})
`,
	)
}

const all = Array.from({ length: count }, (_, i) => name(i))
const importAll = all
	.map((model, i) => `import { ${model} } from './s${i}.ts'`)
	.join('\n')
write(
	'src/app.ts',
	`import { createApp } from '${kernel}'
${importAll}

export const app = createApp({ models: [${all.join(', ')}] })

declare module '../../../prototype/register.ts' {
	interface Register {
		readonly app: typeof app
	}
}
`,
)
write(
	'src/usage.ts',
	`${importAll}

${all
	.map(
		(model, i) =>
			`export const q${i} = await ${model}.findMany({ where: { f0: { equals: 'current' }, next: { is: { f2: { equals: true } } } }, select: { f0: true, f1: true, next: { select: { f0: true } } } })`,
	)
	.join('\n')}
export const hoverProbe = q0
export const editProbe = await S0.findMany({ where: { f0: { equals: 'valid' } } })
`,
)
console.log(project)
