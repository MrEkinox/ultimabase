import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
	createLanguageServiceFixture,
	createLanguageServiceWorkspace,
	type LanguageServiceFixture,
} from '../../../tooling/vitest/typescript-language-service.js'

const packageDirectory = path.dirname(fileURLToPath(import.meta.url))
const fixtureFile = (name: string) =>
	path.join(packageDirectory, `hooks-intellisense-${name}.fixture.ts`)
const coreWorkspace = createLanguageServiceWorkspace()

const completionNames = (
	fixture: LanguageServiceFixture,
	fileName: string,
	marker: string,
): readonly string[] => {
	return (
		fixture.service
			.getCompletionsAtPosition(fileName, fixture.positionOf(marker), {})
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
		const completionFile = fixtureFile('core-options')
		const fixture = createLanguageServiceFixture(
			completionFile,
			completionSource,
			['/* schema-options */', '/* field-options */'],
			coreWorkspace,
		)

		expect(
			completionNames(fixture, completionFile, '/* schema-options */'),
		).not.toContain('hooks')
		expect(
			completionNames(fixture, completionFile, '/* field-options */'),
		).not.toContain('hooks')

		const invalidSource = `
import { Schema } from '@ultimabase/core'
Schema.define({
  className: 'CoreOnlyHooksFailure',
  fields: (field) => ({ value: field.string({ hooks: {} }) }),
  hooks: {},
})
`
		const invalidFile = fixtureFile('core-invalid')

		coreWorkspace.addFile(invalidFile, invalidSource)
		const messages = coreWorkspace.service
			.getSemanticDiagnostics(invalidFile)
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
		const generatedFile = fixtureFile('generated-options')
		const fixture = createLanguageServiceFixture(generatedFile, source, [
			'/* schema-options */',
			'/* field-options */',
		])

		expect(
			completionNames(fixture, generatedFile, '/* schema-options */'),
		).toContain('hooks')
		expect(
			completionNames(fixture, generatedFile, '/* field-options */'),
		).toContain('hooks')
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
		const nestedFile = fixtureFile('nested-hook-input')
		const fixture = createLanguageServiceFixture(nestedFile, source, [
			'/* hook-input */',
		])

		expect(completionNames(fixture, nestedFile, '/* hook-input */')).toContain(
			'nestedWrite',
		)
	})
})
