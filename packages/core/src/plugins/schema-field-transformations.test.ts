import { applicationFixture } from '../../tests/application-fixture.js'
import { describe, expect, it } from 'vitest'
import {
	createApplication,
	FrameworkApplication,
} from '../application/framework-application.js'
import { stringField, type FieldBuilder } from '../index.js'
import {
	addSchemaField,
	plugin as createPlugin,
	contributeDeclarations,
	defineSchemaOption,
} from '../plugin.js'

import { jsonObjectOption } from '../../tests/plugins/schema-declarations.fixtures.js'
import { UltimaBase } from '../runtime/application/ultima-base.js'

describe('plugin schema field transformations', () => {
	it('materializes implicit indexes carried by added field options', async () => {
		const Document = UltimaBase.Schema.define({
			className: 'PatchedFieldIndexDocument',
			fields: (field) => ({ title: field.string() }),
		})
		const plugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.patched-field-index-plugin',
			permissions: { 'schema:declare': 'Adds indexed fixture fields.' },
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
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

						return undefined
					},
				}),
			],
		})

		await (
			await createApplication({ plugins: [plugin], schemas: [Document] })
		).dispose()

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
		const Existing = UltimaBase.Schema.define({
			className: 'AtomicRegistrationCollision',
			fields: (field) => ({ title: field.string() }),
		})
		const Colliding = UltimaBase.Schema.define({
			className: 'AtomicRegistrationCollision',
			fields: (field) => ({ other: field.string() }),
		})
		const registrationPlugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.atomic-registration',
			permissions: { 'schema:declare': 'Exercises registration rollback.' },
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.add({ contributionId: 'collision', schema: Colliding })

						return undefined
					},
				}),
			],
		})
		const registrationApplication = applicationFixture(
			new FrameworkApplication({
				logger: false,
				plugins: [registrationPlugin],
				schemas: [Existing],
			}),
		)
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
		const ValidAddition = UltimaBase.Schema.define({
			className: 'AtomicOptionValidAddition',
			fields: () => ({}),
		})
		// The invalid plugin option must reach the Runtime rollback check.
		const InvalidAddition = UltimaBase.Schema.define({
			broken: true,
			className: 'AtomicOptionInvalidAddition',
			fields: () => ({}),
		} as never)
		const optionFailurePlugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.atomic-option',
			permissions: { 'schema:declare': 'Exercises option rollback.' },
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.defineOptions({
							contributionId: 'options',
							schema: { broken: invalidOption },
						})
						schemas.add({ contributionId: 'valid', schema: ValidAddition })
						schemas.add({ contributionId: 'invalid', schema: InvalidAddition })

						return undefined
					},
				}),
			],
		})
		const optionApplication = applicationFixture(
			new FrameworkApplication({
				logger: false,
				plugins: [optionFailurePlugin],
				schemas: [],
			}),
		)
		expect(() => optionApplication.compileSchemas()).toThrow(
			expect.objectContaining({ code: 'PLUGIN_DECLARATION_INVALID' }),
		)
		expect(optionApplication.schemas.values()).toStrictEqual([])

		const PatchTarget = UltimaBase.Schema.define({
			className: 'AtomicPatchTarget',
			fields: (field) => ({ title: field.string() }),
		})
		const PatchAddition = UltimaBase.Schema.define({
			className: 'AtomicPatchAddition',
			fields: () => ({}),
		})
		const patchFailurePlugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.atomic-patch',
			permissions: { 'schema:declare': 'Exercises patch rollback.' },
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
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

						return undefined
					},
				}),
			],
		})
		const patchApplication = applicationFixture(
			new FrameworkApplication({
				logger: false,
				plugins: [patchFailurePlugin],
				schemas: [PatchTarget],
			}),
		)
		expect(() => patchApplication.compileSchemas()).toThrow(
			expect.objectContaining({ code: 'PLUGIN_DECLARATION_INVALID' }),
		)
		expect(patchApplication.schemas.values()).toStrictEqual([PatchTarget])

		const InvalidTarget = UltimaBase.Schema.define({
			className: 'AtomicInvalidTarget',
			fields: (field) => ({
				missing: field.pointer({ target: 'AtomicMissingTarget' }),
			}),
		})
		const finalValidationPlugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.atomic-final-validation',
			permissions: { 'schema:declare': 'Exercises final validation rollback.' },
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.add({
							contributionId: 'invalid-target',
							schema: InvalidTarget,
						})

						return undefined
					},
				}),
			],
		})
		const finalValidationApplication = applicationFixture(
			new FrameworkApplication({
				logger: false,
				plugins: [finalValidationPlugin],
				schemas: [],
			}),
		)
		expect(() => finalValidationApplication.compileSchemas()).toThrow(
			expect.objectContaining({ code: 'PLUGIN_DECLARATION_INVALID' }),
		)
		expect(finalValidationApplication.schemas.values()).toStrictEqual([])

		const SelectorAddition = UltimaBase.Schema.define({
			className: 'AtomicSelectorAddition',
			fields: () => ({}),
		})
		const selectorFailurePlugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.atomic-selector',
			permissions: { 'schema:declare': 'Exercises selector rollback.' },
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.add({
							contributionId: 'addition',
							schema: SelectorAddition,
						})
						schemas.select({
							// @ts-expect-error -- Runtime rejects values outside portable JSON.
							option: {
								equals: undefined,
								name: 'invalid',
							},
						})

						return undefined
					},
				}),
			],
		})
		const selectorApplication = applicationFixture(
			new FrameworkApplication({
				logger: false,
				plugins: [selectorFailurePlugin],
				schemas: [],
			}),
		)
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
		const Content = UltimaBase.Schema.define({
			className: 'WorkflowContent',
			fields: (field: FieldBuilder) => ({ title: field.string() }),
			workflow: { enabled: true, stages: ['draft', 'published'] },
		} as never)
		const Audit = UltimaBase.Schema.define({
			className: 'WorkflowAudit',
			fields: (field: FieldBuilder) => ({ message: field.string() }),
			workflow: { enabled: true, stages: ['draft', 'published'] },
		} as never)
		const provider = createPlugin({
			core: '^0.0.0',
			id: 'fixture.workflow-schema-provider',
			permissions: {
				'schema:declare': 'Provides one workflow-enabled schema.',
			},
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.defineOptions({
							contributionId: 'workflow',
							schema: { workflow: jsonObjectOption },
						})
						schemas.add({ contributionId: 'workflow-audit', schema: Audit })

						return undefined
					},
				}),
			],
		})
		const patcher = createPlugin({
			core: '^0.0.0',
			id: 'fixture.workflow-owner-selector',
			permissions: {
				'schema:declare': 'Patches only a prior plugin-owned workflow schema.',
			},
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
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

						return undefined
					},
				}),
			],
		})

		await (
			await createApplication({
				plugins: [provider, patcher],
				schemas: [Content],
			})
		).dispose()

		expect(Content.fields.selectedState).toBeUndefined()
		expect(Audit.fields.selectedState?.kind).toBe('string')
		expect(Audit.fields.wrongArrayOrder).toBeUndefined()
	})
})
