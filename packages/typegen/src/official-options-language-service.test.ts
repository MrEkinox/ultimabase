import path from 'node:path'

import ts from 'typescript'
import { accessPlugin } from '@ultimabase/access-plugin'
import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { UltimaBase } from '@ultimabase/core'
import {
	contributeDeclarations,
	defineOperationValue,
	plugin,
	defineSchemaMutation,
	defineTypegenReference,
} from '@ultimabase/core/plugin'
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
const aclDataMarker = '/* acl-sibling-fields */'

it('composes installed Access, Hooks, Validation, and ACL authoring contracts', () => {
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
				models: ({ models }) =>
					models.extend(
						{
							className: 'OfficialOptionDocument',
							owner: { kind: 'application' },
						},
						{
							contributionId: 'document-mutations',
							schemaMutations: {
								archive: { mutation: archive, surfaces: ['schema'] },
								purge: { mutation: purge, surfaces: ['schema'] },
							},
						},
					),
				operations: ({ operations }) => [
					operations.declare(archive),
					operations.declare(purge),
				],
				typegen: ({ typegenReferences }) => {
					typegenReferences.register(inputReference)
				},
			}),
		],
		version: '1.0.0',
	})
	const OfficialApplication = UltimaBase.use(mutationOwner)
		.use(accessPlugin())
		.use(hooksPlugin())
		.use(validationPlugin())
		.use(aclPlugin())
	const Document = OfficialApplication.Schema.define({
		className: 'OfficialOptionDocument',
		fields: (field) => ({
			title: field.string(),
			visibility: field.string(),
		}),
		acl: { default: new ACL() },
	})
	const generated = generateApplicationTypes({
		ultimabase: new OfficialApplication({
			logger: false,
			schemas: [Document],
		}),
		applicationId: 'fixture.official-options',
	})
	const PlainDocument = UltimaBase.Schema.define({
		className: 'OfficialOptionDocument',
		fields: (field) => ({ title: field.string() }),
	})
	const withoutOfficialPlugins = generateApplicationTypes({
		ultimabase: new UltimaBase({
			logger: false,
			schemas: [PlainDocument],
		}),
		applicationId: 'fixture.official-options',
	})
	const sourceWithMarkers = `${generated.contents}
import { accessPlugin } from '@ultimabase/access-plugin'
import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { UltimaBase } from '@ultimabase/core'
import { contributeDeclarations, defineOperationValue, defineSchemaMutation, defineTypegenReference, plugin } from '@ultimabase/core/plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'
declare const titleValidator: import('@standard-schema/spec').StandardSchemaV1<string>

const sourceInputReference = defineTypegenReference({
  exportName: 'BaseItem',
  module: '@ultimabase/core',
})
const sourceArchive = defineSchemaMutation({
  authority: 'request',
  effect: 'update',
  input: defineOperationValue(
    (value) => value as import('@ultimabase/core').BaseItem,
    sourceInputReference,
  ),
  name: 'fixture.official-options.archive',
  returning: 'after',
  version: '1.0.0',
})
const sourcePurge = defineSchemaMutation({
  authority: 'master',
  effect: 'delete',
  input: defineOperationValue(
    (value) => value as import('@ultimabase/core').BaseItem,
    sourceInputReference,
  ),
  name: 'fixture.official-options.purge',
  returning: 'before',
  version: '1.0.0',
})
const sourceMutationOwner = plugin({
  core: '^0.0.0',
  id: 'fixture.official-options-mutations',
  permissions: {
    'model:extend': 'Adds typed schema mutations.',
    'operation:declare': 'Declares schema mutations.',
    'typegen:reference': 'References the input type.',
  },
  contributions: [
    contributeDeclarations({
      models: ({ models }) => models.extend(
        { className: 'OfficialOptionDocument', owner: { kind: 'application' } },
        {
          contributionId: 'document-mutations',
          schemaMutations: {
            archive: { mutation: sourceArchive, surfaces: ['schema'] },
            purge: { mutation: sourcePurge, surfaces: ['schema'] },
          },
        },
      ),
      operations: ({ operations }) => [
        operations.declare(sourceArchive),
        operations.declare(sourcePurge),
      ],
      typegen: ({ typegenReferences }) => {
        typegenReferences.register(sourceInputReference)
      },
    }),
  ],
  version: '1.0.0',
})
const SourceApplication = UltimaBase.use(sourceMutationOwner)
  .use(accessPlugin())
  .use(hooksPlugin())
  .use(validationPlugin())
  .use(aclPlugin())

const TypedDocument = SourceApplication.Schema.define({
  className: 'OfficialOptionDocument',
  acl: {
    default: ({ data }) => {
      data.${aclDataMarker}
      const title: string | null = data.title
      const visibility: string | null = data.visibility
      void title
      void visibility
      // @ts-expect-error -- ACL callbacks expose only exact sibling fields.
      void data.notDeclared
      return new ACL()
    },
    resolveInput: (input) => {
      const title: string | null = input.data.title
      void title
      if (input.operation === 'create') {
        const current: undefined = input.currentData
        const update: undefined = input.update
        void current
        void update
        return input.inputAcl
      }
      const currentTitle: string | null = input.currentData.title
      const updateKind: 'update-expression' = input.update.kind
      void currentTitle
      void updateKind
      return input.inputAcl ?? input.currentAcl
    },
  },
  access: {
    archive: {
      where: ({ input, mutation, where }) =>
        input.id.length > 0 && mutation.authority === 'request'
          ? where.eq('id', input.id)
          : false,
      item: ({ input, item, originalItem }) => input.id !== item.id && originalItem.id.length > 0,
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
    visibility: field.string(),
    title: field.string({
      access: { read: true, write: true },
      hooks: { resolveInput: ({ value }) => value?.trim() ?? null },
      required: true,
      validation: titleValidator,
    }),
  }),
})
const MutationAccessCompletionDocument = SourceApplication.Schema.define({
  className: 'OfficialOptionDocument',
  access: { ${mutationAccessMarker} },
  fields: (field) => ({ title: field.string() }),
})
const StaleMutationDocument = SourceApplication.Schema.define({
  className: 'OfficialOptionDocument',
  access: {
    // @ts-expect-error -- Stale mutation aliases are rejected.
    stale: true,
  },
  fields: (field) => ({ title: field.string() }),
})
const StaleMutationHookDocument = SourceApplication.Schema.define({
  className: 'OfficialOptionDocument',
  fields: (field) => ({ title: field.string() }),
  hooks: {
    beforeOperation: {
      // @ts-expect-error -- Stale mutation Hook aliases are rejected.
      stale: () => undefined,
    },
  },
})
const MutationHookCompletionDocument = SourceApplication.Schema.define({
  className: 'OfficialOptionDocument',
  fields: (field) => ({ title: field.string() }),
  hooks: {
    afterOperation: { ${mutationAfterHookMarker} },
    beforeOperation: { ${mutationBeforeHookMarker} },
  },
})
const CompletionDocument = SourceApplication.Schema.define({
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
	const aclDataPosition = sourceWithMarkers.indexOf(aclDataMarker)
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
		.replace(aclDataMarker, ' '.repeat(aclDataMarker.length))
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

	expect(
		service.getSemanticDiagnostics(fileName).map((diagnostic) => ({
			code: diagnostic.code,
			message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
		})),
	).toStrictEqual([])
	expect(completionNames(fieldOptionsPosition)).toEqual(
		expect.arrayContaining(['access', 'hooks', 'required', 'validation']),
	)
	expect(completionNames(schemaOptionsPosition)).toEqual(
		expect.arrayContaining(['access', 'acl', 'hooks']),
	)
	expect(completionNames(aclDataPosition)).toContain('title')
	expect(completionNames(aclDataPosition)).not.toContain('acl')
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
	expect(
		generated.snapshot.options.map(({ name, scope }) => ({ name, scope })),
	).toStrictEqual([
		{ name: 'access', scope: 'schema' },
		{ name: 'acl', scope: 'schema' },
		{ name: 'hooks', scope: 'schema' },
	])
	expect(generated.contents).not.toContain('FieldValidationCompatibility')
	expect(generated.contents).not.toContain('FieldValidationOption')
	expect(generated.contents).not.toContain('FieldAccessOption')
	expect(generated.contents).not.toContain('FieldHooksOption')
	expect(generated.contents).toContain('SchemaAccessOption')
	expect(generated.contents).toContain('ACLSchemaOption')
	expect(generated.contents).toContain('SchemaHooksOption')
	expect(generated.contents).not.toContain('titleValidator')
	expect(generated.contents).toContain('readonly schemaMutations: {')
	expect(generated.contents).toContain(
		'readonly archive: CorePlugin.PluginSchemaMutationDefinition',
	)
	expect(withoutOfficialPlugins.snapshot.options).toStrictEqual([])
	expect(withoutOfficialPlugins.fingerprint).not.toBe(generated.fingerprint)
	for (const option of ['access', 'acl', 'hooks', 'validation']) {
		expect(withoutOfficialPlugins.contents).not.toContain(
			`readonly ${option}?:`,
		)
	}

	service.dispose()
})
