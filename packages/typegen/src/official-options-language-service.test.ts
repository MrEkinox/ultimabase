import path from 'node:path'

import { accessPlugin } from '@ultimabase/access-plugin'
import {
	UltimaBase,
	Schema,
	contributeDeclarations,
	defineOperationValue,
	plugin,
	defineSchemaMutation,
	defineTypegenReference,
} from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'
import { expect, it } from 'vitest'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'

import { generateApplicationTypes } from './generator.js'

const fieldOptionsMarker = '/* official-field-options */'
const schemaOptionsMarker = '/* official-schema-options */'
const mutationAccessMarker = '/* schema-mutation-access */'
const mutationBeforeHookMarker = '/* schema-mutation-before-hook */'
const mutationAfterHookMarker = '/* schema-mutation-after-hook */'

it('composes installed Access, Hooks, and Validation authoring contracts', () => {
	const Document = Schema.define({
		className: 'OfficialOptionDocument',
		fields: (field) => ({ title: field.string() }),
	})
	const inputReference = defineTypegenReference({
		exportName: 'BaseItem',
		module: '@ultimabase/core',
	})
	const archive = defineSchemaMutation({
		authority: 'request',
		effect: 'update',
		input: defineOperationValue((value) => value, inputReference),
		name: 'fixture.official-options.archive',
		returning: 'after',
		version: '1.0.0',
	})
	const purge = defineSchemaMutation({
		authority: 'master',
		effect: 'delete',
		input: defineOperationValue((value) => value, inputReference),
		name: 'fixture.official-options.purge',
		returning: 'before',
		version: '1.0.0',
	})
	const mutationOwner = plugin({
		core: '^0.0.0',
		id: 'fixture.official-options-mutations',
		permissions: {
			'model:extend': 'Adds typed schema mutations.',
			'operation:declare': 'Declares schema mutations.',
			'typegen:reference': 'References the input type.',
		},
		contributions: [
			contributeDeclarations({
				models: ({ models }) => {
					models.extend(Document, {
						contributionId: 'document-mutations',
						schemaMutations: {
							archive: { mutation: archive, surfaces: ['schema'] },
							purge: { mutation: purge, surfaces: ['schema'] },
						},
					})
				},
				operations: ({ operations }) => {
					operations.declare(archive)
					operations.declare(purge)
				},
				typegen: ({ typegenReferences }) => {
					typegenReferences.register(inputReference)
				},
			}),
		],
		version: '1.0.0',
	})
	const generated = generateApplicationTypes({
		ultimabase: new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [
				accessPlugin(),
				hooksPlugin(),
				validationPlugin(),
				mutationOwner,
			],
			schemas: [Document],
		}),
		applicationId: 'fixture.official-options',
	})
	const PlainDocument = Schema.define({
		className: 'OfficialOptionDocument',
		fields: (field) => ({ title: field.string() }),
	})
	const withoutOfficialPlugins = generateApplicationTypes({
		ultimabase: new UltimaBase({
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
  access: {
    archive: {
      allow: ({ input, mutation }) => input.id.length > 0 && mutation.authority === 'request',
      item: ({ input, item, originalItem }) => input.id !== item.id && originalItem.id.length > 0,
      where: ({ input, where }) => where.eq('id', input.id),
    },
    read: true,
    // @ts-expect-error -- Master-only mutations are absent from request Access.
    purge: true,
  },
  hooks: {
    beforeOperation: {
      archive: ({ input, item, mutation, originalItem, target }) => {
        void input.id
        void item.title
        void mutation.name
        void originalItem.title
        void target.id
      },
      create: ({ item }) => { void item.title },
    },
    afterOperation: {
      purge: ({ item, mutation }) => {
        const deleted: null = item
        void deleted
        void mutation.name
      },
    },
  },
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
const MutationAccessCompletionDocument = Schema.define({
  className: 'OfficialOptionDocument',
  access: { ${mutationAccessMarker} },
  fields: (field) => ({ title: field.string() }),
})
const StaleMutationDocument = Schema.define({
  className: 'OfficialOptionDocument',
  access: {
    // @ts-expect-error -- Stale mutation aliases are rejected.
    stale: true,
  },
  fields: (field) => ({ title: field.string() }),
})
const StaleMutationHookDocument = Schema.define({
  className: 'OfficialOptionDocument',
  fields: (field) => ({ title: field.string() }),
  hooks: {
    beforeOperation: {
      // @ts-expect-error -- Stale mutation Hook aliases are rejected.
      stale: () => undefined,
    },
  },
})
const MutationHookCompletionDocument = Schema.define({
  className: 'OfficialOptionDocument',
  fields: (field) => ({ title: field.string() }),
  hooks: {
    afterOperation: { ${mutationAfterHookMarker} },
    beforeOperation: { ${mutationBeforeHookMarker} },
  },
})
const CompletionDocument = Schema.define({
  className: 'OfficialOptionCompletion',
  ${schemaOptionsMarker}
  fields: (field) => ({ title: field.string() }),
})
void CompletionDocument
void MutationAccessCompletionDocument
void StaleMutationDocument
void StaleMutationHookDocument
void MutationHookCompletionDocument
void TypedDocument
`
	const fieldOptionsPosition = sourceWithMarkers.indexOf(fieldOptionsMarker)
	const schemaOptionsPosition = sourceWithMarkers.indexOf(schemaOptionsMarker)
	const mutationAccessPosition = sourceWithMarkers.indexOf(mutationAccessMarker)
	const mutationBeforeHookPosition = sourceWithMarkers.indexOf(
		mutationBeforeHookMarker,
	)
	const mutationAfterHookPosition = sourceWithMarkers.indexOf(
		mutationAfterHookMarker,
	)
	const source = sourceWithMarkers
		.replace(fieldOptionsMarker, ' '.repeat(fieldOptionsMarker.length))
		.replace(schemaOptionsMarker, ' '.repeat(schemaOptionsMarker.length))
		.replace(mutationAccessMarker, ' '.repeat(mutationAccessMarker.length))
		.replace(
			mutationBeforeHookMarker,
			' '.repeat(mutationBeforeHookMarker.length),
		)
		.replace(
			mutationAfterHookMarker,
			' '.repeat(mutationAfterHookMarker.length),
		)
	const fileName = path.join(
		import.meta.dirname,
		'official-options.semantic.fixture.ts',
	)
	const service = createLanguageService(fileName, source)
	const completionNames = (position: number): readonly string[] =>
		service
			.getCompletionsAtPosition(fileName, position, {})
			?.entries.map(({ name }) => name) ?? []
	const inputPosition = source.indexOf('input.id.length') + 'input.'.length
	const inputQuickInfo =
		service
			.getQuickInfoAtPosition(fileName, inputPosition)
			?.displayParts?.map(({ text }) => text)
			.join('') ?? ''

	expect(service.getSemanticDiagnostics(fileName)).toStrictEqual([])
	expect(completionNames(fieldOptionsPosition)).toEqual(
		expect.arrayContaining(['access', 'hooks', 'required', 'validation']),
	)
	expect(completionNames(schemaOptionsPosition)).toEqual(
		expect.arrayContaining(['access', 'hooks']),
	)
	expect(completionNames(mutationAccessPosition)).toEqual(
		expect.arrayContaining(['archive', 'create', 'delete', 'read', 'update']),
	)
	expect(completionNames(mutationAccessPosition)).not.toEqual(
		expect.arrayContaining(['purge', 'stale']),
	)
	expect(completionNames(mutationBeforeHookPosition)).toEqual(
		expect.arrayContaining(['archive', 'create', 'delete', 'purge', 'update']),
	)
	expect(completionNames(mutationAfterHookPosition)).toEqual(
		expect.arrayContaining([
			'archive',
			'create',
			'delete',
			'purge',
			'update',
			'upsert',
		]),
	)
	expect(inputQuickInfo).toContain('id: string')
	expect(generated.contents).toContain(
		'FieldValidationCompatibility<TOptions, TValue>',
	)
	expect(generated.contents).not.toContain('titleValidator')
	expect(generated.contents).toContain('readonly schemaMutations: {')
	expect(generated.contents).toContain(
		'readonly archive: Core.PluginSchemaMutationDefinition',
	)
	expect(withoutOfficialPlugins.snapshot.options).toStrictEqual([])
	expect(withoutOfficialPlugins.fingerprint).not.toBe(generated.fingerprint)
	for (const option of ['access', 'hooks', 'validation']) {
		expect(withoutOfficialPlugins.contents).not.toContain(
			`readonly ${option}?:`,
		)
	}

	service.dispose()
})
