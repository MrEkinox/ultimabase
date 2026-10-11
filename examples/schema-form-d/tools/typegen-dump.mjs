// Derived from ub-typing-spike/tools/real-baseline/probe.mjs: writes the real Typegen program to disk.
// Usage: node tools/typegen-dump.mjs <N> <out-dir>
import console from 'node:console'
import { Buffer } from 'node:buffer'
import { performance } from 'node:perf_hooks'
import process from 'node:process'

import { generateApplicationTypes } from '/Users/mrekinox/Desktop/ub-small/packages/typegen/dist/index.js'

import { createCurrentTypegenRuntimeFixture } from '/Users/mrekinox/Desktop/ub-small/packages/typegen/tests/performance/fixtures/current-typegen-runtime-fixture.mjs'
import fs from 'node:fs'
import path from 'node:path'

const schemaCount = Number.parseInt(process.argv[2] ?? '', 10)
if (!Number.isSafeInteger(schemaCount) || schemaCount < 1) {
	throw new TypeError('Expected a positive schema count')
}

const scalarFieldCount = 12
const completionMarker = '/* completion */'
const hoverMarker = '/* hover */'
const schemaName = (index) =>
	index === 0 ? 'User' : index === 1 ? 'Role' : `Schema${String(index)}`
const scalarName = (index) => `field${String(index)}`
const scalarMethod = (index) => (index % 2 === 0 ? 'string' : 'int')

const ultimabase = createCurrentTypegenRuntimeFixture(schemaCount)
const generationStartedAt = performance.now()
const generated = generateApplicationTypes({
	applicationId: `issue-6301-${String(schemaCount)}`,
	ultimabase,
})
const generationDurationMs = performance.now() - generationStartedAt

const sourceFields = (target) => `
${Array.from(
	{ length: scalarFieldCount },
	(_, index) =>
		`    ${scalarName(index)}: field.${scalarMethod(index)}(${index === 0 ? '{ required: true }' : ''}),`,
).join('\n')}
    children: field.relation({ target: '${target}' }),
    details: field.object({ fields: (field) => ({ label: field.string({ required: true }) }) }),
    embedding: field.vector({ dimensions: 3 }),
    related: field.pointer({ target: '${target}' }),`

const defineSourceSchema = (index) => {
	const name = schemaName(index)
	const target = 'User'
	const definition =
		index === 0
			? 'PasswordUserSchema.define(Authoring.Schema, '
			: index === 1
				? 'RoleSchema.define(Authoring.Schema, '
				: 'Authoring.Schema.define('
	const roleOptions = index === 1 ? '\n  members: { schema: User },' : ''
	const sourceOptions =
		index === 0
			? ''
			: `
  access: { update: { allow: true, item: ({ item }) => item.field0.length > 0 } },
  hooks: { afterOperation: { update: ({ item }) => { void item.field0 } } },`
	const shape = index < 2 ? '' : ".softDelete({ mode: 'command' })"
	return `export const ${name} = ${definition}{
  className: '${name}',${roleOptions}
  fields: (field) => ({${sourceFields(target)}
  }),${sourceOptions}
})${shape}`
}

const applicationSource = `
import { UltimaBase } from '@ultimabase/core'
import { accessPlugin } from '@ultimabase/access-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { PasswordUserSchema, passwordAuthPlugin } from '@ultimabase/password-auth-plugin'
import { pgVectorPlugin } from '@ultimabase/pg-vector-plugin'
import { RoleSchema, rolesPlugin } from '@ultimabase/roles-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'

const Authoring = UltimaBase.use(accessPlugin())
  .use(hooksPlugin())
  .use(pgVectorPlugin())
  .use(rolesPlugin())
  .use(softDeletePlugin())
  .use(validationPlugin())

${Array.from({ length: schemaCount }, (_, index) => defineSourceSchema(index)).join('\n\n')}

const Benchmark = Authoring.use(passwordAuthPlugin({ user: User }))
export const application = new Benchmark({
  logger: false,
  schemas: [${Array.from({ length: schemaCount }, (_, index) => schemaName(index)).join(', ')}],
})

${Array.from({ length: schemaCount }, (_, index) => {
	const name = schemaName(index)
	return `const query${String(index)} = ${name}.findMany({ where: { field0: { eq: 'current' } } })
void query${String(index)}`
}).join('\n')}
const completionProbe = User.findMany({ where: { ${completionMarker} } })
const hoverProbe = ${hoverMarker}query0
const editProbe = User.findMany({ where: { field0: { eq: 'valid' } } })
void completionProbe
void editProbe
void hoverProbe
`

const sourceWithMarkers = `${applicationSource}\n${generated.contents}`

// TypeScript 7 has no JS language service: write the same program to disk and
// let `tsc` check it. The directory links node_modules to the main worktree so
// that @ultimabase/* resolve to the built packages measured by the TS6 probe.
const outDir = path.resolve(process.argv[3])
fs.mkdirSync(outDir, { recursive: true })
const linked = path.join(outDir, 'node_modules')
if (!fs.existsSync(linked))
	fs.symlinkSync('/Users/mrekinox/Desktop/ub-small/node_modules', linked)
fs.writeFileSync(
	path.join(outDir, 'fixture.ts'),
	sourceWithMarkers
		.replace(completionMarker, ' '.repeat(completionMarker.length))
		.replace(hoverMarker, ' '.repeat(hoverMarker.length)),
)
fs.writeFileSync(
	path.join(outDir, 'tsconfig.json'),
	`${JSON.stringify({ compilerOptions: { exactOptionalPropertyTypes: true, module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, target: 'ESNext', noEmit: true }, files: ['fixture.ts'] }, null, '\t')}\n`,
)
console.log(
	JSON.stringify({
		schemaCount,
		generationDurationMs,
		declarationBytes: Buffer.byteLength(generated.contents),
		outDir,
	}),
)
