import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'

const packageDirectory = path.dirname(fileURLToPath(import.meta.url))
const fixtureFile = path.join(packageDirectory, 'hooks-intellisense.fixture.ts')

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

describe('Hooks option IntelliSense', () => {
	it('rejects Hooks options when the generated contract omits the plugin', () => {
		const completionSource = `
import { Schema } from '@ultimabase/core'
Schema.define({ /* schema-options */ })
Schema.define({
  className: 'CoreOnlyHooks',
  fields: (field) => ({ value: field.string({ /* field-options */ }) }),
})
`

		expect(
			completionNames(completionSource, '/* schema-options */'),
		).not.toContain('hooks')
		expect(
			completionNames(completionSource, '/* field-options */'),
		).not.toContain('hooks')

		const invalidSource = `
import { Schema } from '@ultimabase/core'
Schema.define({
  className: 'CoreOnlyHooksFailure',
  fields: (field) => ({ value: field.string({ hooks: {} }) }),
  hooks: {},
})
`
		const messages = createLanguageService(fixtureFile, invalidSource)
			.getSemanticDiagnostics(fixtureFile)
			.map(({ messageText }) =>
				ts.flattenDiagnosticMessageText(messageText, '\n'),
			)

		expect(messages.join('\n')).toContain("'hooks' does not exist")
	})

	it('adds exact Hooks options when generated declarations install the contract', () => {
		const source = `
import { Schema } from '@ultimabase/core'
import type { FieldHooksOption, SchemaHooksOption } from '@ultimabase/hooks-plugin'
declare module '@ultimabase/core' {
  interface UltimaBaseGeneratedFieldOptions {
    readonly hooks?: FieldHooksOption<this>
  }
  interface UltimaBaseGeneratedSchemaOptions {
    readonly hooks?: SchemaHooksOption<this>
  }
}
Schema.define({ /* schema-options */ })
Schema.define({
  className: 'WithHooks',
  fields: (field) => ({ value: field.string({ /* field-options */ }) }),
})
`

		expect(completionNames(source, '/* schema-options */')).toContain('hooks')
		expect(completionNames(source, '/* field-options */')).toContain('hooks')
	})

	it('exposes the optional nested graph on schema mutation hooks', () => {
		const source = `
import { Schema } from '@ultimabase/core'
import type { SchemaHooksOption } from '@ultimabase/hooks-plugin'
declare module '@ultimabase/core' {
  interface UltimaBaseGeneratedSchemaOptions {
    readonly hooks?: SchemaHooksOption<this>
  }
}
Schema.define({
  className: 'NestedHookInput',
  fields: (field) => ({ title: field.string() }),
  hooks: { afterOperation: { create: (input) => input./* hook-input */ } },
})
`

		expect(completionNames(source, '/* hook-input */')).toContain('nestedWrite')
	})
})
