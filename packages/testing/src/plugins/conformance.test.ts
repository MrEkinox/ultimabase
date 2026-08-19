import {
	defineCapability,
	defineOperation,
	defineOperationValue,
	definePlugin,
	defineQueryExtension,
	defineTypegenReference,
	operationHandler,
	provideCapability,
	provideOperationHandler,
	QueryBuilder,
	Schema,
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
			definePlugin({
				capabilities: { provides: [provider] },
				core: '^0.0.0',
				environment: ['environment:network'],
				hooks: {
					dispose: () => {
						disposals += 1
					},
				},
				instanceId,
				pluginId: 'fixture.conformance',
				privileges: [
					{
						name: 'runtime:observe',
						reason: 'Verifies cumulative privilege denial.',
					},
				],
				setup: () => {
					setups += 1
					return Object.freeze({ ready: true })
				},
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

	it('snapshots public operation and model surfaces through conformance', async () => {
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
		const publishSchema = defineOperation({
			input: text,
			name: 'fixture.snapshot.publish-schema',
			result: text,
			target: 'schema',
			transaction: 'forbidden',
			version: '1.0.0',
		})
		const publishModel = defineOperation({
			input: text,
			name: 'fixture.snapshot.publish-model',
			result: text,
			target: 'model',
			transaction: 'forbidden',
			version: '1.0.0',
		})
		const byTitle = defineQueryExtension({
			apply: (schema) => new QueryBuilder(schema),
			input: text,
			name: 'fixture.snapshot.by-title',
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
		const operations = [inspect, publishSchema, publishModel] as const
		const plugin = definePlugin({
			capabilities: {
				provides: operations.map((operation) =>
					provideOperationHandler({
						contributionId: operation.name,
						create: () => ({
							value: operationHandler({
								execute: ({ input }) => input,
								operation,
							}),
						}),
					}),
				),
			},
			core: '^0.0.0',
			declare: ({
				models,
				operations: operationDeclarations,
				queries,
				typegenContributions,
				typegenReferences,
			}) => {
				for (const operation of operations) {
					operationDeclarations.declare(operation)
				}
				models.extend(
					{ className: Post.className },
					{
						contributionId: 'publishing',
						modelCommands: { publish: publishModel },
						schemaCommands: { publish: publishSchema },
						staticOptions: { mode: 'review' },
					},
				)
				queries.extend(
					{ className: Post.className },
					{
						contributionId: 'publishing-query',
						extensions: { byTitle },
						staticOptions: { mode: 'review' },
					},
				)
				typegenReferences.register(publicState)
				typegenContributions.add({
					contributionId: 'public-state',
					declarations: [
						{
							kind: 'type',
							name: 'ConfiguredPublicState',
							type: { kind: 'reference', reference: publicState },
						},
					],
				})
			},
			instanceId: 'main',
			pluginId: 'fixture.snapshot-surfaces',
			privileges: [
				{ name: 'model:extend', reason: 'Adds public publishing commands.' },
				{ name: 'operation:declare', reason: 'Declares public operations.' },
				{ name: 'query:extend', reason: 'Adds one public query extension.' },
				{ name: 'typegen:reference', reason: 'References one public type.' },
				{ name: 'typegen:contribute', reason: 'Adds one inert declaration.' },
			],
			version: '1.0.0',
		})
		const suite = definePluginConformanceSuite({
			createFixture: () =>
				createPluginConformanceFixture({ schemas: [Post], subject: plugin }),
			expected: {
				core: '^0.0.0',
				pluginId: 'fixture.snapshot-surfaces',
				privileges: [
					'model:extend',
					'operation:declare',
					'query:extend',
					'typegen:reference',
					'typegen:contribute',
				],
				version: '1.0.0',
			},
		})

		const report = await runPluginConformance(suite)
		expect(report.checks).toContainEqual({
			contract: 'static-determinism',
			status: 'passed',
		})
	})

	it('attributes an optional failure to its exact contract', async () => {
		let disposals = 0
		let expectedDisposals = 0
		const plugin = definePlugin({
			core: '^0.0.0',
			hooks: {
				dispose: () => {
					disposals += 1
				},
			},
			pluginId: 'fixture.failure',
			setup: () => Object.freeze({ ready: true }),
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
		const plugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.builder',
			version: '0.0.0',
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
		const plugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.optional-modules',
			version: '0.0.0',
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
