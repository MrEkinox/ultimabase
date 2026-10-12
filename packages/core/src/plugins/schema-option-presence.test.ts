import { describe, expect, it } from 'vitest'
import { createApplication } from '../application/framework-application.js'

import { stringField, type FieldBuilder } from '../index.js'
import {
	addSchemaField,
	addSchemaIndex,
	plugin as createPlugin,
	contributeApplication,
	contributeDeclarations,
	withPluginPrivileges,
	defineSchemaOption,
	type SchemaSelectorOptions,
	type SchemaSelection,
} from '../plugin.js'
import { jsonObjectOption } from '../../tests/plugins/schema-declarations.fixtures.js'
import { UltimaBase } from '../runtime/application/ultima-base.js'

describe('schema option-presence selection', () => {
	it('applies isolated field and index patches without executing opaque values', async () => {
		let callbackCalls = 0
		let absenceSelection: SchemaSelection | undefined
		const transform = (value: string): string => {
			callbackCalls += 1
			return value.toUpperCase()
		}
		const documentOption = defineSchemaOption<(value: string) => string>({
			normalize: (value, path) => {
				if (typeof value !== 'function') {
					throw new TypeError(`${path} must be a function`)
				}
				return value as (value: string) => string
			},
			protocolVersion: 1,
			valueKind: 'opaque',
		})
		const documentPlugin = createPlugin({
			core: '^0.0.0',
			id: 'community.document',
			permissions: {
				'schema:declare':
					'Adds document state to schemas using the direct option.',
			},
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.defineOptions({
							contributionId: 'document-options',
							schema: { document: documentOption },
						})
						schemas.patch({
							operations: [
								addSchemaField({
									contributionId: 'document-state',
									field: stringField(),
									name: 'documentState',
								}),
								addSchemaIndex({
									contributionId: 'document-state-index',
									fields: ['documentState', 'createdAt'],
								}),
							],
							targets: schemas.select({ option: { name: 'document' } }),
						})
						absenceSelection = schemas.select({
							option: { name: 'document', present: false },
						})
						schemas.patch({
							operations: [
								addSchemaField({
									contributionId: 'non-document-state',
									field: stringField(),
									name: 'nonDocumentState',
								}),
							],
							targets: absenceSelection,
						})

						return undefined
					},
				}),
			],
		})
		// This Runtime selector fixture supplies the plugin option before installation.
		const Document = UltimaBase.Schema.define({
			className: 'OpaqueOptionDocument',
			fields: (field: FieldBuilder) => ({ title: field.string() }),
		} as never).with({
			document: transform,
		} as never)
		const Plain = UltimaBase.Schema.define({
			className: 'OpaqueOptionPlain',
			fields: (field) => ({ title: field.string() }),
		})
		const Isolated = UltimaBase.Schema.define({
			className: 'OpaqueOptionIsolated',
			fields: (field) => ({ title: field.string() }),
		})

		await (
			await createApplication({
				logger: false,
				plugins: [documentPlugin],
				schemas: [Document, Plain],
			})
		).dispose()
		await (
			await createApplication({
				logger: false,
				plugins: [documentPlugin],
				schemas: [Isolated],
			})
		).dispose()

		expect(callbackCalls).toBe(0)
		expect(absenceSelection).toBeDefined()
		expect(Object.isFrozen(absenceSelection)).toBe(true)
		expect(Object.isFrozen(absenceSelection?.selector)).toBe(true)
		expect(Object.isFrozen(absenceSelection?.selector.option)).toBe(true)
		expect(Document.fields.documentState?.kind).toBe('string')
		expect(Document.fields.nonDocumentState).toBeUndefined()
		expect(Document.indexes).toContainEqual({
			fields: ['documentState', 'createdAt'],
			unique: false,
		})
		expect(Document.provenance.fields.documentState).toMatchObject({
			contributionId: 'document-state',
			owner: {
				kind: 'plugin',
				pluginId: 'community.document',
				version: '1.0.0',
			},
		})
		expect(Document.provenance.indexes.at(-1)?.provenance).toMatchObject({
			contributionId: 'document-state-index',
			owner: { pluginId: 'community.document' },
		})
		expect(Plain.fields.documentState).toBeUndefined()
		expect(Plain.fields.nonDocumentState?.kind).toBe('string')
		expect(Isolated.fields.documentState).toBeUndefined()
		expect(Isolated.fields.nonDocumentState?.kind).toBe('string')
	})

	it('distinguishes omission from explicit false and other direct values', async () => {
		const modeOption = defineSchemaOption<false | 'explicit'>({
			normalize: (value, path) => {
				if (value !== false && value !== 'explicit') {
					throw new TypeError(`${path} must be false or explicit`)
				}
				return value
			},
			protocolVersion: 1,
		})
		const plugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.absent-option',
			permissions: {
				'schema:declare': 'Selects schemas that omit the direct mode option.',
			},
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.defineOptions({
							contributionId: 'mode-options',
							schema: { mode: modeOption },
						})
						schemas.patch({
							operations: [
								addSchemaField({
									contributionId: 'inherited-mode-field',
									field: stringField(),
									name: 'inheritedMode',
								}),
							],
							targets: schemas.select({
								option: { name: 'mode', present: false },
							}),
						})

						return undefined
					},
				}),
			],
		})
		const Omitted = UltimaBase.Schema.define({
			className: 'AbsentOptionOmitted',
			fields: (field) => ({ title: field.string() }),
		})
		// Presence checks exercise untrusted option values at Runtime.
		const Disabled = UltimaBase.Schema.define({
			className: 'AbsentOptionDisabled',
			fields: (field: FieldBuilder) => ({ title: field.string() }),
		} as never).with({
			mode: false,
		} as never)
		const Explicit = UltimaBase.Schema.define({
			className: 'AbsentOptionExplicit',
			fields: (field: FieldBuilder) => ({ title: field.string() }),
		} as never).with({
			mode: 'explicit',
		} as never)

		await (
			await createApplication({
				logger: false,
				plugins: [plugin],
				schemas: [Omitted, Disabled, Explicit],
			})
		).dispose()

		expect(Omitted.fields.inheritedMode?.kind).toBe('string')
		expect(Disabled.fields.inheritedMode).toBeUndefined()
		expect(Explicit.fields.inheritedMode).toBeUndefined()
	})

	it.each([
		[
			'present true',
			{ option: { name: 'workflow', present: true } },
			'option.present must be false',
		],
		[
			'present plus equals',
			{ option: { equals: false, name: 'workflow', present: false } },
			'option.present cannot be combined',
		],
		[
			'present plus path',
			{ option: { name: 'workflow', path: ['enabled'], present: false } },
			'option.present cannot be combined',
		],
		[
			'path without equals',
			{ option: { name: 'workflow', path: ['enabled'] } },
			'option.path requires option.equals',
		],
		[
			'callback',
			{ option: { name: 'workflow', present: () => false } },
			'option.present must be false',
		],
		[
			'unknown key',
			{ option: { missing: true, name: 'workflow' } },
			'Unknown schema selector option key: missing',
		],
	] as const)(
		'rejects invalid absence selector form: %s',
		async (_, selector, message) => {
			const plugin = createPlugin({
				core: '^0.0.0',
				id: 'fixture.invalid-absence-selector',
				permissions: {
					'schema:declare': 'Exercises absence selector validation.',
				},
				version: '1.0.0',
				contributions: [
					contributeDeclarations({
						schema: ({ schemas }) => {
							schemas.select(selector as SchemaSelectorOptions)

							return undefined
						},
					}),
				],
			})

			await expect(
				createApplication({
					logger: false,
					plugins: [plugin],
					schemas: [],
				}),
			).rejects.toThrow(message)
		},
	)

	it('rejects unknown and ambiguous option owners before setup', async () => {
		let setups = 0
		const patcher = (pluginId: string, optionName: string) =>
			createPlugin({
				core: '^0.0.0',
				id: pluginId,
				permissions: {
					'schema:declare': 'Exercises option selector owner validation.',
				},
				version: '1.0.0',
				contributions: [
					contributeDeclarations({
						schema: ({ schemas }) => {
							schemas.patch({
								operations: [
									addSchemaField({
										contributionId: 'selected-field',
										field: stringField(),
										name: 'selectedField',
									}),
								],
								targets: schemas.select({
									option: { name: optionName, present: false },
								}),
							})

							return undefined
						},
					}),
					withPluginPrivileges(
						contributeApplication((context) => {
							setups += 1
							const exports = undefined
							const lifecycleContext = { ...context, pluginExports: exports }
							void lifecycleContext
							return { exports }
						}),
						['schema:declare'],
					),
				],
			})
		const optionProvider = (pluginId: string) =>
			createPlugin({
				core: '^0.0.0',
				id: pluginId,
				permissions: {
					'schema:declare': 'Declares one colliding selector option.',
				},
				version: '1.0.0',
				contributions: [
					contributeDeclarations({
						schema: ({ schemas }) => {
							schemas.defineOptions({
								contributionId: 'shared-option',
								schema: { shared: jsonObjectOption },
							})

							return undefined
						},
					}),
				],
			})

		await expect(
			createApplication({
				logger: false,
				plugins: [patcher('fixture.unknown-option-selector', 'missing')],
				schemas: [],
			}),
		).rejects.toThrow('Unknown schema selector option: missing')
		await expect(
			createApplication({
				logger: false,
				plugins: [
					optionProvider('fixture.shared-option-a'),
					optionProvider('fixture.shared-option-b'),
					patcher('fixture.ambiguous-option-selector', 'shared'),
				],
				schemas: [],
			}),
		).rejects.toThrow('Ambiguous schema option owner for "shared"')
		expect(setups).toBe(0)
	})
})
