import {
	collectQueryRelationPredicates,
	MasterAuthority,
	normalizeWhereInput,
} from '../../index.js'
import { plugin } from '../../plugin.js'
import { createApplication } from '../../application/framework-application.js'
import { describe, expect, it } from 'vitest'

import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { provideTestRuntimeConstraint } from '../../../tests/runtime/fixtures/runtime-capabilities.js'
import { queryRelationPredicateMaxCount } from '../../query/filters/relation.js'
import { createFrameworkEngine } from '../application/create-framework-engine.js'
import { runWithRequestEngine } from '../context/active-framework-context.js'
import { RequestContext, requestSources } from '../context/request-context.js'
import { protectedPolicy } from '../enforcement/protected-policy.js'
import { RuntimeRelationFilterResolver } from './execution.js'
import { UltimaBase } from '../application/ultima-base.js'
import { QueryBuilder, RequestContextValue } from '../../plugin.js'

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
	plugin({
		core: '^0.0.0',
		id: 'fixture.relation-predicate-filter-database',
		version: '0.0.0',
		contributions: [provideTestDatabaseAdapter(adapter)],
	})

describe('Runtime relation-filter predicates', () => {
	it('applies one contextual filter to quantifiers, emptiness, and count', async () => {
		let resolverCalls = 0
		const Target = UltimaBase.Schema.define({
			className: 'FilteredPredicateTarget',
			fields: (field) => ({
				label: field.string(),
				tenant: field.string(),
			}),
		})
		const Source = UltimaBase.Schema.define({
			className: 'FilteredPredicateSource',
			fields: (field) => ({
				targets: field.relation({ target: 'FilteredPredicateTarget' }),
			}),
		}).with((plugins) =>
			plugins.relations({
				targets: {
					where: ({ context, where }) => {
						resolverCalls += 1
						return where.eq('tenant', context.getValue(tenant) ?? 'public')
					},
				},
			}),
		)
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
		const Owner = UltimaBase.Schema.define({
			className: 'FilteredPredicateOwner',
			fields: (field) => ({ active: field.boolean() }),
		})
		const Group = UltimaBase.Schema.define({
			className: 'FilteredPredicateGroup',
			fields: (field) => ({
				label: field.string(),
				published: field.boolean(),
			}),
		})
		const Target = UltimaBase.Schema.define({
			className: 'NestedFilteredPredicateTarget',
			fields: (field) => ({
				groups: field.relation({ target: 'FilteredPredicateGroup' }),
				owner: field.pointer({ target: 'FilteredPredicateOwner' }),
				status: field.string(),
				visible: field.boolean(),
			}),
		}).with((plugins) =>
			plugins.relations({ groups: { where: { published: { eq: true } } } }),
		)
		const Source = UltimaBase.Schema.define({
			className: 'NestedFilteredPredicateSource',
			fields: (field) => ({
				targets: field.relation({ target: 'NestedFilteredPredicateTarget' }),
			}),
		}).with((plugins) =>
			plugins.relations({
				targets: {
					where: {
						groups: { some: { label: { eq: 'member' } } },
						owner: { is: { active: { eq: true } } },
						visible: { eq: true },
					},
				},
			}),
		)
		const trace: string[] = []
		const adapter = new RecordingDatabaseAdapter(
			[
				{ status: 'fulfilled', value: [] },
				{ status: 'fulfilled', value: [] },
			],
			trace,
		)
		const policy = plugin({
			core: '^0.0.0',
			id: 'fixture.relation-predicate-filter-policy',
			version: '0.0.0',
			permissions: {
				'runtime:constrain': 'Proves private target policy composition.',
			},
			contributions: [
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
		const Node = UltimaBase.Schema.define({
			className: 'CyclicFilteredPredicateNode',
			fields: (field) => ({
				children: field.relation({ target: 'CyclicFilteredPredicateNode' }),
			}),
		}).with((plugins) =>
			plugins.relations({ children: { where: { children: { some: {} } } } }),
		)
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

	it('counts private declaration predicates in the operation complexity budget', async () => {
		const Node = UltimaBase.Schema.define({
			className: 'ComplexFilteredPredicateNode',
			fields: (field) => ({
				active: field.boolean(),
				children: field.relation({
					target: 'ComplexFilteredPredicateNode',
				}),
			}),
		})
		const Source = UltimaBase.Schema.define({
			className: 'ComplexFilteredPredicateSource',
			fields: (field) => ({
				targets: field.relation({ target: 'ComplexFilteredPredicateNode' }),
			}),
		}).with((plugins) =>
			plugins.relations({
				targets: {
					where: ({ where }) => {
						let result = where

						for (
							let index = 0;
							index < queryRelationPredicateMaxCount;
							index += 1
						) {
							result = result.some('children', { active: { eq: true } })
						}

						return result
					},
				},
			}),
		)
		const adapter = new RecordingDatabaseAdapter([], [])
		const application = await createApplication({
			plugins: [databasePlugin(adapter)],
			schemas: [Source, Node],
		})
		const request = createFrameworkEngine(application).anonymous({
			requestId: 'complex-filtered-relation-predicate',
			source: requestSources.internal,
		})

		try {
			await expect(
				runWithRequestEngine(request, () =>
					Source.findMany({ where: { targets: { some: {} } } }),
				),
			).rejects.toMatchObject({
				code: 'VALIDATION_ERROR',
				internalDetails: { kind: 'query-relation-complexity-exceeded' },
				publicMessage: 'The relation filter is too complex.',
			})
			expect(adapter.rootRequests).toStrictEqual([])
		} finally {
			await application.dispose()
		}
	})

	it('shares the complexity budget across preparation phases of one operation', async () => {
		const Node = UltimaBase.Schema.define({
			className: 'PhasedComplexityRelationNode',
			fields: (field) => ({
				children: field.relation({ target: 'PhasedComplexityRelationNode' }),
			}),
		})
		const adapter = new RecordingDatabaseAdapter([], [])
		const application = await createApplication({
			plugins: [databasePlugin(adapter)],
			schemas: [Node],
		})
		const resolver = new RuntimeRelationFilterResolver(application)
		const context = RequestContext.anonymous({
			requestId: 'phased-relation-complexity',
			source: requestSources.internal,
		})
		const operation = {
			kind: 'find-many' as const,
			query: new QueryBuilder(Node).ast,
		}
		const createFilter = (count: number) => {
			let query = new QueryBuilder(Node)

			for (let index = 0; index < count; index += 1) {
				query = query.where((where) => where.some('children', {}))
			}

			const expression = query.ast.where?.expression
			if (expression === undefined) {
				throw new TypeError('Phased relation complexity fixture is incomplete')
			}

			return expression
		}

		try {
			await resolver.preparePredicates({
				context,
				operation,
				rowFilter: createFilter(queryRelationPredicateMaxCount / 2),
			})
			await expect(
				resolver.preparePredicates({
					context,
					operation,
					rowFilter: createFilter(queryRelationPredicateMaxCount / 2 + 1),
				}),
			).rejects.toMatchObject({
				code: 'VALIDATION_ERROR',
				internalDetails: { kind: 'query-relation-complexity-exceeded' },
			})
			expect(adapter.rootRequests).toStrictEqual([])
		} finally {
			await application.dispose()
		}
	})
})
