import { describe, expect, it } from 'vitest'

import {
	Schema,
	addSchemaField,
	addSchemaIndex,
	createApplication,
	definePlugin,
	defineSchemaOption,
	isSchemaCompilerArtifactReference,
	replaceSchemaCompiler,
	stringField,
	type SchemaSelectorOptions,
	type SchemaSelection,
	type SchemaOptions,
} from '../index.js'
import { jsonObjectOption } from '../../tests/plugins/schema-declarations.fixtures.js'
import { compileCanonicalSchemaCompilerIr } from './schema-compiler-ir/canonical-compiler.js'

describe('schema option-presence selection', () => {
	it('applies ordinary isolated field and index patches without exposing opaque values', async () => {
		let callbackCalls = 0
		let absenceSelection: SchemaSelection | undefined
		const compilerInputs: string[] = []
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
			typegen: {
				module: '@fixture/document-plugin',
				type: 'DocumentOption',
			},
			valueKind: 'opaque',
		})
		const documentPlugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'community.document',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Adds document state to schemas using the direct option.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
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
			},
		})
		const compilerPlugin = definePlugin({
			capabilities: {
				replaces: [
					replaceSchemaCompiler({
						compile: (input) => {
							const document = input.schemas.find(
								({ className }) => className === 'OpaqueOptionDocument',
							)
							const value = document?.options.find(
								({ name }) => name === 'document',
							)?.value
							if (
								document !== undefined &&
								!isSchemaCompilerArtifactReference(value)
							) {
								throw new TypeError(
									'Opaque option escaped its compiler artifact',
								)
							}
							compilerInputs.push(JSON.stringify(input))
							return compileCanonicalSchemaCompilerIr(input)
						},
						contributionId: 'opaque-option-compiler',
					}),
				],
			},
			core: '^0.0.0',
			pluginId: 'fixture.opaque-option-compiler',
			privileges: [
				{
					name: 'schema:replace',
					reason: 'Inspects the callback-free public compiler input.',
				},
			] as const,
			version: '1.0.0',
		})
		const Document = Schema.define({
			className: 'OpaqueOptionDocument',
			document: transform,
			fields: (field) => ({ title: field.string() }),
		} as SchemaOptions<'OpaqueOptionDocument'> & {
			readonly document: (value: string) => string
		})
		const Plain = Schema.define({
			className: 'OpaqueOptionPlain',
			fields: (field) => ({ title: field.string() }),
		})
		const Isolated = Schema.define({
			className: 'OpaqueOptionIsolated',
			fields: (field) => ({ title: field.string() }),
		})

		await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [compilerPlugin, documentPlugin],
			schemas: [Document, Plain],
		})
		await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [compilerPlugin, documentPlugin],
			schemas: [Isolated],
		})

		expect(callbackCalls).toBe(0)
		expect(compilerInputs).toHaveLength(2)
		expect(compilerInputs[0]).toContain('"artifactKind":"option-value"')
		expect(compilerInputs[0]).toContain('"present":false')
		expect(compilerInputs[0]).not.toContain('toUpperCase')
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
			typegen: false,
		})
		const plugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.absent-option',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Selects schemas that omit the direct mode option.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
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
			},
		})
		const Omitted = Schema.define({
			className: 'AbsentOptionOmitted',
			fields: (field) => ({ title: field.string() }),
		})
		const Disabled = Schema.define({
			className: 'AbsentOptionDisabled',
			fields: (field) => ({ title: field.string() }),
			mode: false,
		} as SchemaOptions<'AbsentOptionDisabled'> & { readonly mode: false })
		const Explicit = Schema.define({
			className: 'AbsentOptionExplicit',
			fields: (field) => ({ title: field.string() }),
			mode: 'explicit',
		} as SchemaOptions<'AbsentOptionExplicit'> & {
			readonly mode: 'explicit'
		})

		await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [plugin],
			schemas: [Omitted, Disabled, Explicit],
		})

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
			const plugin = definePlugin({
				core: '^0.0.0',
				pluginId: 'fixture.invalid-absence-selector',
				privileges: [
					{
						name: 'schema:declare',
						reason: 'Exercises absence selector validation.',
					},
				] as const,
				version: '1.0.0',
				declare: ({ schemas }) => {
					schemas.select(selector as SchemaSelectorOptions)
				},
			})

			await expect(
				createApplication({
					pluginPrivileges: { logger: false },
					plugins: [plugin],
					schemas: [],
				}),
			).rejects.toThrow(message)
		},
	)

	it('rejects unknown and ambiguous option owners before setup', async () => {
		let setups = 0
		const patcher = (pluginId: string, optionName: string) =>
			definePlugin({
				core: '^0.0.0',
				pluginId,
				privileges: [
					{
						name: 'schema:declare',
						reason: 'Exercises option selector owner validation.',
					},
				] as const,
				setup: () => {
					setups += 1
				},
				version: '1.0.0',
				declare: ({ schemas }) => {
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
				},
			})
		const optionProvider = (pluginId: string) =>
			definePlugin({
				core: '^0.0.0',
				pluginId,
				privileges: [
					{
						name: 'schema:declare',
						reason: 'Declares one colliding selector option.',
					},
				] as const,
				version: '1.0.0',
				declare: ({ schemas }) => {
					schemas.defineOptions({
						contributionId: 'shared-option',
						schema: { shared: jsonObjectOption },
					})
				},
			})

		await expect(
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [patcher('fixture.unknown-option-selector', 'missing')],
				schemas: [],
			}),
		).rejects.toThrow('Unknown schema selector option: missing')
		await expect(
			createApplication({
				pluginPrivileges: { logger: false },
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
