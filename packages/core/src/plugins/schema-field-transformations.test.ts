import { describe, expect, it } from 'vitest'
import {
	FrameworkApplication,
	Schema,
	addSchemaField,
	createApplication,
	definePlugin,
	defineSchemaOption,
	removeSchemaField,
	renameSchemaField,
	replaceSchemaField,
	stringField,
	type SchemaOptions,
} from '../index.js'

import {
	jsonObjectOption,
	requireField,
} from '../../tests/plugins/schema-declarations.fixtures.js'

describe('plugin schema field transformations', () => {
	it('materializes implicit indexes carried by added field options', async () => {
		const Document = Schema.define({
			className: 'PatchedFieldIndexDocument',
			fields: (field) => ({ title: field.string() }),
		})
		const plugin = definePlugin({
			core: '^0.0.0',
			declare: ({ schemas }) => {
				schemas.patch({
					operations: [
						addSchemaField({
							contributionId: 'search-token',
							field: stringField({ indexed: true }),
							name: 'searchToken',
						}),
						addSchemaField({
							contributionId: 'external-key',
							field: stringField({ indexed: 'unique' }),
							name: 'externalKey',
						}),
					],
					targets: schemas.select({
						className: 'PatchedFieldIndexDocument',
					}),
				})
			},
			pluginId: 'fixture.patched-field-index-plugin',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Adds indexed fixture fields.',
				},
			] as const,
			version: '1.0.0',
		})

		await createApplication({ plugins: [plugin], schemas: [Document] })

		expect(Document.indexes).toEqual(
			expect.arrayContaining([
				{ fields: ['searchToken'], unique: false },
				{ fields: ['externalKey'], unique: true },
			]),
		)
		expect(Document.provenance.indexes.slice(-2)).toMatchObject([
			{
				provenance: {
					contributionId: 'search-token',
					owner: { pluginId: 'fixture.patched-field-index-plugin' },
				},
			},
			{
				provenance: {
					contributionId: 'external-key',
					owner: { pluginId: 'fixture.patched-field-index-plugin' },
				},
			},
		])
	})

	it('keeps the public registry atomic across registration, option, patch, and final validation failures', () => {
		const Existing = Schema.define({
			className: 'AtomicRegistrationCollision',
			fields: (field) => ({ title: field.string() }),
		})
		const Colliding = Schema.define({
			className: 'AtomicRegistrationCollision',
			fields: (field) => ({ other: field.string() }),
		})
		const registrationPlugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.atomic-registration',
			privileges: [
				{ name: 'schema:declare', reason: 'Exercises registration rollback.' },
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.add({ contributionId: 'collision', schema: Colliding })
			},
		})
		const registrationApplication = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [registrationPlugin],
			schemas: [Existing],
		})
		expect(() => registrationApplication.compileSchemas()).toThrow(
			expect.objectContaining({ code: 'PLUGIN_DECLARATION_INVALID' }),
		)
		expect(registrationApplication.schemas.values()).toStrictEqual([Existing])

		const invalidOption = defineSchemaOption({
			normalize: () => {
				throw new TypeError('Invalid fixture option')
			},
			protocolVersion: 1,
			typegen: {
				module: '@fixture/atomic-option-plugin',
				type: 'AtomicOption',
			},
		})
		const ValidAddition = Schema.define({
			className: 'AtomicOptionValidAddition',
			fields: () => ({}),
		})
		const InvalidAddition = Schema.define({
			broken: true,
			className: 'AtomicOptionInvalidAddition',
			fields: () => ({}),
		} as SchemaOptions<'AtomicOptionInvalidAddition'> & {
			readonly broken: boolean
		})
		const optionFailurePlugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.atomic-option',
			privileges: [
				{ name: 'schema:declare', reason: 'Exercises option rollback.' },
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.defineOptions({
					contributionId: 'options',
					schema: { broken: invalidOption },
				})
				schemas.add({ contributionId: 'valid', schema: ValidAddition })
				schemas.add({ contributionId: 'invalid', schema: InvalidAddition })
			},
		})
		const optionApplication = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [optionFailurePlugin],
			schemas: [],
		})
		expect(() => optionApplication.compileSchemas()).toThrow(
			expect.objectContaining({ code: 'PLUGIN_DECLARATION_INVALID' }),
		)
		expect(optionApplication.schemas.values()).toStrictEqual([])

		const PatchTarget = Schema.define({
			className: 'AtomicPatchTarget',
			fields: (field) => ({ title: field.string() }),
		})
		const PatchAddition = Schema.define({
			className: 'AtomicPatchAddition',
			fields: () => ({}),
		})
		const patchFailurePlugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.atomic-patch',
			privileges: [
				{ name: 'schema:declare', reason: 'Exercises patch rollback.' },
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.add({ contributionId: 'addition', schema: PatchAddition })
				schemas.patch({
					operations: [
						addSchemaField({
							contributionId: 'duplicate-title',
							field: stringField(),
							name: 'title',
						}),
					],
					targets: schemas.select({ className: 'AtomicPatchTarget' }),
				})
			},
		})
		const patchApplication = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [patchFailurePlugin],
			schemas: [PatchTarget],
		})
		expect(() => patchApplication.compileSchemas()).toThrow(
			expect.objectContaining({ code: 'PLUGIN_DECLARATION_INVALID' }),
		)
		expect(patchApplication.schemas.values()).toStrictEqual([PatchTarget])

		const InvalidTarget = Schema.define({
			className: 'AtomicInvalidTarget',
			fields: (field) => ({
				missing: field.pointer({ target: 'AtomicMissingTarget' }),
			}),
		})
		const finalValidationPlugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.atomic-final-validation',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Exercises final validation rollback.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.add({ contributionId: 'invalid-target', schema: InvalidTarget })
			},
		})
		const finalValidationApplication = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [finalValidationPlugin],
			schemas: [],
		})
		expect(() => finalValidationApplication.compileSchemas()).toThrow(
			expect.objectContaining({ code: 'PLUGIN_DECLARATION_INVALID' }),
		)
		expect(finalValidationApplication.schemas.values()).toStrictEqual([])

		const SelectorAddition = Schema.define({
			className: 'AtomicSelectorAddition',
			fields: () => ({}),
		})
		const selectorFailurePlugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.atomic-selector',
			privileges: [
				{ name: 'schema:declare', reason: 'Exercises selector rollback.' },
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.add({ contributionId: 'addition', schema: SelectorAddition })
				schemas.select({
					// @ts-expect-error -- Runtime rejects values outside portable JSON.
					option: {
						equals: undefined,
						name: 'invalid',
					},
				})
			},
		})
		const selectorApplication = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [selectorFailurePlugin],
			schemas: [],
		})
		let selectorFailure: unknown
		try {
			selectorApplication.compileSchemas()
		} catch (error: unknown) {
			selectorFailure = error
		}
		expect(selectorFailure).toMatchObject({
			code: 'PLUGIN_DECLARATION_INVALID',
			internalDetails: {
				path: 'plugins.fixture.atomic-selector.declare',
				pluginId: 'fixture.atomic-selector',
			},
		})
		expect(selectorApplication.schemas.values()).toStrictEqual([])
	})

	it('requires exact ownership and shape for ordered cross-owner field transforms', async () => {
		const Post = Schema.define({
			className: 'TransformedPost',
			fields: (field) => ({
				description: field.string(),
				title: field.string(),
			}),
		})
		const originalTitle = Post.fields.title
		const originalDescription = Post.fields.description
		if (originalTitle === undefined || originalDescription === undefined) {
			throw new TypeError('Expected precompiled fixture fields')
		}
		const normalizedTitle = stringField({ validation: { required: true } })
		const transformer = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.schema-transformer',
			privileges: [
				{
					name: 'schema:transform',
					reason: 'Transforms exact application-owned fields.',
				},
			] as const,
			version: '3.0.0',
			declare: ({ schemas }) => {
				const post = schemas.select({ className: 'TransformedPost' })
				schemas.patch({
					operations: [
						replaceSchemaField({
							contributionId: 'required-title',
							field: normalizedTitle,
							name: 'title',
							target: {
								contributionId: 'field:TransformedPost.title',
								expected: originalTitle,
								owner: { kind: 'application' },
							},
						}),
						renameSchemaField({
							contributionId: 'headline-title',
							from: 'title',
							target: {
								contributionId: 'required-title',
								expected: normalizedTitle,
								owner: {
									kind: 'plugin',
									pluginId: 'fixture.schema-transformer',
								},
							},
							to: 'headline',
						}),
						removeSchemaField({
							contributionId: 'remove-description',
							name: 'description',
							target: {
								contributionId: 'field:TransformedPost.description',
								expected: originalDescription,
								owner: { kind: 'application' },
							},
						}),
					],
					targets: post,
				})
			},
		})

		await createApplication({ plugins: [transformer], schemas: [Post] })

		expect(Post.fields.title).toBeUndefined()
		expect(Post.fields.description).toBeUndefined()
		expect(Post.fields.headline?.options).toMatchObject({
			validation: { required: true },
		})
		expect(Post.provenance.fields.headline).toMatchObject({
			contributionId: 'headline-title',
			owner: {
				kind: 'plugin',
				pluginId: 'fixture.schema-transformer',
				version: '3.0.0',
			},
		})
		expect(Post.provenance.patches.map(({ kind }) => kind)).toEqual([
			'field:replace',
			'field:rename',
			'field:remove',
		])
	})

	it('rejects stale transform owners and protected Core identities', async () => {
		const Post = Schema.define({
			className: 'RejectedTransformPost',
			fields: (field) => ({ title: field.string() }),
		})
		const title = requireField(Post.fields.title)
		const stale = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.stale-transformer',
			privileges: [
				{
					name: 'schema:transform',
					reason: 'Exercises exact target rejection.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.patch({
					operations: [
						removeSchemaField({
							contributionId: 'stale-remove',
							name: 'title',
							target: {
								contributionId: 'field:RejectedTransformPost.title',
								expected: title,
								owner: {
									kind: 'plugin',
									pluginId: 'fixture.someone-else',
								},
							},
						}),
					],
					targets: schemas.select({ className: 'RejectedTransformPost' }),
				})
			},
		})

		await expect(
			createApplication({ plugins: [stale], schemas: [Post] }),
		).rejects.toThrow('Stale schema contribution owner')

		const Protected = Schema.define({
			className: 'ProtectedTransformPost',
			fields: (field) => ({ title: field.string() }),
		})
		const protectedId = Protected.fields.id
		const coreTransform = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.core-transformer',
			privileges: [
				{
					name: 'schema:transform',
					reason: 'Exercises protected target rejection.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.patch({
					operations: [
						removeSchemaField({
							contributionId: 'remove-id',
							name: 'id',
							target: {
								contributionId: 'field:ProtectedTransformPost.id',
								expected: protectedId,
								owner: { kind: 'core' },
							},
						}),
					],
					targets: schemas.select({ className: 'ProtectedTransformPost' }),
				})
			},
		})

		await expect(
			createApplication({ plugins: [coreTransform], schemas: [Protected] }),
		).rejects.toThrow('Protected Core schema contribution')
	})

	it('matches structurally equal option objects while preserving array order', async () => {
		const Content = Schema.define({
			className: 'WorkflowContent',
			fields: (field) => ({ title: field.string() }),
			workflow: { enabled: true, stages: ['draft', 'published'] },
		} as SchemaOptions<'WorkflowContent'> & {
			readonly workflow: Readonly<{
				readonly enabled: boolean
				readonly stages: readonly string[]
			}>
		})
		const Audit = Schema.define({
			className: 'WorkflowAudit',
			fields: (field) => ({ message: field.string() }),
			workflow: { enabled: true, stages: ['draft', 'published'] },
		} as SchemaOptions<'WorkflowAudit'> & {
			readonly workflow: Readonly<{
				readonly enabled: boolean
				readonly stages: readonly string[]
			}>
		})
		const provider = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.workflow-schema-provider',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Provides one workflow-enabled schema.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.defineOptions({
					contributionId: 'workflow',
					schema: { workflow: jsonObjectOption },
				})
				schemas.add({ contributionId: 'workflow-audit', schema: Audit })
			},
		})
		const patcher = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.workflow-owner-selector',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Patches only a prior plugin-owned workflow schema.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.patch({
					operations: [
						addSchemaField({
							contributionId: 'selected-state',
							field: stringField(),
							name: 'selectedState',
						}),
					],
					targets: schemas.select({
						option: {
							equals: {
								stages: ['draft', 'published'],
								enabled: true,
							},
							name: 'workflow',
						},
						owner: {
							kind: 'plugin',
							pluginId: 'fixture.workflow-schema-provider',
						},
					}),
				})
				schemas.patch({
					operations: [
						addSchemaField({
							contributionId: 'wrong-array-order',
							field: stringField(),
							name: 'wrongArrayOrder',
						}),
					],
					targets: schemas.select({
						option: {
							equals: {
								enabled: true,
								stages: ['published', 'draft'],
							},
							name: 'workflow',
						},
						owner: {
							kind: 'plugin',
							pluginId: 'fixture.workflow-schema-provider',
						},
					}),
				})
			},
		})

		await createApplication({
			plugins: [provider, patcher],
			schemas: [Content],
		})

		expect(Content.fields.selectedState).toBeUndefined()
		expect(Audit.fields.selectedState?.kind).toBe('string')
		expect(Audit.fields.wrongArrayOrder).toBeUndefined()
	})
})
