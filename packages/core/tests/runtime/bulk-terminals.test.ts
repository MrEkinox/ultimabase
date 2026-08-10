import {
	FrameworkApplication,
	increment,
	type FrameworkError,
	type SchemaMutationHookKind,
} from '../../src/index.js'
import { Schema } from '../../src/index.js'
import { describe, expect, it } from 'vitest'

import {
	FrameworkEngine,
	RequestContext,
	requestSources,
	type RuntimeEnforcementStages,
	runWithRequestEngine,
} from '../../src/runtime/index.js'
import { createEnforcementState } from '../../src/runtime/enforcement/state.js'
import {
	createRecordingPipeline,
	RecordingDatabaseAdapter,
	type QueuedAdapterResult,
	type RecordingPipelineHookStages,
} from './fixtures/recording-database-adapter.js'

const managerSchema = Schema.define({
	className: 'BulkManager',
	fields: (field) => ({
		name: field.string({ validation: { required: true } }),
	}),
})

const accountSchema = Schema.define({
	className: 'BulkAccount',
	fields: (field) => ({
		email: field.string({
			indexed: 'unique',
			validation: { required: true },
		}),
		manager: field.pointer({ target: 'BulkManager' }),
		reports: field.relation({ target: 'BulkAccount' }),
		visits: field.int({ default: 0 }),
	}),
})

const fixtureInstant = '2026-08-02T00:00:00.000Z'

/** Creates complete account rows for strict adapter result validation. */
const accountRecord = (id: string, email: string, visits: number) => ({
	createdAt: fixtureInstant,
	email,
	id,
	updatedAt: fixtureInstant,
	visits,
})

/** Binds bulk terminals to the real request engine and transaction pipeline. */
const createRequest = (
	results: readonly QueuedAdapterResult[],
	trace: string[],
	hookStages: RecordingPipelineHookStages = {},
	enforcement?: RuntimeEnforcementStages,
) => {
	const adapter = new RecordingDatabaseAdapter(results, trace)
	const application = new FrameworkApplication({
		schemas: [managerSchema, accountSchema],
		plugins: [],
	})

	application.compileSchemas()
	const framework = new FrameworkEngine({
		application,
		pipeline: createRecordingPipeline(adapter, trace, hookStages, enforcement),
	})
	const request = framework.anonymous({
		requestId: 'bulk-1',
		source: requestSources.internal,
	})

	return { adapter, request }
}

/** Verifies the common lifecycle shared by every committed root mutation. */
const expectCommittedTransaction = (
	adapter: RecordingDatabaseAdapter,
	trace: readonly string[],
	kinds: readonly SchemaMutationHookKind[],
): void => {
	expect(adapter.rootRequests).toStrictEqual([])
	expect(adapter.transactions).toHaveLength(1)
	expect(
		adapter.transactions[0]?.requests.map(({ operation }) => operation.kind),
	).toStrictEqual(kinds)
	expect(trace).toStrictEqual([
		'adapter:begin',
		...kinds.flatMap((kind) => [`prepare:${kind}`, `execute:${kind}`]),
		'adapter:commit',
		...kinds.map((kind) => `event:${kind}`),
	])
}

describe('bulk and upsert terminals', () => {
	it('returns an empty immutable result without opening a transaction', async () => {
		const trace: string[] = []
		const { adapter, request } = createRequest([], trace)

		const result = await runWithRequestEngine(request, () =>
			accountSchema.updateMany({
				data: [],
				include: { manager: { select: { name: true } } },
			}),
		)

		expect(result).toStrictEqual([])
		expect(Object.isFrozen(result)).toBe(true)
		expect(adapter.transactions).toStrictEqual([])
		expect(trace).toStrictEqual([])
	})

	it('projects bulk results while retaining complete private materializations', async () => {
		const trace: string[] = []
		const current = accountRecord(
			'0198f090-2a50-7000-8000-000000000024',
			'projected@example.com',
			0,
		)
		const { request } = createRequest(
			[
				{
					materializations: [{ current, kind: 'create' }],
					status: 'fulfilled',
					value: { email: current.email, id: current.id },
				},
			],
			trace,
		)

		const result = await runWithRequestEngine(request, () =>
			accountSchema.createMany({
				data: [{ email: current.email }],
				select: { email: true },
			}),
		)

		expect(result[0]?.toJSON()).toStrictEqual({
			email: current.email,
			id: current.id,
		})
		expect(result[0]?.get('email')).toBe(current.email)
	})

	it('groups create and update inclusions while preserving declared order', async () => {
		const firstManager = managerSchema.pointer(
			'0198f090-2a50-7000-8000-000000000100',
		)
		const secondManager = managerSchema.pointer(
			'0198f090-2a50-7000-8000-000000000101',
		)
		const first = {
			...accountRecord(
				'0198f090-2a50-7000-8000-000000000102',
				'first-grouped@example.com',
				0,
			),
			manager: firstManager,
		}
		const second = {
			...accountRecord(
				'0198f090-2a50-7000-8000-000000000103',
				'second-grouped@example.com',
				0,
			),
			manager: secondManager,
		}
		const updatedFirst = { ...first, visits: 1 }
		const updatedSecond = { ...second, visits: 1 }
		const createTrace: string[] = []
		const updateTrace: string[] = []
		const createHookKinds: string[] = []
		const updateHookKinds: string[] = []
		const firstCreateResult = {
			email: first.email,
			id: first.id,
			manager: firstManager,
		}
		const secondCreateResult = {
			email: second.email,
			id: second.id,
			manager: secondManager,
		}
		const firstUpdateResult = { id: first.id, manager: firstManager }
		const secondUpdateResult = { id: second.id, manager: secondManager }
		const firstCreateProjection = firstCreateResult
		const secondCreateProjection = secondCreateResult
		const { adapter: createAdapter, request: createRequestEngine } =
			createRequest(
				[
					{
						materializations: [{ current: first, kind: 'create' }],
						status: 'fulfilled',
						value: firstCreateResult,
					},
					{
						materializations: [{ current: second, kind: 'create' }],
						status: 'fulfilled',
						value: secondCreateResult,
					},
					{
						inclusions: [
							{
								fieldPath: ['manager'],
								record: secondCreateProjection,
								target: { id: secondManager.id, name: 'Second manager' },
							},
							{
								fieldPath: ['manager'],
								record: firstCreateProjection,
								target: { id: firstManager.id, name: 'First manager' },
							},
						],
						status: 'fulfilled',
						value: [secondCreateProjection, firstCreateProjection],
					},
				],
				createTrace,
				{
					schemaBeforeHooks: ({ operation }) => {
						createHookKinds.push(`before:${operation.kind}`)
					},
					schemaAfterHooks: (input) => {
						createHookKinds.push(`after:${input.operation.kind}`)

						return input.result
					},
				},
			)
		const { adapter: updateAdapter, request: updateRequest } = createRequest(
			[
				{
					materializations: [
						{ current: updatedFirst, kind: 'update', previous: first },
					],
					status: 'fulfilled',
					target: first,
					value: firstUpdateResult,
				},
				{
					materializations: [
						{ current: updatedSecond, kind: 'update', previous: second },
					],
					status: 'fulfilled',
					target: second,
					value: secondUpdateResult,
				},
				{
					inclusions: [
						{
							fieldPath: ['manager'],
							record: secondUpdateResult,
							target: { id: secondManager.id, name: 'Second manager' },
						},
						{
							fieldPath: ['manager'],
							record: firstUpdateResult,
							target: { id: firstManager.id, name: 'First manager' },
						},
					],
					status: 'fulfilled',
					value: [secondUpdateResult, firstUpdateResult],
				},
			],
			updateTrace,
			{
				schemaBeforeHooks: ({ operation }) => {
					updateHookKinds.push(`before:${operation.kind}`)
				},
				schemaAfterHooks: (input) => {
					updateHookKinds.push(`after:${input.operation.kind}`)

					return input.result
				},
			},
		)
		const include = {
			manager: { select: { name: true } },
		} as const

		const created = await runWithRequestEngine(createRequestEngine, () =>
			accountSchema.createMany({
				data: [
					{ email: first.email, manager: firstManager },
					{ email: second.email, manager: secondManager },
				],
				include,
				select: { email: true },
			}),
		)
		const updated = await runWithRequestEngine(updateRequest, () =>
			accountSchema.updateMany({
				data: [first, second].map(({ id }) => ({
					data: { visits: increment(1) },
					where: { id: { eq: id } },
				})),
				include,
			}),
		)

		expect(created.map(({ email }) => email)).toStrictEqual([
			first.email,
			second.email,
		])
		expect(updated.map(({ id }) => id)).toStrictEqual([first.id, second.id])
		const createdManagers: unknown[] = created.map(({ manager }) => manager)
		const updatedManagers: unknown[] = updated.map(({ manager }) => manager)
		expect(
			[...createdManagers, ...updatedManagers].every(
				(manager) => manager instanceof managerSchema,
			),
		).toBe(true)
		expect(
			createdManagers.map((manager) =>
				manager instanceof managerSchema ? manager.name : undefined,
			),
		).toStrictEqual(['First manager', 'Second manager'])
		expect(
			updateAdapter.transactions[0]?.requests.map(
				({ operation }) => operation.kind,
			),
		).toStrictEqual(['update-one', 'update-one', 'find-many'])
		expect(
			createAdapter.transactions[0]?.requests.map(
				({ operation }) => operation.kind,
			),
		).toStrictEqual(['create-one', 'create-one', 'find-many'])
		expect(createTrace).toContain('execute:find-many')
		expect(updateTrace).toContain('execute:find-many')
		expect(createHookKinds).toStrictEqual([
			'before:create-one',
			'after:create-one',
			'before:create-one',
			'after:create-one',
		])
		expect(updateHookKinds).toStrictEqual([
			'before:update-one',
			'after:update-one',
			'before:update-one',
			'after:update-one',
		])
	})

	it('keeps the effective request context through grouped target Access', async () => {
		const trace: string[] = []
		const observedRequestIds: string[] = []
		const state = createEnforcementState()
		const enforcement: RuntimeEnforcementStages = {
			evaluate: ({ context }) => {
				observedRequestIds.push(context.requestId)

				return state
			},
			reevaluate: () => state,
			enforceOperation: ({ operation }) => ({
				constraints: [],
				operation,
			}),
			enforceSelectionResult: ({ result }) => result,
			enforceResult: ({ result }) => result,
		}
		const manager = managerSchema.pointer(
			'0198f090-2a50-7000-8000-000000000112',
		)
		const created = {
			...accountRecord(
				'0198f090-2a50-7000-8000-000000000113',
				'context-projection@example.com',
				0,
			),
			manager,
		}
		const mutationResult = { email: created.email, id: created.id, manager }
		const projectionResult = mutationResult
		const { request } = createRequest(
			[
				{
					materializations: [{ current: created, kind: 'create' }],
					status: 'fulfilled',
					value: mutationResult,
				},
				{
					inclusions: [
						{
							fieldPath: ['manager'],
							record: projectionResult,
							target: { id: manager.id, name: 'Context manager' },
						},
					],
					status: 'fulfilled',
					value: [projectionResult],
				},
			],
			trace,
			{},
			enforcement,
		)
		const explicitContext = RequestContext.anonymous({
			requestId: 'explicit-grouped-context',
			source: requestSources.internal,
		})

		await runWithRequestEngine(request, () =>
			accountSchema.createMany(
				{
					data: [{ email: created.email, manager }],
					include: { manager: { select: { name: true } } },
					select: { email: true },
				},
				{ context: explicitContext },
			),
		)

		expect(observedRequestIds).toStrictEqual([
			'explicit-grouped-context',
			'explicit-grouped-context',
		])
	})

	it('rolls back a grouped projection that omits a persisted identity', async () => {
		const trace: string[] = []
		const manager = managerSchema.pointer(
			'0198f090-2a50-7000-8000-000000000104',
		)
		const first = {
			...accountRecord(
				'0198f090-2a50-7000-8000-000000000105',
				'first-missing@example.com',
				0,
			),
			manager,
		}
		const second = {
			...accountRecord(
				'0198f090-2a50-7000-8000-000000000106',
				'second-missing@example.com',
				0,
			),
			manager,
		}
		const firstResult = { email: first.email, id: first.id, manager }
		const secondResult = { email: second.email, id: second.id, manager }
		const { adapter, request } = createRequest(
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
					status: 'fulfilled',
					value: [firstResult],
				},
			],
			trace,
		)

		await expect(
			runWithRequestEngine(request, () =>
				accountSchema.createMany({
					data: [
						{ email: first.email, manager },
						{ email: second.email, manager },
					],
					include: { manager: { select: { name: true } } },
					select: { email: true },
				}),
			),
		).rejects.toThrow('Mutation batch projection omitted a persisted object')
		expect(adapter.transactions).toHaveLength(1)
		expect(trace.at(-1)).toBe('adapter:rollback')
	})

	it('rolls back a grouped projection that returns an unknown identity', async () => {
		const trace: string[] = []
		const manager = managerSchema.pointer(
			'0198f090-2a50-7000-8000-000000000109',
		)
		const created = {
			...accountRecord(
				'0198f090-2a50-7000-8000-000000000110',
				'known-projection@example.com',
				0,
			),
			manager,
		}
		const mutationResult = { email: created.email, id: created.id, manager }
		const unknownId = '0198f090-2a50-7000-8000-000000000111'
		const { adapter, request } = createRequest(
			[
				{
					materializations: [{ current: created, kind: 'create' }],
					status: 'fulfilled',
					value: mutationResult,
				},
				{
					status: 'fulfilled',
					value: [{ ...mutationResult, id: unknownId }],
				},
			],
			trace,
		)

		await expect(
			runWithRequestEngine(request, () =>
				accountSchema.createMany({
					data: [{ email: created.email, manager }],
					include: { manager: { select: { name: true } } },
					select: { email: true },
				}),
			),
		).rejects.toThrow(
			`Mutation batch projected an unknown object id: ${unknownId}`,
		)
		expect(adapter.transactions).toHaveLength(1)
		expect(trace.at(-1)).toBe('adapter:rollback')
	})

	it('rejects repeated directed targets before a grouped projection read', async () => {
		const trace: string[] = []
		const manager = managerSchema.pointer(
			'0198f090-2a50-7000-8000-000000000107',
		)
		const previous = {
			...accountRecord(
				'0198f090-2a50-7000-8000-000000000108',
				'duplicate-target@example.com',
				0,
			),
			manager,
		}
		const first = { ...previous, visits: 1 }
		const second = { ...first, visits: 2 }
		const projected = { id: previous.id, manager }
		const { adapter, request } = createRequest(
			[
				{
					materializations: [{ current: first, kind: 'update', previous }],
					status: 'fulfilled',
					target: previous,
					value: projected,
				},
				{
					materializations: [
						{ current: second, kind: 'update', previous: first },
					],
					status: 'fulfilled',
					target: first,
					value: projected,
				},
			],
			trace,
		)

		await expect(
			runWithRequestEngine(request, () =>
				accountSchema.updateMany({
					data: [0, 1].map(() => ({
						data: { visits: increment(1) },
						where: { id: { eq: previous.id } },
					})),
					include: { manager: { select: { name: true } } },
				}),
			),
		).rejects.toThrow(
			`Mutation batch contains duplicate object id: ${previous.id}`,
		)
		expect(
			adapter.transactions[0]?.requests.map(({ operation }) => operation.kind),
		).toStrictEqual(['update-one', 'update-one'])
		expect(trace.at(-1)).toBe('adapter:rollback')
	})

	it('creates ordered objects in an automatic transaction by default', async () => {
		const trace: string[] = []
		const created = [
			accountRecord(
				'0198f090-2a50-7000-8000-000000000025',
				'first@example.com',
				0,
			),
			accountRecord(
				'0198f090-2a50-7000-8000-000000000026',
				'second@example.com',
				0,
			),
		] as const
		const { adapter, request } = createRequest(
			created.map((value) => ({ status: 'fulfilled' as const, value })),
			trace,
		)

		const result = await runWithRequestEngine(request, () =>
			accountSchema.createMany({
				data: [{ email: 'first@example.com' }, { email: 'second@example.com' }],
			}),
		)

		expect(result.every((account) => account instanceof accountSchema)).toBe(
			true,
		)
		expect(result.map((account) => account.toJSON())).toStrictEqual(created)
		expect(
			adapter.transactions[0]?.requests.map(({ operation }) => operation.kind),
		).toStrictEqual(['create-one', 'create-one'])
		expectCommittedTransaction(adapter, trace, ['create-one', 'create-one'])
	})

	it('upserts ordered independent unique targets in one automatic transaction', async () => {
		const trace: string[] = []
		const upserted = [
			accountRecord(
				'0198f090-2a50-7000-8000-000000000027',
				'first@example.com',
				1,
			),
			accountRecord(
				'0198f090-2a50-7000-8000-000000000028',
				'second@example.com',
				1,
			),
		] as const
		const { adapter, request } = createRequest(
			upserted.map((value) => ({ status: 'fulfilled' as const, value })),
			trace,
		)

		const result = await runWithRequestEngine(request, () =>
			accountSchema.upsertMany({
				data: [
					{
						where: { email: { eq: 'first@example.com' } },
						create: { email: 'first@example.com' },
						update: { visits: increment(1) },
					},
					{
						where: { email: { eq: 'second@example.com' } },
						create: { email: 'second@example.com' },
						update: { visits: increment(1) },
					},
				],
			}),
		)

		expect(result.every((account) => account instanceof accountSchema)).toBe(
			true,
		)
		expect(result.map((account) => account.toJSON())).toStrictEqual(upserted)
		expect(
			adapter.transactions[0]?.requests.map(({ operation }) => operation.kind),
		).toStrictEqual(['upsert-one', 'upsert-one'])
		expectCommittedTransaction(adapter, trace, ['upsert-one', 'upsert-one'])
	})

	it('rolls back the complete atomic bulk operation when its adapter rejects', async () => {
		const trace: string[] = []
		const writeError = new Error('second object conflicts')
		const first = accountRecord(
			'0198f090-2a50-7000-8000-000000000029',
			'first@example.com',
			0,
		)
		const { adapter, request } = createRequest(
			[
				{ status: 'fulfilled', value: first },
				{ status: 'rejected', error: writeError },
			],
			trace,
		)

		await expect(
			runWithRequestEngine(request, () =>
				accountSchema.createMany({
					data: [
						{ email: 'first@example.com' },
						{ email: 'second@example.com' },
					],
				}),
			),
		).rejects.toBe(writeError)
		expect(adapter.rootRequests).toStrictEqual([])
		expect(adapter.transactions).toHaveLength(1)
		expect(adapter.transactions[0]?.requests).toHaveLength(2)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:create-one',
			'execute:create-one',
			'prepare:create-one',
			'execute:create-one',
			'adapter:rollback',
		])
	})

	it('rolls back earlier item writes when a directed batch target is missing', async () => {
		const trace: string[] = []
		const firstId = '0198f090-2a50-7000-8000-000000000090'
		const missingId = '0198f090-2a50-7000-8000-000000000091'
		const previous = accountRecord(firstId, 'first@example.com', 0)
		const current = { ...previous, visits: 1 }
		const { adapter, request } = createRequest(
			[
				{
					materializations: [{ current, kind: 'update', previous }],
					status: 'fulfilled',
					target: previous,
					value: { id: firstId },
				},
				{ status: 'fulfilled', target: null, value: null },
			],
			trace,
		)

		await expect(
			runWithRequestEngine(request, () =>
				accountSchema.updateMany({
					data: [
						{
							where: { id: { eq: firstId } },
							data: { visits: increment(1) },
						},
						{
							where: { id: { eq: missingId } },
							data: { visits: increment(1) },
						},
					],
				}),
			),
		).rejects.toMatchObject({
			code: 'NOT_FOUND',
		} satisfies Partial<FrameworkError>)
		expect(adapter.transactions[0]?.requests).toHaveLength(2)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:update-one',
			'execute:update-one',
			'prepare:update-one',
			'execute:update-one',
			'adapter:rollback',
		])
	})

	it('rolls back the complete atomic collection when an after hook rejects', async () => {
		const trace: string[] = []
		const hookError = new Error('bulk result rejected')
		const created = [
			accountRecord(
				'0198f090-2a50-7000-8000-000000000032',
				'first@example.com',
				0,
			),
		] as const
		const { adapter, request } = createRequest(
			[{ status: 'fulfilled', value: created[0] }],
			trace,
			{
				schemaAfterHooks: () => Promise.reject(hookError),
			},
		)

		await expect(
			runWithRequestEngine(request, () =>
				accountSchema.createMany({ data: [{ email: 'first@example.com' }] }),
			),
		).rejects.toBe(hookError)
		expect(adapter.transactions[0]?.requests).toHaveLength(1)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:create-one',
			'execute:create-one',
			'adapter:rollback',
		])
	})

	it('returns identifier models for transactional set-based update and delete', async () => {
		const updateTrace: string[] = []
		const deleteTrace: string[] = []
		const beforeKinds: string[] = []
		const afterKinds: string[] = []
		const hookStages: RecordingPipelineHookStages = {
			schemaAfterHooks: (input) => {
				afterKinds.push(input.operation.kind)

				return input.result
			},
			schemaBeforeHooks: (input) => {
				beforeKinds.push(input.operation.kind)
			},
		}
		const { adapter: updateAdapter, request: updateRequest } = createRequest(
			[1, 2, 3].map((visits, index) => {
				const id = `0198f090-2a50-7000-8000-00000000004${String(index)}`

				return {
					status: 'fulfilled' as const,
					target: accountRecord(
						id,
						`update-${String(index)}@example.com`,
						visits - 1,
					),
					value: { id, visits },
				}
			}),
			updateTrace,
			hookStages,
		)
		const { adapter: deleteAdapter, request: deleteRequest } = createRequest(
			[3, 4].map((suffix) => {
				const id = `0198f090-2a50-7000-8000-00000000004${String(suffix)}`

				return {
					status: 'fulfilled' as const,
					target: accountRecord(id, `delete-${String(suffix)}@example.com`, 0),
					value: { id },
				}
			}),
			deleteTrace,
			hookStages,
		)

		const updated = await runWithRequestEngine(updateRequest, () =>
			accountSchema.updateMany({
				data: [0, 1, 2].map((suffix) => ({
					where: {
						id: { eq: `0198f090-2a50-7000-8000-00000000004${String(suffix)}` },
					},
					data: { visits: increment(1) },
				})),
				select: { id: true, visits: true },
			}),
		)
		const deleted = await runWithRequestEngine(deleteRequest, () =>
			accountSchema.deleteMany({
				where: [3, 4].map((suffix) => ({
					id: { eq: `0198f090-2a50-7000-8000-00000000004${String(suffix)}` },
				})),
			}),
		)

		expect(updated.map((item) => item.toJSON())).toStrictEqual([
			{ id: '0198f090-2a50-7000-8000-000000000040', visits: 1 },
			{ id: '0198f090-2a50-7000-8000-000000000041', visits: 2 },
			{ id: '0198f090-2a50-7000-8000-000000000042', visits: 3 },
		])
		expect(deleted.map((item) => item.toJSON())).toStrictEqual([
			{ id: '0198f090-2a50-7000-8000-000000000043' },
			{ id: '0198f090-2a50-7000-8000-000000000044' },
		])
		expect(beforeKinds).toStrictEqual([
			'update-one',
			'update-one',
			'update-one',
			'delete-one',
			'delete-one',
		])
		expect(afterKinds).toStrictEqual(beforeKinds)
		expectCommittedTransaction(updateAdapter, updateTrace, [
			'update-one',
			'update-one',
			'update-one',
		])
		expectCommittedTransaction(deleteAdapter, deleteTrace, [
			'delete-one',
			'delete-one',
		])
	})

	it('reuses an explicit outer transaction instead of nesting automatic bulk work', async () => {
		const trace: string[] = []
		const created = [
			accountRecord(
				'0198f090-2a50-7000-8000-000000000030',
				'first@example.com',
				0,
			),
		] as const
		const { adapter, request } = createRequest(
			[{ status: 'fulfilled', value: created[0] }],
			trace,
		)

		await request.transaction(() =>
			accountSchema.createMany({ data: [{ email: 'first@example.com' }] }),
		)

		expectCommittedTransaction(adapter, trace, ['create-one'])
	})
})
