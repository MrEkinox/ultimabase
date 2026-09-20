import { describe, expect, it } from 'vitest'
import {
	FrameworkApplication,
	Schema,
	addSchemaField,
	createApplication,
	definePlugin,
	defineSchemaOption,
	stringField,
	type SchemaOptions,
} from '../index.js'

import { jsonObjectOption } from '../../tests/plugins/schema-declarations.fixtures.js'

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
