import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import * as ts from 'typescript'

import {
	createLanguageServiceFixture,
	createLanguageServiceWorkspace,
	type LanguageServiceFixture,
} from '../../../tooling/vitest/typescript-language-service.js'

const packageDirectory = path.dirname(fileURLToPath(import.meta.url))
const fixtureFile = (name: string) =>
	path.join(packageDirectory, `access-intellisense-${name}.fixture.ts`)
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

describe('Access option IntelliSense', () => {
	it('keeps Core-only schema and field options free of Access vocabulary', () => {
		const source = `
import { UltimaBase } from '@ultimabase/core'
UltimaBase.Schema.define({ /* schema-options */ })
UltimaBase.Schema.define({
  className: 'CoreOnly',
  fields: (field) => ({ value: field.string({ /* field-options */ }) }),
})
`
		const completionFile = fixtureFile('core-options')
		const fixture = createLanguageServiceFixture(
			completionFile,
			source,
			['/* schema-options */', '/* field-options */'],
			coreWorkspace,
		)

		expect(
			completionNames(fixture, completionFile, '/* schema-options */'),
		).not.toContain('access')
		expect(
			completionNames(fixture, completionFile, '/* field-options */'),
		).not.toContain('access')
		const invalidSource = `
import { UltimaBase } from '@ultimabase/core'
UltimaBase.Schema.define({
  className: 'CoreOnlyAccessFailure',
  fields: (field) => ({ value: field.string({ access: {} }) }),
  access: {},
})
`
		const invalidFile = fixtureFile('core-invalid')

		coreWorkspace.addFile(invalidFile, invalidSource)
		const diagnostics =
			coreWorkspace.service.getSemanticDiagnostics(invalidFile)
		const messages = diagnostics.map(({ messageText }) =>
			ts.flattenDiagnosticMessageText(messageText, '\n'),
		)

		expect(messages.join('\n')).toContain("'access' does not exist")
	})

	it('adds exact Access options from the configured plugin source', () => {
		const source = `
import type {} from './fixtures/options.generated.js'
import { UltimaBase } from '@ultimabase/core'
import { accessPlugin } from '@ultimabase/access-plugin'
const Application = UltimaBase.use(accessPlugin())
Application.Schema.define({ /* schema-options */ })
Application.Schema.define({
  className: 'WithAccess',
  fields: (field) => ({ value: field.string({ /* field-options */ }) }),
})
`
		const sourceFile = fixtureFile('source-options')
		const fixture = createLanguageServiceFixture(sourceFile, source, [
			'/* schema-options */',
			'/* field-options */',
		])

		expect(
			completionNames(fixture, sourceFile, '/* schema-options */'),
		).toContain('access')
		expect(
			completionNames(fixture, sourceFile, '/* field-options */'),
		).toContain('access')
	})

	it('offers every allowWithoutRule key and accepts each value form', () => {
		const source = `
import { isAuthenticated } from '@ultimabase/core'
import { accessPlugin } from '@ultimabase/access-plugin'
accessPlugin({
  allowWithoutRule: {
    /* opening-keys */
    read: true,
    count: false,
    write: isAuthenticated,
    all: 'development',
  },
})
`
		const openingsFile = fixtureFile('plugin-openings')
		const fixture = createLanguageServiceFixture(
			openingsFile,
			source,
			['/* opening-keys */'],
			coreWorkspace,
		)

		expect(
			completionNames(fixture, openingsFile, '/* opening-keys */'),
		).toEqual(
			expect.arrayContaining([
				'create',
				'delete',
				'exists',
				'many',
				'one',
				'update',
				'upsert',
			]),
		)
		const diagnostics = fixture.service.getSemanticDiagnostics(openingsFile)

		expect(diagnostics).toStrictEqual([])
	})
})
