// Micro-test M generator: N schemas with the field graph of tools/gen.mjs (6 scalars, ring
// `next`, inverse `prevs` by next, a self pointer one schema in five, one findMany per
// schema), string field DSL, application registry. No rules (M defines no rules form).
// Usage: node forms/m-string-dsl/gen.mjs <N>  ->  forms/m-string-dsl/gen/m-string-dsl-<N>/
import fs from 'node:fs'
import path from 'node:path'

const formDir = path.dirname(new URL(import.meta.url).pathname)
const count = Number.parseInt(process.argv[2], 10)
const dir = path.join(formDir, 'gen', `m-string-dsl-${count}`)
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ extends: '../../../../tsconfig.base.json', compilerOptions: { allowImportingTsExtensions: true }, include: ['src/**/*.ts'] }, null, '\t'))
const name = (i) => `S${i}`
for (let i = 0; i < count; i += 1) {
	const next = (i + 1) % count
	const previous = (i - 1 + count) % count
	fs.writeFileSync(
		path.join(dir, 'src', `s${i}.ts`),
		`import { App } from '../../../lib/core.ts'

export const ${name(i)} = App.Schema.define({
	className: '${name(i)}',
	fields: {
		f0: 'string',
		f1: 'int?',
		f2: 'boolean = false',
		f3: 'date?',
		f4: 'string?',
		f5: 'string?',
		next: '${name(next)}?',
		prevs: '${name(previous)}[] by next',${i % 5 === 0 ? `\n\t\tparent: '${name(i)}?',` : ''}
	},
})
`,
	)
}
const all = Array.from({ length: count }, (_, i) => name(i))
const importAll = all.map((n, i) => `import { ${n} } from './s${i}.ts'`).join('\n')
fs.writeFileSync(
	path.join(dir, 'src/application.ts'),
	`import { App } from '../../../lib/core.ts'
${importAll}

export const app = new App({ schemas: [${all.join(', ')}] })

declare module '../../../lib/types.ts' {
	interface Register {
		readonly app: typeof app
	}
}
`,
)
fs.writeFileSync(
	path.join(dir, 'src/usage.ts'),
	`${importAll}

${all.map((n, i) => `export const q${i} = await ${n}.findMany({ where: { f0: { eq: 'current' }, next: { is: { f2: { eq: true } } } }, select: { f0: true, f1: true }, include: { next: { select: { f0: true } } } })`).join('\n')}
export const hoverProbe = q0
export const editProbe = await S0.findMany({ where: { f0: { eq: 'valid' } } })
`,
)
console.log(dir)
