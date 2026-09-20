import { describe, expect, it } from 'vitest'
import { increment, type FrameworkError } from '../../src/index.js'

import { runWithRequestEngine } from '../../src/runtime/index.js'
import { type RecordingPipelineBehaviorStages } from './fixtures/recording-database-adapter.js'

import {
	expectCommittedTransaction,
	accountRecord,
	accountSchema,
	createRequest,
} from './fixtures/bulk-terminals.js'
describe('bulk and upsert terminals', () => {
	it('returns an empty immutable result without opening a transaction', async () => {
		const trace: string[] = []
		const { adapter, request } = await createRequest([], trace)

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
		const { adapter, request } = await createRequest(
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
		const { adapter, request } = await createRequest(
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
		const { adapter, request } = await createRequest(
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
		const { adapter, request } = await createRequest(
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
		const { adapter, request } = await createRequest(
			[{ status: 'fulfilled', value: created[0] }],
			trace,
			{
				transformResult: () => Promise.reject(hookError),
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
		const behaviorStages: RecordingPipelineBehaviorStages = {
			transformResult: (input) => {
				afterKinds.push(input.operation.kind)

				return input.result
			},
			beforeOperation: (input) => {
				beforeKinds.push(input.operation.kind)
			},
		}
		const { adapter: updateAdapter, request: updateRequest } =
			await createRequest(
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
				behaviorStages,
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
		await updateRequest.application.dispose()
		const { adapter: deleteAdapter, request: deleteRequest } =
			await createRequest(
				[3, 4].map((suffix) => {
					const id = `0198f090-2a50-7000-8000-00000000004${String(suffix)}`

					return {
						status: 'fulfilled' as const,
						target: accountRecord(
							id,
							`delete-${String(suffix)}@example.com`,
							0,
						),
						value: { id },
					}
				}),
				deleteTrace,
				behaviorStages,
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
		const { adapter, request } = await createRequest(
			[{ status: 'fulfilled', value: created[0] }],
			trace,
		)

		await request.transaction(() =>
			accountSchema.createMany({ data: [{ email: 'first@example.com' }] }),
		)

		expectCommittedTransaction(adapter, trace, ['create-one'])
	})
})
