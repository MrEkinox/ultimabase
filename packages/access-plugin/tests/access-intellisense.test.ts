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
import { Schema } from '@ultimabase/core'
Schema.define({ /* schema-options */ })
Schema.define({
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
import { Schema } from '@ultimabase/core'
Schema.define({
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
		const generatedFile = fixtureFile('generated-options')
		const fixture = createLanguageServiceFixture(generatedFile, source, [
			'/* schema-options */',
			'/* field-options */',
		])

		expect(
			completionNames(fixture, generatedFile, '/* schema-options */'),
		).toContain('access')
		expect(
			completionNames(fixture, generatedFile, '/* field-options */'),
		).toContain('access')
	})

	it('offers granular plugin defaults with sparse read capabilities', () => {
		const source = `
import { accessPlugin } from '@ultimabase/access-plugin'
accessPlugin({
  default: {
    /* operation-defaults */
	read: { count: false, /* read-defaults */ },
  },
})
`
		const defaultsFile = fixtureFile('plugin-defaults')
		const fixture = createLanguageServiceFixture(
			defaultsFile,
			source,
			['/* operation-defaults */', '/* read-defaults */'],
			coreWorkspace,
		)

		expect(
			completionNames(fixture, defaultsFile, '/* operation-defaults */'),
		).toEqual(expect.arrayContaining(['create', 'delete', 'update', 'upsert']))
		expect(
			completionNames(fixture, defaultsFile, '/* read-defaults */'),
		).toEqual(expect.arrayContaining(['exists', 'many', 'one']))
		const diagnostics = fixture.service.getSemanticDiagnostics(defaultsFile)

		expect(diagnostics).toStrictEqual([])
	})
})
