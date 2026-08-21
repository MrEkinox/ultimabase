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
	type SchemaOptions,
} from '../index.js'
import { jsonObjectOption } from '../../tests/plugins/schema-declarations.fixtures.js'
import { compileCanonicalSchemaCompilerIr } from './schema-compiler-ir/canonical-compiler.js'

describe('schema option-presence selection', () => {
	it('applies ordinary isolated field and index patches without exposing opaque values', async () => {
		let callbackCalls = 0
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
		expect(compilerInputs[0]).not.toContain('toUpperCase')
		expect(Document.fields.documentState?.kind).toBe('string')
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
		expect(Isolated.fields.documentState).toBeUndefined()
	})

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
						targets: schemas.select({ option: { name: optionName } }),
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
