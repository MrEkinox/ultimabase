import {
	createApplication,
	definePlugin,
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
import { normalizeWhereInput } from '../../query/filters/where.js'

const now = '2026-09-11T12:00:00.000Z'
const firstSourceId = '0198f090-2a50-7000-8000-000000000201'
const secondSourceId = '0198f090-2a50-7000-8000-000000000202'
const firstTargetId = '0198f090-2a50-7000-8000-000000000203'
const secondTargetId = '0198f090-2a50-7000-8000-000000000204'

const principalId = new RequestContextValue<string>(
	'fixture.inclusion-principal-id',
	(value) => {
		if (typeof value !== 'string') {
			throw new TypeError('Fixture principal id must be a string')
		}
		return value
	},
)

const databasePlugin = (adapter: RecordingDatabaseAdapter) =>
	definePlugin({
		core: '^0.0.0',
		pluginId: 'fixture.relation-inclusion-database',
		version: '0.0.0',
		capabilities: [provideTestDatabaseAdapter(adapter)],
	})

describe('Runtime relation-filter inclusions', () => {
	it('filters nested paginated inclusions once across every parent', async () => {
		const trace: string[] = []
		let roomResolverCalls = 0
		let memberResolverCalls = 0
		const Member = Schema.define({
			className: 'FilteredIncludedMember',
			fields: (field) => ({
				name: field.string(),
				role: field.string(),
				visible: field.boolean(),
			}),
		})
		const Room = Schema.define({
			className: 'FilteredIncludedRoom',
			fields: (field) => ({
				active: field.boolean(),
				members: field.relation({
					target: 'FilteredIncludedMember',
					where: (({ context, where }) => {
						memberResolverCalls += 1
						trace.push(`member-filter:${context.requestId}`)
						return where
							.eq('visible', true)
							.ne('id', context.getValue(principalId) ?? 'anonymous')
					}) as RelationWhereResolver<typeof Member>,
				}),
				name: field.string(),
				tenant: field.string(),
			}),
		})
		const Workspace = Schema.define({
			className: 'FilteredIncludedWorkspace',
			fields: (field) => ({
				name: field.string(),
				rooms: field.relation({
					target: 'FilteredIncludedRoom',
					where: (({ context, where }) => {
						roomResolverCalls += 1
						trace.push(`room-filter:${context.requestId}`)
						return where.eq('active', true)
					}) as RelationWhereResolver<typeof Room>,
				}),
			}),
		})
		const firstWorkspace = { id: firstSourceId, name: 'First workspace' }
		const secondWorkspace = { id: secondSourceId, name: 'Second workspace' }
		const firstRoom = { id: firstTargetId, name: 'First room' }
		const secondRoom = { id: secondTargetId, name: 'Second room' }
		const member = {
			id: '0198f090-2a50-7000-8000-000000000205',
			name: 'Visible member',
		}
		const adapter = new RecordingDatabaseAdapter(
			[
				{
					inclusions: [
						{
							fieldPath: ['rooms'],
							record: firstWorkspace,
							target: [firstRoom, secondRoom],
						},
						{
							fieldPath: ['rooms'],
							record: secondWorkspace,
							target: [],
						},
						{
							fieldPath: ['members'],
							record: firstRoom,
							target: [member],
						},
						{
							fieldPath: ['members'],
							record: secondRoom,
							target: [],
						},
					],
					status: 'fulfilled',
					value: [firstWorkspace, secondWorkspace],
				},
			],
			trace,
		)
		const policy = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.relation-inclusion-policy',
			version: '0.0.0',
			privileges: [
				{
					name: 'runtime:constrain',
					reason: 'Proves nested inclusion constraint composition.',
				},
			],
			capabilities: [
				provideTestRuntimeConstraint(
					'fixture.included-room-policy',
					protectedPolicy({
						evaluate: () => {
							trace.push('room-policy')
							return {
								rowFilter: normalizeWhereInput(Room, {
									tenant: { eq: 'tenant-a' },
								}),
							}
						},
						operations: ['find-many'],
						relation: () => {
							trace.push('room-traversal')
							return true
						},
						schema: Room,
					}),
				),
				provideTestRuntimeConstraint(
					'fixture.included-member-policy',
					protectedPolicy({
						evaluate: () => {
							trace.push('member-policy')
							return {
								rowFilter: normalizeWhereInput(Member, {
									role: { ne: 'blocked' },
								}),
							}
						},
						operations: ['find-many'],
						relation: () => {
							trace.push('member-traversal')
							return true
						},
						schema: Member,
					}),
				),
			],
		})
		const application = await createApplication({
			plugins: [policy, databasePlugin(adapter)],
			schemas: [Workspace, Room, Member],
		})
		const framework = createFrameworkEngine(application)
		const context = RequestContext.anonymous({
			requestId: 'nested-inclusion-filter',
			source: requestSources.internal,
		}).withValue(principalId, member.id)
		const request = framework.withContext(context)

		try {
			const result = await runWithRequestEngine(request, () =>
				Workspace.findMany({
					include: {
						rooms: {
							include: { members: { select: { name: true } } },
							limit: 2,
							offset: 1,
							orderBy: { name: 'desc' },
							select: { name: true },
							where: { name: { contains: 'room' } },
						},
					},
					select: { name: true },
				}),
			)

			expect(result).toHaveLength(2)
			const output: unknown = result.map((workspace) => workspace.toJSON())
			expect(output).toEqual([
				{
					id: firstWorkspace.id,
					name: firstWorkspace.name,
					rooms: [
						{
							id: firstRoom.id,
							members: [{ id: member.id, name: member.name }],
							name: firstRoom.name,
						},
						{
							id: secondRoom.id,
							members: [],
							name: secondRoom.name,
						},
					],
				},
				{
					id: secondWorkspace.id,
					name: secondWorkspace.name,
					rooms: [],
				},
			])
			expect(result[0]?.id).toBe(firstSourceId)
			expect(roomResolverCalls).toBe(1)
			expect(memberResolverCalls).toBe(1)
			expect(adapter.rootRequests).toHaveLength(1)

			const roomPlan = adapter.rootRequests[0]?.inclusions?.[0]
			const memberPlan = roomPlan?.request.inclusions?.[0]
			expect(roomPlan?.request.operation).toMatchObject({
				kind: 'find-many',
				query: {
					limit: 2,
					ordering: {
						orders: [{ direction: 'descending', field: 'name' }],
					},
					pagination: { kind: 'offset-pagination', offset: 1 },
					selection: {
						fields: [
							{ field: 'name', kind: 'selected-field' },
							{ field: 'id', kind: 'selected-field' },
						],
					},
					where: {
						expression: {
							field: 'name',
							kind: 'contains',
							value: 'room',
						},
					},
				},
			})
			expect(roomPlan?.request.rowFilter).toMatchObject({
				expressions: [
					{ field: 'active', kind: 'equal', value: true },
					{ field: 'tenant', kind: 'equal', value: 'tenant-a' },
				],
				kind: 'and',
			})
			expect(memberPlan?.request.rowFilter).toMatchObject({
				expressions: [
					{ field: 'visible', kind: 'equal', value: true },
					{ field: 'id', kind: 'not-equal', value: member.id },
					{ field: 'role', kind: 'not-equal', value: 'blocked' },
				],
				kind: 'and',
			})
			expect(roomPlan?.request).not.toHaveProperty('context')
			expect(memberPlan?.request).not.toHaveProperty('context')
			expect(trace).toStrictEqual([
				'room-traversal',
				'room-policy',
				'room-filter:nested-inclusion-filter',
				'member-traversal',
				'member-policy',
				'member-filter:nested-inclusion-filter',
				'execute:find-many',
			])
		} finally {
			await application.dispose()
		}
	})

	it('keeps pointer projection independent from a neighboring relation filter', async () => {
		let resolverCalls = 0
		const User = Schema.define({
			className: 'PointerIsolationUser',
			fields: (field) => ({ name: field.string(), visible: field.boolean() }),
		})
		const Post = Schema.define({
			className: 'PointerIsolationPost',
			fields: (field) => ({
				author: field.pointer({ target: 'PointerIsolationUser' }),
				reviewers: field.relation({
					target: 'PointerIsolationUser',
					where: (({ where }) => {
						resolverCalls += 1
						return where.eq('visible', true)
					}) as RelationWhereResolver<typeof User>,
				}),
				title: field.string(),
			}),
		})
		const author = User.pointer(firstTargetId)
		const post = {
			author,
			createdAt: now,
			id: firstSourceId,
			title: 'Pointer-safe',
			updatedAt: now,
		}
		const adapter = new RecordingDatabaseAdapter(
			[
				{
					inclusions: [
						{
							fieldPath: ['author'],
							record: post,
							target: { id: firstTargetId, name: 'Author' },
						},
						{
							fieldPath: ['reviewers'],
							record: post,
							target: [],
						},
					],
					status: 'fulfilled',
					value: [post],
				},
			],
			[],
		)
		const application = await createApplication({
			plugins: [databasePlugin(adapter)],
			schemas: [Post, User],
		})
		const framework = createFrameworkEngine(application)
		const request = framework.anonymous({
			requestId: 'pointer-inclusion-isolation',
			source: requestSources.internal,
		})

		try {
			const result = await runWithRequestEngine(request, () =>
				Post.findMany({
					include: {
						author: { select: { name: true } },
						reviewers: { select: { name: true } },
					},
				}),
			)
			const plans = adapter.rootRequests[0]?.inclusions
			const pointerPlan = plans?.find(({ kind }) => kind === 'pointer')
			const relationPlan = plans?.find(({ kind }) => kind === 'relation')

			expect(result[0]?.author).toMatchObject({
				id: firstTargetId,
				name: 'Author',
			})
			expect(result[0]?.reviewers).toStrictEqual([])
			expect(pointerPlan?.request.rowFilter).toBeUndefined()
			expect(relationPlan?.request.rowFilter).toMatchObject({
				field: 'visible',
				kind: 'equal',
				value: true,
			})
			expect(resolverCalls).toBe(1)
		} finally {
			await application.dispose()
		}
	})

	it('reuses one relation plan and resolver for grouped mutation results', async () => {
		let resolverCalls = 0
		const Target = Schema.define({
			className: 'MutationIncludedTarget',
			fields: (field) => ({ label: field.string(), visible: field.boolean() }),
		})
		const Source = Schema.define({
			className: 'MutationIncludedSource',
			fields: (field) => ({
				name: field.string({ required: true }),
				targets: field.relation({
					target: 'MutationIncludedTarget',
					where: (({ where }) => {
						resolverCalls += 1
						return where.eq('visible', true)
					}) as RelationWhereResolver<typeof Target>,
				}),
			}),
		})
		const first = {
			createdAt: now,
			id: firstSourceId,
			name: 'First',
			updatedAt: now,
		}
		const second = {
			createdAt: now,
			id: secondSourceId,
			name: 'Second',
			updatedAt: now,
		}
		const firstResult = { id: first.id, name: first.name }
		const secondResult = { id: second.id, name: second.name }
		const adapter = new RecordingDatabaseAdapter(
			[
				{
					materializations: [{ current: first, kind: 'create' }],
					status: 'fulfilled',
					value: firstResult,
				},
				{
					materializations: [{ current: second, kind: 'create' }],
					status: 'fulfilled',
					value: secondResult,
				},
				{
					inclusions: [
						{
							fieldPath: ['targets'],
							record: firstResult,
							target: [],
						},
						{
							fieldPath: ['targets'],
							record: secondResult,
							target: [],
						},
					],
					status: 'fulfilled',
					value: [firstResult, secondResult],
				},
			],
			[],
		)
		const application = await createApplication({
			plugins: [databasePlugin(adapter)],
			schemas: [Source, Target],
		})
		const framework = createFrameworkEngine(application)
		const request = framework.anonymous({
			requestId: 'grouped-mutation-inclusion-filter',
			source: requestSources.internal,
		})

		try {
			const result = await runWithRequestEngine(request, () =>
				Source.createMany({
					data: [{ name: 'First' }, { name: 'Second' }],
					include: { targets: { select: { label: true } } },
					select: { name: true },
				}),
			)
			const transaction = adapter.transactions[0]
			const projection = transaction?.requests[2]

			expect(result.map(({ targets }) => targets)).toStrictEqual([[], []])
			expect(resolverCalls).toBe(1)
			expect(
				transaction?.requests.map(({ operation }) => operation.kind),
			).toStrictEqual(['create-one', 'create-one', 'find-many'])
			expect(projection?.inclusions).toHaveLength(1)
			expect(projection?.inclusions?.[0]?.request.rowFilter).toMatchObject({
				field: 'visible',
				kind: 'equal',
				value: true,
			})
		} finally {
			await application.dispose()
		}
	})

	it('applies the same prepared filter to a singular mutation projection', async () => {
		let resolverCalls = 0
		const Target = Schema.define({
			className: 'SingularMutationIncludedTarget',
			fields: (field) => ({ label: field.string(), visible: field.boolean() }),
		})
		const Source = Schema.define({
			className: 'SingularMutationIncludedSource',
			fields: (field) => ({
				name: field.string({ required: true }),
				targets: field.relation({
					target: 'SingularMutationIncludedTarget',
					where: (({ where }) => {
						resolverCalls += 1
						return where.eq('visible', true)
					}) as RelationWhereResolver<typeof Target>,
				}),
			}),
		})
		const current = {
			createdAt: now,
			id: firstSourceId,
			name: 'Created',
			updatedAt: now,
		}
		const mutationResult = { id: current.id, name: current.name }
		const projected = mutationResult
		const adapter = new RecordingDatabaseAdapter(
			[
				{
					materializations: [{ current, kind: 'create' }],
					status: 'fulfilled',
					value: mutationResult,
				},
				{
					inclusions: [
						{
							fieldPath: ['targets'],
							record: projected,
							target: [],
						},
					],
					status: 'fulfilled',
					value: projected,
				},
			],
			[],
		)
		const application = await createApplication({
			plugins: [databasePlugin(adapter)],
			schemas: [Source, Target],
		})
		const framework = createFrameworkEngine(application)
		const request = framework.anonymous({
			requestId: 'singular-mutation-inclusion-filter',
			source: requestSources.internal,
		})

		try {
			const result = await runWithRequestEngine(request, () =>
				Source.createOne({
					data: { name: current.name },
					include: { targets: { select: { label: true } } },
					select: { name: true },
				}),
			)
			const requests = adapter.transactions[0]?.requests

			expect(result.targets).toStrictEqual([])
			expect(resolverCalls).toBe(1)
			expect(requests?.map(({ operation }) => operation.kind)).toStrictEqual([
				'create-one',
				'get',
			])
			for (const databaseRequest of requests ?? []) {
				expect(
					databaseRequest.inclusions?.[0]?.request.rowFilter,
				).toMatchObject({
					field: 'visible',
					kind: 'equal',
					value: true,
				})
			}
		} finally {
			await application.dispose()
		}
	})
})
