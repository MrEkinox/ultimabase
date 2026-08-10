import path from 'node:path'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'
import { whereLogicalKeys } from '../../src/query/filters/where.js'
import {
	reservedQueryLogicalFieldNames,
	reservedSchemaModelFieldNames,
} from '../../src/schema/schema/reserved-field-names.js'
import { reservedSystemFieldNames } from '../../src/schema/schema/system-fields.js'

const reservedFieldNames = [
	...reservedSystemFieldNames,
	...reservedQueryLogicalFieldNames,
	...reservedSchemaModelFieldNames,
]

const schemaCases = reservedFieldNames
	.map(
		(name, index) => `
// @ts-expect-error -- ${name} is reserved by the public schema contract.
Schema.define({
  className: 'ReservedSchema${String(index)}',
  fields: (field) => ({ ${JSON.stringify(name)}: field.string() }),
})`,
	)
	.join('\n')

const extensionCases = reservedFieldNames
	.map(
		(name, index) => `
const reservedExtension${String(index)} = defineSchemaExtension(
  'fixture.reserved.${String(index)}',
  {},
  'fixture.reserved',
  // @ts-expect-error -- ${name} is reserved for exact extension field maps.
  { fields: { ${JSON.stringify(name)}: stringField() } },
)`,
	)
	.join('\n')

const source = `
import {
  defineSchemaExtension,
  Schema,
  stringField,
} from '../../src/index.js'

${schemaCases}
${extensionCases}

const dynamicField = stringField()
const dynamicFields: Record<string, typeof dynamicField> = {
  create: dynamicField,
}
const dynamicExtension = defineSchemaExtension(
  'fixture.dynamic',
  {},
  'fixture.dynamic',
  { fields: dynamicFields },
)

Schema.define({
  className: 'DynamicReservedFields',
  fields: () => dynamicFields,
  extensions: [dynamicExtension],
})
`

describe('reserved schema field names in the public language service', () => {
	it('derives immutable runtime categories from their canonical declarations', () => {
		expect(whereLogicalKeys).toBe(reservedQueryLogicalFieldNames)
		expect(Object.isFrozen(reservedSystemFieldNames)).toBe(true)
		expect(Object.isFrozen(reservedQueryLogicalFieldNames)).toBe(true)
		expect(Object.isFrozen(reservedSchemaModelFieldNames)).toBe(true)
	})

	it('rejects every exact literal and retains dynamic runtime boundaries', () => {
		const fileName = path.join(
			import.meta.dirname,
			'reserved-field-names.fixture.ts',
		)
		const service = createLanguageService(fileName, source)
		const diagnostics = service
			.getSemanticDiagnostics(fileName)
			.map(({ messageText }) =>
				ts.flattenDiagnosticMessageText(messageText, '\n'),
			)

		expect(diagnostics).toStrictEqual([])
		service.dispose()
	})
})
