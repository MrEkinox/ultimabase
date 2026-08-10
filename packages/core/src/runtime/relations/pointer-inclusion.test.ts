import { definePlugin } from '../../foundation.js'
import { Pointer, Schema } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import {
	RecordingDatabaseAdapter,
	type QueuedAdapterResult,
} from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { UltimaBase } from '../application/ultima-base.js'
import {
	databaseAdapterServiceToken,
	type DatabaseAdapter,
	type DatabaseRowFilterNode,
} from '../database/contracts.js'
import { MasterAuthority } from '../master/master-authority.js'

const createDatabasePlugin = (adapter: DatabaseAdapter) =>
	definePlugin({
		name: 'fixture.pointer-runtime-database',
		slot: 'database-adapter',
		setup: ({ services }) => {
			services.provide(databaseAdapterServiceToken, adapter)
		},
	})

const pointerRuntimeOrganization = Schema.define({
	className: 'PointerRuntimeOrganization',
	fields: (field) => ({
		name: field.string({ validation: { required: true } }),
	}),
})

const pointerRuntimeUser = Schema.define({
	className: 'PointerRuntimeUser',
	fields: (field) => ({
		name: field.string({ validation: { required: true } }),
		organization: field.pointer({
			target: 'PointerRuntimeOrganization',
		}),
		status: field.string({ validation: { required: true } }),
	}),
	access: {
		read: { where: ({ where }) => where.eq('status', 'active') },
	},
})

const pointerRuntimePost = Schema.define({
	className: 'PointerRuntimePost',
	fields: (field) => ({
		author: field.pointer({
			target: 'PointerRuntimeUser',
			validation: { required: true },
		}),
		title: field.string({ validation: { required: true } }),
	}),
})

const createPostResult = (
	author: Pointer<typeof pointerRuntimeUser>,
): Readonly<Record<string, unknown>> => ({
	author,
	id: '0198a43e-2431-7000-8000-000000000400',
	title: 'Runtime pointers',
})

/** Verifies that both monotonic scopes reach an adapter without relying on order. */
const expectTargetRowFilter = (
	filter: DatabaseRowFilterNode | undefined,
	id: string,
): void => {
	if (filter?.kind !== 'and' || !('expressions' in filter)) {
		throw new TypeError('Pointer target row filter must be a logical AND')
	}

	expect(filter.expressions).toContainEqual({
		field: 'id',
		kind: 'equal',
		value: id,
	})
	expect(filter.expressions).toContainEqual({
		field: 'status',
		kind: 'equal',
		value: 'active',
	})
}

describe('pointer Runtime execution', () => {
	it('loads selected and nested targets through private Access scopes', async () => {
		const author = pointerRuntimeUser.pointer(
			'0198a43e-2431-7000-8000-000000000401',
		)
		const organization = pointerRuntimeOrganization.pointer(
			'0198a43e-2431-7000-8000-000000000402',
		)
		const post = createPostResult(author)
		const includedAuthor = { id: author.id, name: 'Ada', organization }
		const includedOrganization = {
			id: organization.id,
			name: 'Ultima Labs',
		}
		const adapter = new RecordingDatabaseAdapter(
			[
				{
					inclusions: [
						{
							fieldPath: ['author'],
							record: post,
							target: includedAuthor,
						},
						{
							fieldPath: ['organization'],
							record: includedAuthor,
							target: includedOrganization,
						},
					],
					status: 'fulfilled',
					value: [post],
				},
				{ status: 'fulfilled', value: { id: author.id, name: 'Ada' } },
			],
			[],
		)
		const ultimabase = new UltimaBase({
			plugins: [createDatabasePlugin(adapter)],
			schemas: [
				pointerRuntimeOrganization,
				pointerRuntimeUser,
				pointerRuntimePost,
			],
		})

		try {
			await ultimabase.start()
			const posts = await pointerRuntimePost.findMany(
				{
					select: { title: true },
					include: {
						author: {
							select: { name: true },
							include: {
								organization: { select: { name: true } },
							},
						},
					},
				},
				{ ultimabase },
			)
			const directAuthor = await author.findOne(
				{ select: { name: true } },
				{ ultimabase },
			)

			const includedAuthor: unknown = posts[0]?.author
			expect(includedAuthor).toBeInstanceOf(pointerRuntimeUser)
			if (!(includedAuthor instanceof pointerRuntimeUser)) {
				throw new TypeError('Expected an included user model')
			}
			expect(includedAuthor.name).toBe('Ada')
			const includedOrganization: unknown = includedAuthor.organization
			expect(includedOrganization).toBeInstanceOf(pointerRuntimeOrganization)
			if (!(includedOrganization instanceof pointerRuntimeOrganization)) {
				throw new TypeError('Expected an included organization model')
			}
			expect(includedOrganization.name).toBe('Ultima Labs')
			expect(directAuthor?.name).toBe('Ada')
			expect(adapter.rootRequests).toHaveLength(2)
			expect(
				adapter.rootRequests[0]?.inclusions?.[0]?.request.operation,
			).toMatchObject({
				kind: 'find-one',
				query: {
					selection: {
						fields: [
							{ field: 'name' },
							{ field: 'id' },
							{ field: 'organization' },
						],
					},
				},
			})
			expect(
				adapter.rootRequests[0]?.inclusions?.[0]?.request.rowFilter,
			).toMatchObject({
				field: 'status',
				kind: 'equal',
				value: 'active',
			})
			expect(adapter.rootRequests[1]?.operation).toMatchObject({
				kind: 'find-one',
				query: {
					where: undefined,
				},
			})
			expectTargetRowFilter(adapter.rootRequests[1]?.rowFilter, author.id)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('does not load a source pointer hidden by field Access', async () => {
		const target = Schema.define({
			className: 'PointerRuntimeHiddenTarget',
			fields: (field) => ({ name: field.string() }),
		})
		const source = Schema.define({
			className: 'PointerRuntimeHiddenSource',
			fields: (field) => ({
				target: field.pointer({
					access: {
						read: { orderBy: true, output: () => false, where: true },
					},
					target: 'PointerRuntimeHiddenTarget',
				}),
			}),
		})
		const pointer = target.pointer('0198a43e-2431-7000-8000-000000000403')
		const adapter = new RecordingDatabaseAdapter(
			[
				{
					status: 'fulfilled',
					value: [
						{
							id: '0198a43e-2431-7000-8000-000000000413',
							target: pointer,
						},
					],
				},
			],
			[],
		)
		const ultimabase = new UltimaBase({
			plugins: [createDatabasePlugin(adapter)],
			schemas: [target, source],
		})

		try {
			await ultimabase.start()
			const result = await source.findMany(
				{
					select: { target: true },
					include: { target: { select: { name: true } } },
				},
				{ ultimabase },
			)

			expect(result[0]).not.toHaveProperty('target')
			expect(adapter.rootRequests).toHaveLength(1)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('keeps the declared Pointer value for final field Access after hydration', async () => {
		const accessValues: unknown[] = []
		const target = Schema.define({
			className: 'PointerRuntimeAccessTarget',
			fields: (field) => ({ name: field.string() }),
		})
		const source = Schema.define({
			className: 'PointerRuntimeAccessSource',
			fields: (field) => ({
				target: field.pointer({
					access: {
						read: {
							orderBy: true,
							output: ({ value }) => {
								accessValues.push(value)
								return true
							},
							where: true,
						},
					},
					target: 'PointerRuntimeAccessTarget',
				}),
			}),
		})
		const pointer = target.pointer('0198a43e-2431-7000-8000-000000000408')
		const sourceRecord = {
			id: '0198a43e-2431-7000-8000-000000000414',
			target: pointer,
		}
		const adapter = new RecordingDatabaseAdapter(
			[
				{
					inclusions: [
						{
							fieldPath: ['target'],
							record: sourceRecord,
							target: { id: pointer.id, name: 'Hydrated target' },
						},
					],
					status: 'fulfilled',
					value: [sourceRecord],
				},
			],
			[],
		)
		const ultimabase = new UltimaBase({
			plugins: [createDatabasePlugin(adapter)],
			schemas: [target, source],
		})

		try {
			await ultimabase.start()
			const result = await source.findMany(
				{
					select: { target: true },
					include: { target: { select: { name: true } } },
				},
				{ ultimabase },
			)

			const includedTarget: unknown = result[0]?.target
			if (!(includedTarget instanceof target)) {
				throw new TypeError('Expected the target model to be hydrated')
			}
			expect(includedTarget.name).toBe('Hydrated target')
			expect(accessValues).toHaveLength(2)
			expect(accessValues.every((value) => Pointer.is(value))).toBe(true)
			expect(accessValues).toStrictEqual([pointer, pointer])
		} finally {
			await ultimabase.dispose()
		}
	})

	it('makes denied and missing targets equally null while preserving master access', async () => {
		const restrictedTarget = Schema.define({
			className: 'PointerRuntimeRestrictedTarget',
			fields: (field) => ({ name: field.string() }),
			access: {
				read: ({ context }) => context.access.mode === 'master',
			},
		})
		const restrictedSource = Schema.define({
			className: 'PointerRuntimeRestrictedSource',
			fields: (field) => ({
				target: field.pointer({
					target: 'PointerRuntimeRestrictedTarget',
				}),
			}),
		})
		const targetPointer = restrictedTarget.pointer(
			'0198a43e-2431-7000-8000-000000000404',
		)
		const sourceResult = {
			id: '0198a43e-2431-7000-8000-000000000415',
			target: targetPointer,
		}
		const results: readonly QueuedAdapterResult[] = [
			{ status: 'fulfilled', value: [sourceResult] },
			{
				inclusions: [
					{
						fieldPath: ['target'],
						record: sourceResult,
						target: { id: targetPointer.id, name: 'Visible to master' },
					},
				],
				status: 'fulfilled',
				value: [sourceResult],
			},
			{
				inclusions: [
					{
						fieldPath: ['target'],
						record: sourceResult,
						target: null,
					},
				],
				status: 'fulfilled',
				value: [sourceResult],
			},
		]
		const adapter = new RecordingDatabaseAdapter(results, [])
		const ultimabase = new UltimaBase({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'pointer-master', value: 'pointer-secret' }],
				onUse: () => undefined,
			}),
			plugins: [createDatabasePlugin(adapter)],
			schemas: [restrictedTarget, restrictedSource],
		})
		const includedInput = {
			select: { target: true },
			include: { target: { select: { name: true } } },
		} as const

		try {
			await ultimabase.start()
			const denied = await restrictedSource.findMany(includedInput, {
				ultimabase,
			})
			const allowed = await restrictedSource.findMany(includedInput, {
				ultimabase,
				useMasterKey: true,
			})
			const missing = await restrictedSource.findMany(includedInput, {
				ultimabase,
				useMasterKey: true,
			})

			expect(denied[0]?.target).toBeNull()
			const allowedTarget: unknown = allowed[0]?.target
			if (!(allowedTarget instanceof restrictedTarget)) {
				throw new TypeError('Expected the restricted target for master access')
			}
			expect(allowedTarget.name).toBe('Visible to master')
			expect(missing[0]?.target).toBeNull()
			expect(denied[0]?.toJSON()).toStrictEqual(missing[0]?.toJSON())
			expect(adapter.rootRequests).toHaveLength(3)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('returns the hydrated parent pointer without a schema result transform', async () => {
		const target = Schema.define({
			className: 'PointerRuntimeAuthoritativeTarget',
			fields: (field) => ({ name: field.string() }),
		})
		const source = Schema.define({
			className: 'PointerRuntimeAuthoritativeSource',
			fields: (field) => ({
				target: field.pointer({ target: 'PointerRuntimeAuthoritativeTarget' }),
			}),
		})
		const pointer = target.pointer('0198a43e-2431-7000-8000-000000000407')
		const sourceRecord = {
			id: '0198a43e-2431-7000-8000-000000000416',
			target: pointer,
		}
		const adapter = new RecordingDatabaseAdapter(
			[
				{
					inclusions: [
						{
							fieldPath: ['target'],
							record: sourceRecord,
							target: {
								id: pointer.id,
								name: 'Hydrated before afterRead',
							},
						},
					],
					status: 'fulfilled',
					value: [sourceRecord],
				},
			],
			[],
		)
		const ultimabase = new UltimaBase({
			plugins: [createDatabasePlugin(adapter)],
			schemas: [target, source],
		})

		try {
			await ultimabase.start()
			const result = await source.findMany(
				{
					select: { target: true },
					include: { target: { select: { name: true } } },
				},
				{ ultimabase },
			)

			const includedTarget: unknown = result[0]?.target
			if (!(includedTarget instanceof target)) {
				throw new TypeError('Expected the authoritative target model')
			}
			expect(includedTarget.name).toBe('Hydrated before afterRead')
			expect(adapter.rootRequests).toHaveLength(1)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('returns an unloaded pointer from a complete mutation result', async () => {
		const failingTarget = Schema.define({
			className: 'PointerRuntimeFailingTarget',
			fields: (field) => ({ name: field.string() }),
		})
		const mutationSource = Schema.define({
			className: 'PointerRuntimeMutationSource',
			fields: (field) => ({
				target: field.pointer({ target: 'PointerRuntimeFailingTarget' }),
				title: field.string(),
			}),
		})
		const target = failingTarget.pointer('0198a43e-2431-7000-8000-000000000405')
		const current = {
			createdAt: '2026-08-03T20:00:00.000Z',
			id: '0198a43e-2431-7000-8000-000000000406',
			target,
			title: 'Updated',
			updatedAt: '2026-08-03T20:00:00.000Z',
		}
		const trace: string[] = []
		const adapter = new RecordingDatabaseAdapter(
			[
				{
					materializations: [
						{ current, kind: 'update', previous: { ...current, title: 'Old' } },
					],
					status: 'fulfilled',
					target: { ...current, title: 'Old' },
					value: current,
				},
			],
			trace,
		)
		const ultimabase = new UltimaBase({
			plugins: [createDatabasePlugin(adapter)],
			schemas: [failingTarget, mutationSource],
		})

		try {
			await ultimabase.start()
			const updated = await mutationSource.updateOne(
				{
					where: { id: { eq: current.id } },
					data: { title: 'Updated' },
				},
				{ ultimabase },
			)

			expect(updated?.target).toBe(target)

			if (!Pointer.is(updated?.target)) {
				throw new TypeError('Expected the complete mutation result pointer')
			}

			expect(updated.target.schema).toBe(failingTarget)
			expect(trace).toStrictEqual([
				'adapter:begin',
				'prepare:update-one',
				'execute:update-one',
				'adapter:commit',
			])
		} finally {
			await ultimabase.dispose()
		}
	})

	it('loads create and update inclusions by persisted id inside their transaction', async () => {
		const target = pointerRuntimeUser.pointer(
			'0198a43e-2431-7000-8000-000000000409',
		)
		const created = {
			author: target,
			createdAt: '2026-08-10T12:00:00.000Z',
			id: '0198a43e-2431-7000-8000-000000000410',
			title: 'Created with author',
			updatedAt: '2026-08-10T12:00:00.000Z',
		}
		const updated = { ...created, title: 'Updated with author' }
		const createdProjection = {
			author: target,
			id: created.id,
			title: created.title,
		}
		const updatedProjection = {
			author: target,
			id: updated.id,
			title: updated.title,
		}
		const trace: string[] = []
		const adapter = new RecordingDatabaseAdapter(
			[
				{
					materializations: [{ current: created, kind: 'create' }],
					status: 'fulfilled',
					value: createdProjection,
				},
				{
					inclusions: [
						{
							fieldPath: ['author'],
							record: createdProjection,
							target: { id: target.id, name: 'Ada' },
						},
					],
					status: 'fulfilled',
					value: createdProjection,
				},
				{
					materializations: [
						{ current: updated, kind: 'update', previous: created },
					],
					status: 'fulfilled',
					target: created,
					value: updatedProjection,
				},
				{
					inclusions: [
						{
							fieldPath: ['author'],
							record: updatedProjection,
							target: { id: target.id, name: 'Grace' },
						},
					],
					status: 'fulfilled',
					value: updatedProjection,
				},
			],
			trace,
		)
		const ultimabase = new UltimaBase({
			plugins: [createDatabasePlugin(adapter)],
			schemas: [
				pointerRuntimeOrganization,
				pointerRuntimeUser,
				pointerRuntimePost,
			],
		})
		const projection = {
			include: { author: { select: { name: true } } },
			select: { title: true },
		} as const

		try {
			await ultimabase.start()
			const createResult = await pointerRuntimePost.createOne(
				{ data: { author: target, title: created.title }, ...projection },
				{ ultimabase },
			)
			const updateResult = await pointerRuntimePost.updateOne(
				{
					data: { title: updated.title },
					where: { id: { eq: created.id } },
					...projection,
				},
				{ ultimabase },
			)

			expect(createResult.title).toBe(created.title)
			const createdAuthor: unknown = createResult.author
			expect(createdAuthor).toBeInstanceOf(pointerRuntimeUser)
			if (!(createdAuthor instanceof pointerRuntimeUser)) {
				throw new TypeError('Expected the created author model')
			}
			expect(createdAuthor.name).toBe('Ada')
			expect(updateResult?.title).toBe(updated.title)
			const updatedAuthor: unknown = updateResult?.author
			expect(updatedAuthor).toBeInstanceOf(pointerRuntimeUser)
			if (!(updatedAuthor instanceof pointerRuntimeUser)) {
				throw new TypeError('Expected the updated author model')
			}
			expect(updatedAuthor.name).toBe('Grace')
			expect(trace).toStrictEqual([
				'adapter:begin',
				'prepare:create-one',
				'execute:create-one',
				'execute:get',
				'adapter:commit',
				'adapter:begin',
				'prepare:update-one',
				'execute:update-one',
				'execute:get',
				'adapter:commit',
			])
			expect(adapter.rootRequests).toHaveLength(0)
			expect(adapter.transactions[0]?.requests[1]?.operation).toMatchObject({
				id: created.id,
				kind: 'get',
			})
			expect(adapter.transactions[1]?.requests[1]?.operation).toMatchObject({
				id: created.id,
				kind: 'get',
			})
		} finally {
			await ultimabase.dispose()
		}
	})

	it('keeps denied mutation targets null without replaying source lifecycle hooks', async () => {
		let beforeCreates = 0
		let afterCreates = 0
		const targetSchema = Schema.define({
			className: 'PointerRuntimeDeniedMutationTarget',
			fields: (field) => ({ name: field.string() }),
			access: { read: () => false },
		})
		const sourceSchema = Schema.define({
			className: 'PointerRuntimeDeniedMutationSource',
			fields: (field) => ({
				target: field.pointer({ target: 'PointerRuntimeDeniedMutationTarget' }),
				title: field.string(),
			}),
			hooks: {
				afterOperation: {
					create: () => {
						afterCreates += 1
					},
				},
				beforeOperation: {
					create: () => {
						beforeCreates += 1
					},
				},
			},
		})
		const target = targetSchema.pointer('0198a43e-2431-7000-8000-000000000411')
		const current = {
			createdAt: '2026-08-10T12:00:00.000Z',
			id: '0198a43e-2431-7000-8000-000000000412',
			target,
			title: 'Protected target',
			updatedAt: '2026-08-10T12:00:00.000Z',
		}
		const projection = { id: current.id, target, title: current.title }
		const trace: string[] = []
		const adapter = new RecordingDatabaseAdapter(
			[
				{
					materializations: [{ current, kind: 'create' }],
					status: 'fulfilled',
					value: projection,
				},
				{ status: 'fulfilled', value: projection },
			],
			trace,
		)
		const ultimabase = new UltimaBase({
			plugins: [createDatabasePlugin(adapter)],
			schemas: [targetSchema, sourceSchema],
		})

		try {
			await ultimabase.start()
			const result = await sourceSchema.createOne(
				{
					data: { target, title: current.title },
					include: { target: { select: { name: true } } },
					select: { title: true },
				},
				{ ultimabase },
			)

			expect(result.target).toBeNull()
			expect(beforeCreates).toBe(1)
			expect(afterCreates).toBe(1)
			expect(trace).toStrictEqual([
				'adapter:begin',
				'prepare:create-one',
				'execute:create-one',
				'execute:get',
				'adapter:commit',
			])
		} finally {
			await ultimabase.dispose()
		}
	})

	it('rejects pointer schemas when the adapter omits the versioned capability', async () => {
		const adapter = new RecordingDatabaseAdapter([], [])

		Object.defineProperty(adapter, 'capabilities', { value: undefined })
		const ultimabase = new UltimaBase({
			plugins: [createDatabasePlugin(adapter)],
			schemas: [
				pointerRuntimeOrganization,
				pointerRuntimeUser,
				pointerRuntimePost,
			],
		})

		await expect(ultimabase.start()).rejects.toThrow(
			new TypeError(
				'database adapter must implement pointer capability version 1',
			),
		)
		await ultimabase.dispose()
	})
})
