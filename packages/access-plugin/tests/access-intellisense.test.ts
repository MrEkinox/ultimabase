import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import * as ts from 'typescript'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'

const packageDirectory = path.dirname(fileURLToPath(import.meta.url))
const fixtureFile = path.join(
	packageDirectory,
	'access-intellisense.fixture.ts',
)

const completionNames = (source: string, marker: string): readonly string[] => {
	const position = source.indexOf(marker)
	if (position < 0) throw new TypeError(`Missing completion marker: ${marker}`)
	const service = createLanguageService(fixtureFile, source)

	return (
		service
			.getCompletionsAtPosition(fixtureFile, position, {})
			?.entries.map(({ name }) => name) ?? []
	)
}

describe('Access option IntelliSense', () => {
	it('keeps Core-only schema and field options free of Access vocabulary', () => {
		const source = `
import { Schema } from '@ultimabase/core'
Schema.define({ /* schema-options */ })
Schema.define({
  className: 'CoreOnly',
  fields: (field) => ({ value: field.string({ /* field-options */ }) }),
})
`

		expect(completionNames(source, '/* schema-options */')).not.toContain(
			'access',
		)
		expect(completionNames(source, '/* field-options */')).not.toContain(
			'access',
		)
		const invalidSource = `
import { Schema } from '@ultimabase/core'
Schema.define({
  className: 'CoreOnlyAccessFailure',
  fields: (field) => ({ value: field.string({ access: {} }) }),
  access: {},
})
`
		const diagnostics = createLanguageService(
			fixtureFile,
			invalidSource,
		).getSemanticDiagnostics(fixtureFile)
		const messages = diagnostics.map(({ messageText }) =>
			ts.flattenDiagnosticMessageText(messageText, '\n'),
		)

		expect(messages.join('\n')).toContain("'access' does not exist")
	})

	it('adds exact Access options when generated declarations install the plugin contract', () => {
		const source = `
import { Schema } from '@ultimabase/core'
import type { FieldAccessOption, SchemaAccessOption } from '@ultimabase/access-plugin'
declare module '@ultimabase/core' {
  interface UltimaBaseGeneratedFieldOptions {
    readonly access?: FieldAccessOption<this>
  }
  interface UltimaBaseGeneratedSchemaOptions {
    readonly access?: SchemaAccessOption<this>
  }
}
Schema.define({ /* schema-options */ })
Schema.define({
  className: 'WithAccess',
  fields: (field) => ({ value: field.string({ /* field-options */ }) }),
})
`

		expect(completionNames(source, '/* schema-options */')).toContain('access')
		expect(completionNames(source, '/* field-options */')).toContain('access')
	})
})
