import {
	addSchemaField,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	databaseRelationCapability,
	contributeApplication,
	contributeOperation,
	contributeSchemaMutation,
	defineCapability,
	defineOperation,
	defineOperationValue,
	plugin as createPlugin,
	contributeDeclarations,
	defineSchemaMutation,
	defineTypegenReference,
	provideCapability,
	withPluginPrivileges,
	Schema,
	stringField,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type RelationWhereResolver,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	PluginConformanceError,
	runPluginConformance,
	withPluginTypegenConformance,
} from '../index.js'

const expectedContracts = [
	'application-isolation',
	'capability-contracts',
	'codec',
	'environment-claim-denial',
	'instance-identity',
	'lifecycle-cleanup',
	'manifest',
	'privilege-denial',
	'provenance',
	'static-determinism',
	'typegen',
] as const
const optionalContracts = [
	'adapter-failure',
	'codec',
	'javascript-operation',
	'middleware',
	'migration',
	'operation',
	'persistence',
	'relation-read',
	'schema-mutation',
	'schema-surface',
	'transport',
	'typegen',
] as const

describe('plugin conformance suite', () => {
	it('runs common and optional contracts with cleanup and exact reports', async () => {
		let setups = 0
		let disposals = 0
		let capabilityCreations = 0
		let capabilityDisposals = 0
		const capability = defineCapability<
			Readonly<{ ready: true }>,
			readonly Readonly<{ ready: true }>[]
		>()({
			capabilityId: 'fixture.conformance-resource',
			cardinality: 'multiple',
			compose: (providers) => providers,
			lifetime: 'application',
			version: '1.0.0',
		})
		const provider = provideCapability(capability, {
			contributionId: 'resource',
			create: () => {
				capabilityCreations += 1
				return {
					dispose: () => {
						capabilityDisposals += 1
					},
					value: Object.freeze({ ready: true as const }),
				}
			},
		})
		const fixturePlugin = (instanceId: string) =>
			createPlugin({
				core: '^0.0.0',
				environment: ['environment:network'],
				instanceId,
				id: 'fixture.conformance',
				permissions: {
					'runtime:observe': 'Verifies cumulative privilege denial.',
				},
				contributions: [
					provider,
					withPluginPrivileges(
						contributeApplication(() => {
							setups += 1
							return {
								exports: Object.freeze({ ready: true }),
								dispose: () => {
									disposals += 1
								},
							}
						}),
						['runtime:observe'],
					),
				],
				version: '0.0.0',
			})

		const suite = definePluginConformanceSuite({
			createFixture: () =>
				createPluginConformanceFixture({
					schemas: [],
					subject: fixturePlugin('default'),
				}),
			expected: {
				core: '^0.0.0',
				environment: ['environment:network'],
				pluginId: 'fixture.conformance',
				privileges: ['runtime:observe'],
				version: '0.0.0',
			},
			instances: {
				create: fixturePlugin,
				instanceIds: ['primary', 'audit'],
			},
		}).check('codec', async (context) => {
			const { application } = context.createApplication()
			await application.initialize()
			expect(application.state).toBe('ready')
		})

		const report = await runPluginConformance(
			withPluginTypegenConformance(suite, {
				verify: ({ contents }) => {
					expect(contents).toContain('UltimaBaseGeneratedRegistryState')
				},
			}),
		)

		expect(report.pluginId).toBe('fixture.conformance')
		expect(report.checks.map(({ contract }) => contract).sort()).toStrictEqual(
			[...expectedContracts].sort(),
		)
		expect(setups).toBeGreaterThan(0)
		expect(disposals).toBe(setups)
		expect(capabilityCreations).toBeGreaterThan(0)
		expect(capabilityDisposals).toBe(capabilityCreations)
		expect(Object.isFrozen(report)).toBe(true)
		expect(Object.isFrozen(report.checks)).toBe(true)
	})

	it('snapshots public operations and type references through conformance', async () => {
		const text = defineOperationValue((value, path): string => {
			if (typeof value !== 'string') throw new TypeError(`${path} must be text`)
			return value
		})
		const inspect = defineOperation({
			input: text,
			name: 'fixture.snapshot.inspect',
			result: text,
			target: 'application',
			transaction: 'forbidden',
			version: '1.0.0',
		})
		const publicState = defineTypegenReference({
			exportName: 'PublicState',
			module: '@fixture/snapshot-surfaces',
		})
		const Post = Schema.define({
			className: 'ConformanceSurfacePost',
			fields: (field) => ({ title: field.string() }),
		})
		const plugin = createPlugin({
			core: '^0.0.0',
			instanceId: 'main',
			id: 'fixture.snapshot-surfaces',
			permissions: {
				'operation:declare': 'Declares public operations.',
				'typegen:reference': 'References one public type.',
			},
			version: '1.0.0',
			contributions: [
				contributeOperation({
					execute: ({ input }) => input,
					operation: inspect,
				}),
				contributeDeclarations({
					typegen: ({ typegenReferences }) => {
						typegenReferences.register(publicState)

						return undefined
					},
				}),
			],
		})
		const suite = definePluginConformanceSuite({
			createFixture: () =>
				createPluginConformanceFixture({ schemas: [Post], subject: plugin }),
			expected: {
				core: '^0.0.0',
				pluginId: 'fixture.snapshot-surfaces',
				privileges: ['operation:declare', 'typegen:reference'],
				version: '1.0.0',
			},
		})

		const report = await runPluginConformance(suite)
		expect(report.checks).toContainEqual({
			contract: 'static-determinism',
			status: 'passed',
		})
	})

	it('covers a neutral plugin-owned schema mutation without product engines', async () => {
		const Post = Schema.define({
			className: 'ConformanceSchemaMutationPost',
			fields: (field) => ({ title: field.string() }),
		})
		const archive = defineSchemaMutation({
			authority: 'request',
			effect: 'update',
			input: defineOperationValue((value) => value),
			name: 'fixture.conformance-schema-mutation.archive',
			returning: 'after',
			select: { title: true },
			version: '1.0.0',
		})
		const plugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.conformance-schema-mutation',
			permissions: {
				'model:extend': 'Adds a neutral mutation surface.',
				'operation:declare': 'Declares a neutral mutation.',
				'persistence:rewrite': 'Owns its narrow effect.',
				'schema:declare': 'Adds its owned state field.',
			},
			contributions: [
				contributeSchemaMutation({
					mutation: archive,
					resolve: () => ({ data: { workflowState: 'archived' } }),
				}),
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.patch({
							operations: [
								addSchemaField({
									contributionId: 'workflow-state',
									field: stringField(),
									name: 'workflowState',
								}),
							],
							targets: schemas.select({ className: Post.className }),
						})
					},
					models: ({ models }) => {
						models.extend(
							{ className: Post.className },
							{
								contributionId: 'archive-surface',
								schemaMutations: {
									archive: {
										mutation: archive,
										surfaces: ['schema', 'model'],
									},
								},
							},
						)
					},
				}),
			],
			version: '1.0.0',
		})
		const suite = definePluginConformanceSuite({
			createFixture: () =>
				createPluginConformanceFixture({ schemas: [Post], subject: plugin }),
			expected: {
				core: '^0.0.0',
				pluginId: 'fixture.conformance-schema-mutation',
				privileges: [
					'model:extend',
					'operation:declare',
					'persistence:rewrite',
					'schema:declare',
				],
				version: '1.0.0',
			},
		}).check('schema-mutation', async (context) => {
			const { application } = context.createApplication()
			await application.initialize()
			const surface = application.getSchemaSurface(Post.className)

			expect(surface?.schemaMutations.get('archive')?.mutation.name).toBe(
				archive.name,
			)
			expect(surface?.modelMutations.get('archive')?.mutation.name).toBe(
				archive.name,
			)
		})

		const report = await runPluginConformance(suite)
		expect(report.checks).toContainEqual({
			contract: 'schema-mutation',
			status: 'passed',
		})
	})

	it('covers portable relation shaping without a database or policy product', async () => {
		const sourceId = '0198f090-2a50-7000-8000-000000000093'
		class RelationAdapter implements DatabaseAdapter {
			readonly kind = 'database-adapter' as const
			readonly capabilities = Object.freeze({
				persistencePlans: databasePersistencePlanCapability,
				relations: databaseRelationCapability,
			})
			readonly requests: DatabaseOperationRequest[] = []
			whereInvocations = 0
			readonly #results: unknown[] = [
				{
					createdAt: '2026-09-11T10:00:00.000Z',
					id: sourceId,
					updatedAt: '2026-09-11T10:00:00.000Z',
				},
				0,
			]

			execute<const TOperation extends DatabaseOperationAst>(
				request: DatabaseOperationRequest<TOperation>,
			): Promise<DatabaseOperationResult<TOperation>> {
				this.requests.push(request)
				const result = this.#results.shift()
				return Promise.resolve(result as DatabaseOperationResult<TOperation>)
			}

			beginTransaction(): Promise<never> {
				return Promise.reject(
					new TypeError('Relation read conformance does not open transactions'),
				)
			}
		}
		let latestAdapter: RelationAdapter | undefined
		const createFixture = () => {
			const adapter = new RelationAdapter()
			const Target = Schema.define({
				className: 'ConformanceRelationTarget',
				fields: (field) => ({ visible: field.boolean() }),
			})
			const Source = Schema.define({
				className: 'ConformanceRelationSource',
				fields: (field) => ({
					targets: field.relation({
						target: 'ConformanceRelationTarget',
						where: (({ where }) => {
							adapter.whereInvocations += 1
							return where.eq('visible', true)
						}) as RelationWhereResolver<typeof Target>,
					}),
				}),
			})
			latestAdapter = adapter
			const plugin = createPlugin({
				core: '^0.0.0',
				id: 'fixture.conformance-relation-read',
				version: '0.0.0',
				contributions: [
					provideCapability(databaseAdapterCapability, {
						contributionId: 'relation-read-adapter',
						create: () => ({ value: adapter }),
					}),
				],
			})

			return createPluginConformanceFixture({
				schemas: [Source, Target],
				subject: plugin,
			})
		}
		const suite = definePluginConformanceSuite({
			createFixture,
			expected: {
				core: '^0.0.0',
				pluginId: 'fixture.conformance-relation-read',
				version: '0.0.0',
			},
		}).check('relation-read', async (context) => {
			const { schemas, ultimabase } = context.createUltimaBase()
			const [Source, Target] = schemas
			await ultimabase.start()
			const source = await Source.get({ id: sourceId }, { ultimabase })
			await source.relation('targets').count({}, { ultimabase })

			if (latestAdapter === undefined) {
				throw new TypeError('Relation read conformance adapter is unavailable')
			}
			const adapter = latestAdapter
			expect(adapter.whereInvocations).toBe(1)
			expect(adapter.requests[1]).toMatchObject({
				relation: {
					fieldPath: ['targets'],
					source: Source,
					sourceObjectId: sourceId,
					target: Target,
				},
				rowFilter: {
					field: 'visible',
					kind: 'equal',
					value: true,
				},
			})
		})

		const report = await runPluginConformance(suite)
		expect(report.checks).toContainEqual({
			contract: 'relation-read',
			status: 'passed',
		})
	})

	it('attributes an optional failure to its exact contract', async () => {
		let disposals = 0
		let expectedDisposals = 0
		const plugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.failure',
			contributions: [
				contributeApplication(() => ({
					exports: Object.freeze({ ready: true }),
					dispose: () => {
						disposals += 1
					},
				})),
			],
			version: '0.0.0',
		})
		const suite = definePluginConformanceSuite({
			createFixture: () =>
				createPluginConformanceFixture({ schemas: [], subject: plugin }),
			expected: {
				core: '^0.0.0',
				pluginId: 'fixture.failure',
				version: '0.0.0',
			},
		}).check('transport', async (context) => {
			const { application } = context.createApplication()
			await application.initialize()
			expectedDisposals = disposals + 1
			throw new Error('transport probe failed')
		})

		const failure = await runPluginConformance(suite).catch(
			(error: unknown) => error,
		)
		expect(failure).toBeInstanceOf(PluginConformanceError)
		expect(failure).toMatchObject({
			contract: 'transport',
			pluginId: 'fixture.failure',
		})
		expect((failure as PluginConformanceError).cause).toEqual(
			new Error('transport probe failed'),
		)
		expect(disposals).toBe(expectedDisposals)
	})

	it('keeps suite builders immutable and rejects duplicate checks', () => {
		const plugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.builder',
			version: '0.0.0',
			contributions: [],
		})
		const suite = definePluginConformanceSuite({
			createFixture: () =>
				createPluginConformanceFixture({ schemas: [], subject: plugin }),
			expected: {
				core: '^0.0.0',
				pluginId: 'fixture.builder',
				version: '0.0.0',
			},
		})
		const extended = suite.check('operation', () => undefined)

		expect(suite.checks).toStrictEqual([])
		expect(extended.checks).toHaveLength(1)
		expect(() => extended.check('operation', () => undefined)).toThrow(
			'Duplicate optional conformance contract: operation',
		)
		expect(Object.isFrozen(extended)).toBe(true)
	})

	it('reports every optional domain module under its stable contract', async () => {
		const plugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.optional-modules',
			version: '0.0.0',
			contributions: [],
		})
		let suite = definePluginConformanceSuite({
			createFixture: () =>
				createPluginConformanceFixture({ schemas: [], subject: plugin }),
			expected: {
				core: '^0.0.0',
				pluginId: 'fixture.optional-modules',
				version: '0.0.0',
			},
		})
		for (const contract of optionalContracts) {
			suite = suite.check(contract, () => undefined)
		}

		const report = await runPluginConformance(suite)
		expect(report.checks.map(({ contract }) => contract)).toEqual(
			expect.arrayContaining([...optionalContracts]),
		)
	})
})
