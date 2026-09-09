import path from 'node:path'

import {
	FrameworkApplication,
	Schema,
	addSchemaField,
	defineFieldOption,
	definePlugin,
	defineSchemaOption,
	stringField,
	type SchemaOptions,
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
		const internalOption = defineSchemaOption({
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
		const plugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.typegen-document',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Adds a generated field for the direct option.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.defineOptions({
					contributionId: 'document-options',
					field: { checked: checkedFieldOption },
					schema: {
						document: documentOption,
						'fixture.internal-marker': internalOption,
					},
				})
				schemas.patch({
					operations: [
						addSchemaField({
							contributionId: 'document-state',
							field: stringField(),
							name: 'documentState',
						}),
					],
					targets: schemas.select({ option: { name: 'document' } }),
				})
			},
		})
		const Document = Schema.define({
			className: 'TypegenOptionPresenceDocument',
			document: (value: string) => value,
			fields: (field) => ({
				// @ts-expect-error -- Typegen owns this application-local field option.
				title: field.string({ checked: 'enabled' }),
			}),
			'fixture.internal-marker': 'factory-owned',
		} as SchemaOptions<'TypegenOptionPresenceDocument'> & {
			readonly document: (value: string) => string
			readonly 'fixture.internal-marker': 'factory-owned'
		})
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [plugin],
			schemas: [Document],
		})
		const generated = generateApplicationTypes({
			application,
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
import { Schema } from '@ultimabase/core'
Schema.define({
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
