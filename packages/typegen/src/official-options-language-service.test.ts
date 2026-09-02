import path from 'node:path'

import { accessPlugin } from '@ultimabase/access-plugin'
import { FrameworkApplication, Schema } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { expect, it } from 'vitest'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'

import { generateApplicationTypes } from './generator.js'

const fieldOptionsMarker = '/* official-field-options */'
const schemaOptionsMarker = '/* official-schema-options */'

it('composes installed Access, Hooks, and Validation authoring contracts', () => {
	const Document = Schema.define({
		className: 'OfficialOptionDocument',
		fields: (field) => ({ title: field.string() }),
	})
	const generated = generateApplicationTypes({
		application: new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [accessPlugin(), hooksPlugin(), validationPlugin()],
			schemas: [Document],
		}),
		applicationId: 'fixture.official-options',
	})
	const PlainDocument = Schema.define({
		className: 'OfficialOptionDocument',
		fields: (field) => ({ title: field.string() }),
	})
	const withoutOfficialPlugins = generateApplicationTypes({
		application: new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [],
			schemas: [PlainDocument],
		}),
		applicationId: 'fixture.official-options',
	})
	const sourceWithMarkers = `${generated.contents}
import { Schema } from '@ultimabase/core'
declare const titleValidator: import('@standard-schema/spec').StandardSchemaV1<string>

const TypedDocument = Schema.define({
  className: 'OfficialOptionDocument',
  access: { read: true },
  hooks: { beforeOperation: { create: ({ item }) => { void item.title } } },
  fields: (field) => ({
    summary: field.string({ ${fieldOptionsMarker} }),
    title: field.string({
      access: { read: true, write: true },
      hooks: { resolveInput: ({ value }) => value?.trim() ?? null },
      required: true,
      validation: titleValidator,
    }),
  }),
})
const CompletionDocument = Schema.define({
  className: 'OfficialOptionCompletion',
  ${schemaOptionsMarker}
  fields: (field) => ({ title: field.string() }),
})
void CompletionDocument
void TypedDocument
`
	const fieldOptionsPosition = sourceWithMarkers.indexOf(fieldOptionsMarker)
	const schemaOptionsPosition = sourceWithMarkers.indexOf(schemaOptionsMarker)
	const source = sourceWithMarkers
		.replace(fieldOptionsMarker, ' '.repeat(fieldOptionsMarker.length))
		.replace(schemaOptionsMarker, ' '.repeat(schemaOptionsMarker.length))
	const fileName = path.join(
		import.meta.dirname,
		'official-options.semantic.fixture.ts',
	)
	const service = createLanguageService(fileName, source)
	const completionNames = (position: number): readonly string[] =>
		service
			.getCompletionsAtPosition(fileName, position, {})
			?.entries.map(({ name }) => name) ?? []

	expect(service.getSemanticDiagnostics(fileName)).toStrictEqual([])
	expect(completionNames(fieldOptionsPosition)).toEqual(
		expect.arrayContaining(['access', 'hooks', 'required', 'validation']),
	)
	expect(completionNames(schemaOptionsPosition)).toEqual(
		expect.arrayContaining(['access', 'hooks']),
	)
	expect(generated.contents).toContain(
		'FieldValidationCompatibility<TOptions, TValue>',
	)
	expect(generated.contents).not.toContain('titleValidator')
	expect(withoutOfficialPlugins.snapshot.options).toStrictEqual([])
	expect(withoutOfficialPlugins.fingerprint).not.toBe(generated.fingerprint)
	for (const option of ['access', 'hooks', 'validation']) {
		expect(withoutOfficialPlugins.contents).not.toContain(
			`readonly ${option}?:`,
		)
	}

	service.dispose()
})
