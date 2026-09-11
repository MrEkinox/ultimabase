import {
	collectQueryRelationPredicates,
	createApplication,
	definePlugin,
	MasterAuthority,
	normalizeWhereInput,
	RequestContextValue,
	Schema,
	type RelationWhereResolver,
} from '../../index.js'
import { describe, expect, it } from 'vitest'

import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { provideTestRuntimeConstraint } from '../../../tests/runtime/fixtures/runtime-capabilities.js'
import { createFrameworkEngine } from '../application/create-framework-engine.js'
import { runWithRequestEngine } from '../context/active-framework-context.js'
import { RequestContext, requestSources } from '../context/request-context.js'
import { protectedPolicy } from '../enforcement/protected-policy.js'

const tenant = new RequestContextValue<string>(
	'fixture.relation-predicate-tenant',
	(value) => {
		if (typeof value !== 'string') {
			throw new TypeError('Fixture tenant must be a string')
		}
		return value
	},
)

const databasePlugin = (adapter: RecordingDatabaseAdapter) =>
	definePlugin({
		core: '^0.0.0',
		pluginId: 'fixture.relation-predicate-filter-database',
		version: '0.0.0',
		capabilities: {
			provides: [provideTestDatabaseAdapter(adapter)],
		},
	})

describe('Runtime relation-filter predicates', () => {
	it('applies one contextual filter to quantifiers, emptiness, and count', async () => {
		let resolverCalls = 0
		const Target = Schema.define({
			className: 'FilteredPredicateTarget',
			fields: (field) => ({
				label: field.string(),
				tenant: field.string(),
			}),
		})
		const Source = Schema.define({
			className: 'FilteredPredicateSource',
			fields: (field) => ({
				targets: field.relation({
					target: 'FilteredPredicateTarget',
					where: (({ context, where }) => {
						resolverCalls += 1
						return where.eq('tenant', context.getValue(tenant) ?? 'public')
					}) as RelationWhereResolver<typeof Target>,
				}),
			}),
		})
		const adapter = new RecordingDatabaseAdapter(
			[{ status: 'fulfilled', value: [] }],
			[],
		)
		const application = await createApplication({
			plugins: [databasePlugin(adapter)],
			schemas: [Source, Target],
		})
		const framework = createFrameworkEngine(application)
		const context = RequestContext.anonymous({
			requestId: 'filtered-relation-predicates',
			source: requestSources.internal,
		}).withValue(tenant, 'tenant-a')

		try {
			await runWithRequestEngine(framework.withContext(context), () =>
				Source.findMany({
					include: { targets: {} },
					where: {
						targets: {
							count: {
								where: { label: { startsWith: 'accepted' } },
								gte: 2,
							},
							every: { label: { ne: 'blocked' } },
							isEmpty: true,
							isNotEmpty: true,
							none: { label: { eq: 'hidden' } },
							some: { label: { eq: 'accepted' } },
						},
					},
				}),
			)

			const request = adapter.rootRequests[0]
			const scopes = request?.relationPredicates ?? []
			expect(resolverCalls).toBe(1)
			expect(scopes).toHaveLength(6)
			expect(
				scopes.map(({ predicate }) =>
					predicate.kind === 'relation-count' ? 'count' : predicate.operator,
				),
			).toEqual(expect.arrayContaining(['count', 'every', 'none', 'some']))
			for (const scope of scopes) {
				expect(scope.rowFilter).toMatchObject({
					field: 'tenant',
					kind: 'equal',
					value: 'tenant-a',
				})
			}
			expect(JSON.stringify(request?.operation)).not.toContain('tenant-a')
		} finally {
			await application.dispose()
		}
	})

	it('composes nested relation declarations with target policy and Master', async () => {
		const Owner = Schema.define({
			className: 'FilteredPredicateOwner',
			fields: (field) => ({ active: field.boolean() }),
		})
		const Group = Schema.define({
			className: 'FilteredPredicateGroup',
			fields: (field) => ({
				label: field.string(),
				published: field.boolean(),
			}),
		})
		const Target = Schema.define({
			className: 'NestedFilteredPredicateTarget',
			fields: (field) => ({
				groups: field.relation({
					target: 'FilteredPredicateGroup',
					where: { published: { eq: true } },
				}),
				owner: field.pointer({ target: 'FilteredPredicateOwner' }),
				status: field.string(),
				visible: field.boolean(),
			}),
		})
		const Source = Schema.define({
			className: 'NestedFilteredPredicateSource',
			fields: (field) => ({
				targets: field.relation({
					target: 'NestedFilteredPredicateTarget',
					where: {
						groups: { some: { label: { eq: 'member' } } },
						owner: { is: { active: { eq: true } } },
						visible: { eq: true },
					},
				}),
			}),
		})
		const trace: string[] = []
		const adapter = new RecordingDatabaseAdapter(
			[
				{ status: 'fulfilled', value: [] },
				{ status: 'fulfilled', value: [] },
			],
			trace,
		)
		const policy = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.relation-predicate-filter-policy',
			version: '0.0.0',
			privileges: [
				{
					name: 'runtime:constrain',
					reason: 'Proves private target policy composition.',
				},
			],
			capabilities: {
				provides: [
					provideTestRuntimeConstraint(
						'fixture.filtered-predicate-target-policy',
						protectedPolicy({
							evaluate: () => ({
								rowFilter: normalizeWhereInput(Target, {
									status: { ne: 'suspended' },
								}),
							}),
							master: 'bypass',
							operations: ['exists'],
							schema: Target,
						}),
					),
				],
			},
		})
		const application = await createApplication({
			plugins: [policy, databasePlugin(adapter)],
			schemas: [Source, Target, Group, Owner],
		})
		const framework = createFrameworkEngine(application, {
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'fixture', value: 'secret' }],
				onUse: () => undefined,
			}),
		})
		const request = framework.anonymous({
			requestId: 'nested-filtered-relation-predicates',
			source: requestSources.internal,
		})
		const input = {
			where: { targets: { some: { status: { eq: 'active' } } } },
		} as const

		try {
			await runWithRequestEngine(request, async () => {
				await Source.findMany(input)
				await Source.findMany(input, { useMasterKey: true })
			})

			const anonymousScopes = adapter.rootRequests[0]?.relationPredicates ?? []
			const masterScopes = adapter.rootRequests[1]?.relationPredicates ?? []
			expect(anonymousScopes).toHaveLength(3)
			expect(masterScopes).toHaveLength(3)
			const outerAnonymous = anonymousScopes[0]
			const outerMaster = masterScopes[0]
			expect(outerAnonymous?.rowFilter).toMatchObject({ kind: 'and' })
			expect(JSON.stringify(outerAnonymous?.rowFilter)).toContain('suspended')
			expect(JSON.stringify(outerAnonymous?.rowFilter)).toContain('visible')
			expect(JSON.stringify(outerMaster?.rowFilter)).not.toContain('suspended')
			expect(JSON.stringify(outerMaster?.rowFilter)).toContain('visible')

			const nestedAnonymous = anonymousScopes.slice(1)
			const nestedPredicates = collectQueryRelationPredicates(
				outerAnonymous?.rowFilter ?? normalizeWhereInput(Target, {}),
			)
			expect(nestedPredicates).toHaveLength(2)
			expect(
				nestedAnonymous.find(
					({ predicate }) =>
						predicate.kind === 'relation-predicate' &&
						predicate.operator === 'some',
				)?.rowFilter,
			).toMatchObject({
				field: 'published',
				kind: 'equal',
				value: true,
			})
			expect(
				nestedAnonymous.find(
					({ predicate }) =>
						predicate.kind === 'relation-predicate' &&
						predicate.operator === 'is',
				)?.rowFilter,
			).toBeUndefined()
		} finally {
			await application.dispose()
		}
	})

	it('rejects cyclic declaration expansion before adapter work', async () => {
		const Node = Schema.define({
			className: 'CyclicFilteredPredicateNode',
			fields: (field) => ({
				children: field.relation({
					target: 'CyclicFilteredPredicateNode',
					where: { children: { some: {} } },
				}),
			}),
		})
		const adapter = new RecordingDatabaseAdapter([], [])
		const application = await createApplication({
			plugins: [databasePlugin(adapter)],
			schemas: [Node],
		})
		const framework = createFrameworkEngine(application)
		const request = framework.anonymous({
			requestId: 'cyclic-filtered-relation-predicate',
			source: requestSources.internal,
		})

		try {
			await expect(
				runWithRequestEngine(request, () =>
					Node.findMany({ where: { children: { some: {} } } }),
				),
			).rejects.toMatchObject({
				code: 'VALIDATION_ERROR',
				publicMessage: 'The relation filter is nested too deeply.',
			})
			expect(adapter.rootRequests).toStrictEqual([])
		} finally {
			await application.dispose()
		}
	})
})
