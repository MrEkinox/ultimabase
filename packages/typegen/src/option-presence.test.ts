import path from 'node:path'

import {
	UltimaBase,
	addSchemaField,
	defineFieldOption,
	plugin as createPlugin,
	contributeDeclarations,
	defineSchemaOption,
	stringField,
	type FieldBuilder,
	type SchemaOptionRuntimeRequirement,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'

import { generateApplicationTypes } from './generator.js'

describe('option-presence Typegen', () => {
	it('renders public options without exposing values or compiler-only markers', () => {
		const checkedFieldOption = defineFieldOption<string>({
			contexts: ['stored'],
			normalize: (value, path) => {
				if (typeof value !== 'string') {
					throw new TypeError(`${path} must be a string`)
				}
				return value
			},
			protocolVersion: 1,
			typegen: {
				compatibilityType: 'CheckedFieldOptionCompatibility',
				module: '@fixture/typegen-document-plugin',
				type: 'CheckedFieldOption',
			},
		})
		const documentOption = defineSchemaOption<(value: string) => string>({
			normalize: (value, path) => {
				if (typeof value !== 'function') {
					throw new TypeError(`${path} must be a function`)
				}
				return value as (value: string) => string
			},
			protocolVersion: 1,
			typegen: {
				module: '@fixture/typegen-document-plugin',
				type: 'DocumentOption',
			},
			valueKind: 'opaque',
		})
		const internalOption = defineSchemaOption<
			'factory-owned',
			SchemaOptionRuntimeRequirement,
			never
		>({
			normalize: (value, path) => {
				if (value !== 'factory-owned') {
					throw new TypeError(`${path} must be factory-owned`)
				}

				return value
			},
			protocolVersion: 1,
			typegen: false,
			valueKind: 'opaque',
		})
		const plugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.typegen-document',
			permissions: {
				'schema:declare': 'Adds a generated field for the direct option.',
			},
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
						const options = schemas.defineOptions({
							contributionId: 'document-options',
							field: { checked: checkedFieldOption },
							schema: {
								document: documentOption,
								'fixture.internal-marker': internalOption,
							},
						})
						const patch = schemas.patch({
							operations: [
								addSchemaField({
									contributionId: 'document-state',
									field: stringField(),
									name: 'documentState',
								}),
							],
							targets: schemas.select({ option: { name: 'document' } }),
						})

						return [options, patch] as const
					},
				}),
			],
		})
		const Application = UltimaBase.use(plugin)
		const internalMarker = {
			'fixture.internal-marker': 'factory-owned',
		} as const
		const Document = Application.Schema.define({
			className: 'TypegenOptionPresenceDocument',
			document: (value: string) => value,
			fields: (field: FieldBuilder) => ({
				title: field.string({ checked: 'enabled' } as never),
			}),
			// This test fixture injects a compiler-only marker outside the public API.
			...internalMarker,
		} as never)
		const application = new Application({
			pluginPrivileges: { logger: false },
			schemas: [Document],
		})
		const generated = generateApplicationTypes({
			ultimabase: application,
			applicationId: 'fixture.option-presence',
		})

		expect(generated.snapshot.schemas[0]?.fields).toContainEqual(
			expect.objectContaining({ name: 'documentState' }),
		)
		expect(generated.contents).toContain('documentState')
		expect(generated.contents).toContain('readonly document?:')
		expect(generated.contents).toContain('readonly checked?:')
		expect(generated.contents).toContain(
			'interface UltimaBaseGeneratedFieldOptionCompatibility<TOptions extends object, TValue>',
		)
		expect(generated.contents).toContain('CheckedFieldOptionCompatibility<')
		expect(generated.contents).not.toContain('fixture.internal-marker')
		expect(generated.contents).not.toContain('(value: string) => string')

		const marker = '/* schema-option-completion */'
		const sourceWithMarker = `${generated.contents}
import { UltimaBase, contributeDeclarations, defineSchemaOption, plugin } from '@ultimabase/core'
const documentOption = defineSchemaOption({
  normalize: (value: unknown) => {
    if (typeof value !== 'string') throw new TypeError('document must be a string')
    return value
  },
  protocolVersion: 1,
  typegen: false,
})
const Application = UltimaBase.use(plugin({
  id: 'fixture.source-document',
  version: '1.0.0',
  core: '^0.0.0',
  permissions: { 'schema:declare': 'Declares the document option.' },
  contributions: [contributeDeclarations({
    schema: ({ schemas }) => schemas.defineOptions({
      contributionId: 'document-options',
      schema: { document: documentOption },
    }),
  })],
}))
Application.Schema.define({
  className: 'CompletionDocument',
  ${marker}
  fields: (field) => ({ title: field.string() }),
})
`
		const position = sourceWithMarker.indexOf(marker)
		const source = sourceWithMarker.replace(marker, ' '.repeat(marker.length))
		const fileName = path.join(
			import.meta.dirname,
			'compiler-only-option.semantic.fixture.ts',
		)
		const completions =
			createLanguageService(fileName, source)
				.getCompletionsAtPosition(fileName, position, {})
				?.entries.map(({ name }) => name) ?? []

		expect(completions).toContain('document')
		expect(completions).not.toContain('fixture.internal-marker')
	})
})
