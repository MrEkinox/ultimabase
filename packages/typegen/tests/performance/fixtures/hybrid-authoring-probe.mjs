import { readFileSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'

import { createTypegenSnapshot } from '../../../dist/index.js'

import { createCurrentTypegenRuntimeFixture } from './current-typegen-runtime-fixture.mjs'
import { runEditorProbe } from './editor-probe-runner.mjs'

const schemaCount = Number.parseInt(process.argv[2] ?? '', 10)
if (!Number.isSafeInteger(schemaCount) || schemaCount < 1) {
	throw new TypeError('Expected a positive schema count')
}

const scalarFieldCount = 12
const completionMarker = '/* completion */'
const hoverMarker = '/* hover */'
const contract = readFileSync(
	path.join(import.meta.dirname, 'hybrid-authoring-contract.ts'),
	'utf8',
)

const schemaName = (index) =>
	index === 0 ? 'User' : index === 1 ? 'Role' : `Schema${String(index)}`
const scalarName = (index) => `field${String(index)}`
const scalarBuilder = (index) => (index % 2 === 0 ? 'string' : 'int')
const scalarValue = (index) => (index % 2 === 0 ? 'string' : 'number')

const inlineScalar = (index) => `
        readonly ${scalarName(index)}: {
          readonly hasDefault: false
          readonly kind: '${index % 2 === 0 ? 'string' : 'int'}'
          readonly required: ${index === 0 ? 'true' : 'false'}
          readonly value: ${scalarValue(index)}
        }`

const createRegistry = () => `
// Generated application schema graph
export interface GeneratedSchemaRegistry {
${Array.from({ length: schemaCount }, (_, index) => {
	const name = schemaName(index)
	const next = 'User'
	const roleFields =
		name === 'Role'
			? `
        readonly members: SourceRelationField<'User'>
        readonly name: RoleNameField
        readonly roles: SourceRelationField<'Role'>`
			: ''
	return `  readonly ${name}: GeneratedSchema<
    '${name}',
    {${Array.from({ length: scalarFieldCount }, (_, fieldIndex) =>
			inlineScalar(fieldIndex),
		).join('')}
        readonly children: SourceRelationField<'${next}'>
        readonly details: {
          readonly fields: {
            readonly label: {
              readonly hasDefault: false
              readonly kind: 'string'
              readonly required: true
              readonly value: string
            }
          }
          readonly hasDefault: false
          readonly kind: 'object'
          readonly required: false
        }
        readonly embedding: VectorField
        readonly isDeleted: SoftDeleteField
        readonly related: {
          readonly hasDefault: false
          readonly kind: 'pointer'
          readonly required: false
          readonly target: '${next}'
        }${roleFields}
	    }
  >`
}).join('\n')}
}
`

const createSchemaDefinitions = () => `
import type * as CurrentAccess from '@ultimabase/access-plugin'
import type * as CurrentCore from '@ultimabase/core'
import type * as CurrentHooks from '@ultimabase/hooks-plugin'
import type * as CurrentPassword from '@ultimabase/password-auth-plugin'
import type * as CurrentVector from '@ultimabase/pg-vector-plugin'
import type * as CurrentRoles from '@ultimabase/roles-plugin'
import type * as CurrentSoftDelete from '@ultimabase/soft-delete-plugin'
import type * as CurrentValidation from '@ultimabase/validation-plugin'

type CurrentPackageDeclarationBaseline = readonly [
  typeof CurrentAccess,
  typeof CurrentCore,
  typeof CurrentHooks,
  typeof CurrentPassword,
  typeof CurrentVector,
  typeof CurrentRoles,
  typeof CurrentSoftDelete,
  typeof CurrentValidation,
]
declare const currentPackageDeclarationBaseline: CurrentPackageDeclarationBaseline
void currentPackageDeclarationBaseline

declare const textValidation: StandardSchema<string>

const Benchmark = UltimaBase.use(accessPlugin())
  .use(hooksPlugin())
  .use(passwordAuthPlugin())
  .use(pgVectorPlugin())
  .use(rolesPlugin())
  .use(softDeletePlugin({ defaultMode: 'explicit' }))
  .use(validationPlugin())

${Array.from({ length: schemaCount }, (_, index) => {
	const name = schemaName(index)
	const next = 'User'
	return `export const ${name} = Benchmark.Schema.define({
  className: '${name}',
  fields: (field) => ({
${Array.from(
	{ length: scalarFieldCount },
	(_, fieldIndex) =>
		`    ${scalarName(fieldIndex)}: field.${scalarBuilder(fieldIndex)}({${fieldIndex === 0 ? ' required: true,' : ''}${fieldIndex === 0 ? ' validation: textValidation,' : ''} }),`,
).join('\n')}
    children: field.relation({ target: '${next}' }),
    details: field.object({
      fields: (field) => ({ label: field.string({ required: true }) }),
    }),
    embedding: field.vector({ dimensions: 3 }),
    related: field.pointer({ target: '${next}' }),
  }),
  access: {
    read: {
      filter: ({ where }) => ({ ...where, related: { is: { field0: { ne: 'blocked' } } } }),
      item: ({ item }) => item.field0.length > 0,
    },
  },
  hooks: {
    afterOperation: { update: ({ item }) => { void item.field0 } },
  },
  softDelete: 'explicit',
})`
}).join('\n\n')}

export const application = new Benchmark({
  schemas: [${Array.from({ length: schemaCount }, (_, index) => schemaName(index)).join(', ')}],
})
`

const createUsage = () => `
${Array.from({ length: schemaCount }, (_, index) => {
	const name = schemaName(index)
	const roleData = name === 'Role' ? ", name: 'editor'" : ''
	return `
const query${String(index)} = ${name}.findMany({
  select: { field0: true, field1: true, isDeleted: true },
  where: { field0: { eq: 'current' }, related: { is: { field0: { ne: 'next' } } } },
})
const create${String(index)} = ${name}.createOne({
  data: { field0: 'created'${roleData}, children: { connect: ['child'] }, details: { label: 'nested' }, embedding: [0.1, 0.2, 0.3] },
  select: { field0: true, isDeleted: true },
})
const update${String(index)} = ${name}.updateOne({
  data: { field1: 1 },
  where: { field0: { eq: 'current' } },
})
void create${String(index)}
void query${String(index)}
void update${String(index)}`
}).join('\n')}

const completionProbe = ${schemaName(0)}.findMany({ where: { ${completionMarker} } })
const hoverProbe = ${hoverMarker}query0
const editProbe = ${schemaName(0)}.findMany({ where: { field0: { eq: 'valid' } } })
${schemaCount > 1 ? "Role.role('editor').selector.toUpperCase()" : ''}
${schemaName(0)}.signUp({ field0: 'Ada', password: 'secret', username: 'ada' })
application.operations.runWithSession('token', () => ${schemaName(0)}.findMany())
void completionProbe
void editProbe
void hoverProbe
`

const generationStartedAt = performance.now()
createTypegenSnapshot(
	createCurrentTypegenRuntimeFixture(schemaCount),
	`issue-6301-hybrid-${String(schemaCount)}`,
)
const generatedRegistry = createRegistry()
const sourceWithMarkers = `${contract}\n${generatedRegistry}\n${createSchemaDefinitions()}\n${createUsage()}`
const generationDurationMs = performance.now() - generationStartedAt

runEditorProbe({
	completionMarker,
	declarationEndMarker:
		"import type * as CurrentAccess from '@ultimabase/access-plugin'",
	declarationStartMarker: '// Generated application schema graph',
	editFrom: "'valid'",
	editTo: '42     ',
	generationDurationMs,
	hoverMarker,
	scalarFieldCount,
	scenario: 'hybrid',
	schemaCount,
	sourceWithMarkers,
})
