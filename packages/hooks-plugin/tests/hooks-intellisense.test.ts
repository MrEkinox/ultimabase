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
import { UltimaBase } from '@ultimabase/core'
UltimaBase.Schema.define({ /* schema-options */ })
UltimaBase.Schema.define({
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
import { UltimaBase } from '@ultimabase/core'
UltimaBase.Schema.define({
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

	it('adds exact Hooks rules and field options from the configured plugin source', () => {
		const source = `
import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
const Application = UltimaBase.use(hooksPlugin())
Application.Schema.define({ /* schema-options */ })
Application.Schema.define({
  className: 'WithHooks',
  fields: (field) => ({ value: field.string({ /* field-options */ }) }),
}).with({ /* schema-rules */ })
`
		const sourceFile = fixtureFile('source-options')
		const fixture = createLanguageServiceFixture(sourceFile, source, [
			'/* schema-options */',
			'/* field-options */',
			'/* schema-rules */',
		])

		// Rules belong to the final `.with` call, not to define (ADR-0297).
		expect(
			completionNames(fixture, sourceFile, '/* schema-options */'),
		).not.toContain('hooks')
		expect(
			completionNames(fixture, sourceFile, '/* schema-rules */'),
		).toContain('hooks')
		expect(
			completionNames(fixture, sourceFile, '/* field-options */'),
		).toContain('hooks')
	})

	it('gives schema hooks plain data, without the internal operation tree', () => {
		const source = `
import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
const Application = UltimaBase.use(hooksPlugin())
Application.Schema.define({
  className: 'NestedHookInput',
  fields: (field) => ({ title: field.string() }),
}).with({ hooks: { afterOperation: { create: (input) => input./* hook-input */ } } })
`
		const nestedFile = fixtureFile('nested-hook-input')
		const fixture = createLanguageServiceFixture(nestedFile, source, [
			'/* hook-input */',
		])

		// ADR-0318: the operation tree stays with provideHookContributions.
		const names = completionNames(fixture, nestedFile, '/* hook-input */')
		expect(names).toEqual(
			expect.arrayContaining(['context', 'item', 'kind', 'originalItem']),
		)
		expect(names).not.toContain('nestedWrite')
		expect(names).not.toContain('operation')
	})
})
