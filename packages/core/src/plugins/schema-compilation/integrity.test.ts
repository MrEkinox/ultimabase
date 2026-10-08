import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FrameworkApplication } from '../../application/framework-application.js'
import { stringField } from '../../schema/fields/builtins/string.js'
import { type PreparedSchemaCompilation } from '../../schema/schema/definition.js'
import { plugin as createPlugin } from '../plugin.js'
import {
	contributeApplication,
	contributeDeclarations,
} from '../plugin-contributions.js'
import { addSchemaIndex } from '../schema-field-patch-operations.js'
import * as canonical from './compiler.js'
import type { SchemaCompilationResult } from './contracts.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

afterEach(() => vi.restoreAllMocks())
const compile = canonical.compileCanonicalSchemas

/** Fault injection is private to tests; no compiler replacement API is restored. */
const corrupt = (
	transform: (result: SchemaCompilationResult) => SchemaCompilationResult,
): void => {
	vi.spyOn(canonical, 'compileCanonicalSchemas').mockImplementation((...args) =>
		transform(compile(...args)),
	)
}
const changeFirst = (
	result: SchemaCompilationResult,
	change: (candidate: PreparedSchemaCompilation) => PreparedSchemaCompilation,
): SchemaCompilationResult =>
	immutableRecord({
		...result,
		candidates: immutableArray(
			result.candidates.map((candidate, index) =>
				index === 0 ? change(candidate) : candidate,
			),
		),
	})
const changeDefinition = (
	result: SchemaCompilationResult,
	change: (
		definition: PreparedSchemaCompilation['definition'],
	) => PreparedSchemaCompilation['definition'],
): SchemaCompilationResult =>
	changeFirst(result, (candidate) =>
		immutableRecord({ ...candidate, definition: change(candidate.definition) }),
	)

const fixture = () => {
	const defaultTitle = vi.fn(() => 'draft')
	const resolveSummary = vi.fn(() => ({ label: 'resolved' }))
	const Target = UltimaBase.Schema.define({
		className: 'DirectCompilerIntegrity',
		fields: (field) => ({
			title: field.string({ default: defaultTitle }),
			summary: field.virtual({
				output: (output) =>
					output.object({ fields: (nested) => ({ label: nested.string() }) }),
				select: { title: true },
				resolve: resolveSummary,
			}),
			label: field.virtual({
				output: (output) => output.string(),
				select: { title: true },
				resolve: () => 'label',
			}),
		}),
	})
	const setup = vi.fn()
	const application = new FrameworkApplication({
		schemas: [Target],
		pluginPrivileges: { logger: false },
		plugins: [
			createPlugin({
				id: 'fixture.compiler-integrity',
				version: '1.0.0',
				core: '^0.0.0',
				permissions: {
					'schema:declare': 'Exercises frozen selection validation.',
				},
				contributions: [
					contributeApplication((context) => {
						setup(context)
						return { exports: undefined }
					}),
					contributeDeclarations({
						schema: ({ schemas }) => {
							schemas.patch({ targets: schemas.select({}), operations: [] })

							return undefined
						},
					}),
				],
			}),
		],
	})
	return { application, setup, Target, defaultTitle, resolveSummary }
}

describe('mandatory direct compilation integrity', () => {
	it('retains virtual outputs and dependencies without running resolvers or defaults', () => {
		const { application, Target, defaultTitle, resolveSummary } = fixture()
		const initial: unknown[] = []
		vi.spyOn(canonical, 'compileCanonicalSchemas').mockImplementation(
			(...args) => {
				initial.push(args[0][0]?.definition.virtualFields.summary)
				return compile(...args)
			},
		)
		application.compileSchemas()
		// Exact identity protects the complete nested output, dependency list and private resolver.
		expect(Target.fields.summary).toBe(initial[0])
		expect(Target.fields.summary).toMatchObject({
			select: ['id', 'title'],
			output: {
				kind: 'object',
				options: { fields: { label: { kind: 'string' } } },
			},
		})
		expect(Target.fields.title).toMatchObject({
			options: { default: defaultTitle },
		})
		expect(resolveSummary).not.toHaveBeenCalled()
		expect(defaultTitle).not.toHaveBeenCalled()
	})

	it.each([
		[
			'mutable graph',
			(result: SchemaCompilationResult) => ({ ...result }),
			'must be immutable',
		],
		[
			'partial graph',
			(result: SchemaCompilationResult) =>
				immutableRecord({ ...result, candidates: immutableArray([]) }),
			'complete schema graph',
		],
		[
			'duplicate graph',
			(result: SchemaCompilationResult) =>
				immutableRecord({
					...result,
					candidates: immutableArray([
						...result.candidates,
						...result.candidates,
					]),
				}),
			'complete schema graph',
		],
		[
			'mutable metadata',
			(result: SchemaCompilationResult) =>
				changeDefinition(result, (definition) => ({ ...definition })),
			'must be immutable',
		],
		[
			'mutable field map',
			(result: SchemaCompilationResult) =>
				changeDefinition(result, (definition) =>
					immutableRecord({ ...definition, fields: { ...definition.fields } }),
				),
			'must be immutable',
		],
		[
			'foreign schema',
			(result: SchemaCompilationResult) =>
				changeFirst(result, (candidate) =>
					immutableRecord({
						...candidate,
						schema: UltimaBase.Schema.define({
							className: candidate.schema.className,
							fields: () => ({}),
						}),
					}),
				),
			'stable schema identity',
		],
		[
			'renamed schema',
			(result: SchemaCompilationResult) =>
				changeDefinition(result, (definition) =>
					immutableRecord({ ...definition, className: 'Renamed' }),
				),
			'stable schema identity',
		],
		[
			'altered Core field',
			(result: SchemaCompilationResult) =>
				changeDefinition(result, (definition) =>
					immutableRecord({
						...definition,
						persistedFields: immutableRecord({
							...definition.persistedFields,
							id: immutableRecord({ ...definition.persistedFields.id }),
						}),
					}),
				),
			'changed protected Core field',
		],
		[
			'removed virtual field',
			(result: SchemaCompilationResult) =>
				changeDefinition(result, (definition) =>
					immutableRecord({
						...definition,
						virtualFields: immutableRecord({}),
					}),
				),
			'changed a protected virtual field',
		],
		[
			'replaced virtual output or resolver',
			(result: SchemaCompilationResult) =>
				changeDefinition(result, (definition) => {
					const field = definition.virtualFields.summary
					if (field === undefined)
						throw new TypeError('Missing virtual fixture')
					return immutableRecord({
						...definition,
						virtualFields: immutableRecord({
							...definition.virtualFields,
							summary: immutableRecord({
								...field,
								select: immutableArray(['id']),
							}),
						}),
					})
				}),
			'changed a protected virtual field',
		],
		[
			'reordered virtual fields',
			(result: SchemaCompilationResult) =>
				changeDefinition(result, (definition) =>
					immutableRecord({
						...definition,
						virtualFields: immutableRecord(
							Object.fromEntries(
								Object.entries(definition.virtualFields).reverse(),
							),
						),
					}),
				),
			'changed a protected virtual field',
		],
		[
			'changed virtual field attribution',
			(result: SchemaCompilationResult) =>
				changeDefinition(result, (definition) => {
					const source = definition.provenance.fields.summary
					if (source === undefined)
						throw new TypeError('Missing virtual provenance')
					return immutableRecord({
						...definition,
						provenance: immutableRecord({
							...definition.provenance,
							fields: immutableRecord({
								...definition.provenance.fields,
								summary: immutableRecord({
									...source,
									contributionId: 'changed',
								}),
							}),
						}),
					})
				}),
			'changed a protected virtual field',
		],
		[
			'changed Core option attribution',
			(result: SchemaCompilationResult) =>
				changeDefinition(result, (definition) => {
					const entry = Object.entries(
						definition.provenance.fieldOptions.id ?? {},
					)[0]
					if (entry === undefined)
						throw new TypeError('Missing Core option provenance')
					const [name, source] = entry
					return immutableRecord({
						...definition,
						provenance: immutableRecord({
							...definition.provenance,
							fieldOptions: immutableRecord({
								...definition.provenance.fieldOptions,
								id: immutableRecord({
									...definition.provenance.fieldOptions.id,
									[name]: immutableRecord({
										...source,
										value: immutableRecord({
											...source.value,
											contributionId: 'changed',
										}),
									}),
								}),
							}),
						}),
					})
				}),
			'changed protected Core field',
		],
		[
			'missing provenance',
			(result: SchemaCompilationResult) =>
				changeDefinition(result, (definition) =>
					immutableRecord({
						...definition,
						provenance: immutableRecord({
							...definition.provenance,
							fields: immutableRecord({}),
						}),
					}),
				),
			'changed protected Core field',
		],
		[
			'foreign provenance owner',
			(result: SchemaCompilationResult) =>
				changeDefinition(result, (definition) =>
					immutableRecord({
						...definition,
						provenance: immutableRecord({
							...definition.provenance,
							schema: immutableRecord({
								...definition.provenance.schema,
								owner: immutableRecord({
									kind: 'plugin',
									pluginId: 'foreign.owner',
									version: '1.0.0',
								}),
							}),
						}),
					}),
				),
			'owner absent from compiler input',
		],
		[
			'changed schema owner',
			(result: SchemaCompilationResult) =>
				changeDefinition(result, (definition) =>
					immutableRecord({
						...definition,
						provenance: immutableRecord({
							...definition.provenance,
							schema: immutableRecord({
								...definition.provenance.schema,
								owner: immutableRecord({ kind: 'core' }),
							}),
						}),
					}),
				),
			'changed schema ownership',
		],
		[
			'mismatched field option provenance',
			(result: SchemaCompilationResult) =>
				changeDefinition(result, (definition) =>
					immutableRecord({
						...definition,
						provenance: immutableRecord({
							...definition.provenance,
							fieldOptions: immutableRecord(
								Object.fromEntries(
									Object.entries(definition.provenance.fieldOptions).filter(
										([name]) => name !== 'title',
									),
								),
							),
						}),
					}),
				),
			'fieldOptions must match schema fields',
		],
		[
			'missing selection',
			(result: SchemaCompilationResult) =>
				immutableRecord({ ...result, selections: immutableArray([]) }),
			'resolve every declared selection',
		],
		[
			'duplicate selection',
			(result: SchemaCompilationResult) =>
				immutableRecord({
					...result,
					selections: immutableArray([
						...result.selections,
						...result.selections,
					]),
				}),
			'one exact declared selection',
		],
		[
			'foreign selection target',
			(result: SchemaCompilationResult) =>
				immutableRecord({
					...result,
					selections: immutableArray(
						result.selections.map((selection) =>
							immutableRecord({
								...selection,
								classNames: immutableArray(['Foreign']),
							}),
						),
					),
				}),
			'invalid schema target',
		],
	] as const)(
		'rejects %s before setup and preserves terminal failure',
		async (_name, transform, message) => {
			const { application, setup } = fixture()
			corrupt(transform)
			expect(() => application.compileSchemas()).toThrow(message)
			expect(() => application.compileSchemas()).toThrow(message)
			await expect(application.initialize()).rejects.toThrow(message)
			expect(setup).not.toHaveBeenCalled()
			await application.dispose()
		},
	)

	it.each(['nominal', 'forged'] as const)(
		'rejects an unrelated %s field even if provenance is copied',
		(kind) => {
			const { application } = fixture()
			const unrelated = stringField()
			const field =
				kind === 'nominal' ? unrelated : immutableRecord({ ...unrelated })
			corrupt((result) =>
				changeFirst(result, (candidate) =>
					immutableRecord({
						...candidate,
						developerFields: immutableRecord({
							...candidate.developerFields,
							title: field,
						}),
						definition: immutableRecord({
							...candidate.definition,
							fields: immutableRecord({
								...candidate.definition.fields,
								title: field,
							}),
							persistedFields: immutableRecord({
								...candidate.definition.persistedFields,
								title: field,
							}),
						}),
					}),
				),
			)
			expect(() => application.compileSchemas()).toThrow(
				kind === 'nominal'
					? 'field absent from compilation input'
					: 'created by a field factory',
			)
		},
	)

	it('rejects nonportable patch data even when its selection is empty', () => {
		const callback = vi.fn()
		const application = new FrameworkApplication({
			schemas: [],
			pluginPrivileges: { logger: false },
			plugins: [
				createPlugin({
					id: 'fixture.empty-selection',
					version: '1.0.0',
					core: '^0.0.0',
					permissions: { 'schema:declare': 'Checks unused declarations.' },
					contributions: [
						contributeDeclarations({
							schema: ({ schemas }) => {
								schemas.patch({
									targets: schemas.select({ className: 'Missing' }),
									operations: [
										addSchemaIndex({
											contributionId: 'invalid-index',
											fields: ['first', 'second'],
											// @ts-expect-error -- JavaScript callers must not hide executable index data.
											unique: callback,
										}),
									],
								})

								return undefined
							},
						}),
					],
				}),
			],
		})
		expect(() => application.compileSchemas()).toThrow(
			'must contain only portable values',
		)
		expect(callback).not.toHaveBeenCalled()
	})

	it('isolates prepared identities across independent applications', () => {
		const seen: string[][] = []
		vi.spyOn(canonical, 'compileCanonicalSchemas').mockImplementation(
			(...args) => {
				seen.push(args[0].map((candidate) => candidate.schema.className))
				return compile(...args)
			},
		)
		for (const className of ['DirectFirst', 'DirectSecond']) {
			new FrameworkApplication({
				schemas: [UltimaBase.Schema.define({ className, fields: () => ({}) })],
				plugins: [],
				pluginPrivileges: { logger: false },
			}).compileSchemas()
		}
		expect(seen).toEqual([['DirectFirst'], ['DirectSecond']])
	})
})
