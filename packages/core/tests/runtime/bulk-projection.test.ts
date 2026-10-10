import { describe, expect, it } from 'vitest'

import { createEnforcementState } from '../../src/runtime/enforcement/state.js'
import {
	RequestContext,
	requestSources,
	runWithRequestEngine,
	type RuntimeEnforcementStages,
} from '../../src/runtime/index.js'

import {
	accountRecord,
	accountSchema,
	createRequest,
	fixtureInstant,
	managerSchema,
} from './fixtures/bulk-terminals.js'
import type { QueuedAdapterResult } from './fixtures/recording-database-adapter.js'

/** Answers the visibility read of one `connect` target (ADR-0308). */
const managerLookup = (
	manager: Readonly<{ id: string }>,
): QueuedAdapterResult => ({
	status: 'fulfilled',
	value: {
		createdAt: fixtureInstant,
		id: manager.id,
		name: 'Manager',
		updatedAt: fixtureInstant,
	},
})
import { readRequestEngineApplication } from '../../src/runtime/engine/request-engine.js'
// Grouped reads retain the original item order and transaction failure semantics.
describe('bulk result projection', () => {
	it('projects bulk results while retaining complete private materializations', async () => {
		const trace: string[] = []
		const current = accountRecord(
			'0198f090-2a50-7000-8000-000000000024',
			'projected@example.com',
			0,
		)
		const { request } = await createRequest(
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
			await createRequest(
				[
					managerLookup(firstManager),
					{
						materializations: [{ current: first, kind: 'create' }],
						status: 'fulfilled',
						value: firstCreateResult,
					},
					managerLookup(secondManager),
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
					beforeOperation: ({ operation }) => {
						createHookKinds.push(`before:${operation.kind}`)
					},
					transformResult: (input) => {
						createHookKinds.push(`after:${input.operation.kind}`)

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
					{ email: first.email, manager: { connect: firstManager } },
					{ email: second.email, manager: { connect: secondManager } },
				],
				include,
				select: { email: true },
			}),
		)
		await readRequestEngineApplication(createRequestEngine).dispose()
		const { adapter: updateAdapter, request: updateRequest } =
			await createRequest(
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
					beforeOperation: ({ operation }) => {
						updateHookKinds.push(`before:${operation.kind}`)
					},
					transformResult: (input) => {
						updateHookKinds.push(`after:${input.operation.kind}`)

						return input.result
					},
				},
			)
		const updated = await runWithRequestEngine(updateRequest, () =>
			accountSchema.updateMany({
				data: [first, second].map(({ id }) => ({
					data: { visits: { increment: 1 } },
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
			// ADR-0308: each `connect` target is read before its write.
		).toStrictEqual([
			'find-one',
			'create-one',
			'find-one',
			'create-one',
			'find-many',
		])
		expect(createTrace).toContain('execute:find-many')
		expect(updateTrace).toContain('execute:find-many')
		expect(createHookKinds).toStrictEqual([
			'before:find-one',
			'after:find-one',
			'before:create-one',
			'after:create-one',
			'before:find-one',
			'after:find-one',
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
			enforceOperation: ({ operation }) => ({ operation }),
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
		const { request } = await createRequest(
			[
				managerLookup(manager),
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
					data: [{ email: created.email, manager: { connect: manager } }],
					include: { manager: { select: { name: true } } },
					select: { email: true },
				},
				{ context: explicitContext },
			),
		)

		// The third evaluation decides whether the created rows are readable
		// (ADR-0306); the first reads the `connect` target (ADR-0308).
		expect(observedRequestIds).toStrictEqual([
			'explicit-grouped-context',
			'explicit-grouped-context',
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
		const { adapter, request } = await createRequest(
			[
				managerLookup(manager),
				{
					materializations: [{ current: first, kind: 'create' }],
					status: 'fulfilled',
					value: firstResult,
				},
				managerLookup(manager),
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
						{ email: first.email, manager: { connect: manager } },
						{ email: second.email, manager: { connect: manager } },
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
		const { adapter, request } = await createRequest(
			[
				managerLookup(manager),
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
					data: [{ email: created.email, manager: { connect: manager } }],
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
		const { adapter, request } = await createRequest(
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
						data: { visits: { increment: 1 } },
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
})
