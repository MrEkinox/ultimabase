import { definePlugin } from '../../foundation.js'
import {
	pointerField,
	Schema,
	stringField,
	type Pointer,
} from '../../schema/index.js'
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
	fields: { name: stringField({ validation: { required: true } }) },
})

const targetHookTrace: string[] = []
const pointerRuntimeUser = Schema.define({
	className: 'PointerRuntimeUser',
	access: {
		filter: {
			read: ({ filter }) => filter.equalTo('status', 'active'),
		},
	},
	fields: {
		name: stringField({ validation: { required: true } }),
		organization: pointerField({
			target: () => pointerRuntimeOrganization,
		}),
		status: stringField({ validation: { required: true } }),
	},
	hooks: {
		afterFind: ({ result }) => {
			targetHookTrace.push('user:afterFind')

			return result
		},
		beforeFind: ({ query }) => {
			targetHookTrace.push('user:beforeFind')

			// Replacing the visible predicate cannot remove the private pointer identity.
			return query.equalTo('name', 'Ada')
		},
	},
})

const pointerRuntimePost = Schema.define({
	className: 'PointerRuntimePost',
	fields: {
		author: pointerField({
			target: () => pointerRuntimeUser,
			validation: { required: true },
		}),
		title: stringField({ validation: { required: true } }),
	},
})

const createPostResult = (
	author: Pointer<typeof pointerRuntimeUser>,
): Readonly<Record<string, unknown>> => ({ author, title: 'Runtime pointers' })

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
	it('loads selected and nested targets through private Access and hook scopes', async () => {
		targetHookTrace.length = 0
		const author = pointerRuntimeUser.pointer(
			'0198a43e-2431-7000-8000-000000000401',
		)
		const organization = pointerRuntimeOrganization.pointer(
			'0198a43e-2431-7000-8000-000000000402',
		)
		const adapter = new RecordingDatabaseAdapter(
			[
				{ status: 'fulfilled', value: [createPostResult(author)] },
				{
					status: 'fulfilled',
					value: { name: 'Ada', organization },
				},
				{ status: 'fulfilled', value: { name: 'Ultima Labs' } },
				{ status: 'fulfilled', value: { name: 'Ada' } },
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
			const posts = await pointerRuntimePost
				.query()
				.select('title')
				.include('author', (query) =>
					query
						.select('name')
						.include('organization', (organizationQuery) =>
							organizationQuery.select('name'),
						),
				)
				.find({ ultimabase })
			const directAuthor = await author
				.query()
				.select('name')
				.first({ ultimabase })

			expect(posts[0]?.author).toBeInstanceOf(pointerRuntimeUser)
			expect(posts[0]?.author?.name).toBe('Ada')
			expect(posts[0]?.author?.organization).toBeInstanceOf(
				pointerRuntimeOrganization,
			)
			expect(posts[0]?.author?.organization?.name).toBe('Ultima Labs')
			expect(directAuthor?.name).toBe('Ada')
			expect(targetHookTrace).toStrictEqual([
				'user:beforeFind',
				'user:afterFind',
				'user:beforeFind',
				'user:afterFind',
			])
			expect(adapter.rootRequests).toHaveLength(4)
			expect(adapter.rootRequests[1]?.operation).toMatchObject({
				kind: 'first',
				query: {
					selection: {
						fields: [{ field: 'name' }, { field: 'organization' }],
					},
					where: {
						expression: { field: 'name', kind: 'equal', value: 'Ada' },
					},
				},
			})
			expectTargetRowFilter(adapter.rootRequests[1]?.rowFilter, author.id)
			expect(adapter.rootRequests[2]?.rowFilter).toMatchObject({
				field: 'id',
				kind: 'equal',
				value: organization.id,
			})
			expect(adapter.rootRequests[3]?.operation).toMatchObject({
				kind: 'first',
				query: {
					where: {
						expression: { field: 'name', kind: 'equal', value: 'Ada' },
					},
				},
			})
			expectTargetRowFilter(adapter.rootRequests[3]?.rowFilter, author.id)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('does not load a source pointer hidden by field Access', async () => {
		const target = Schema.define({
			className: 'PointerRuntimeHiddenTarget',
			fields: { name: stringField() },
		})
		const source = Schema.define({
			className: 'PointerRuntimeHiddenSource',
			fields: {
				target: pointerField({
					access: {
						read: { filter: true, item: () => false, order: true },
					},
					target: () => target,
				}),
			},
		})
		const pointer = target.pointer('0198a43e-2431-7000-8000-000000000403')
		const adapter = new RecordingDatabaseAdapter(
			[{ status: 'fulfilled', value: [{ target: pointer }] }],
			[],
		)
		const ultimabase = new UltimaBase({
			plugins: [createDatabasePlugin(adapter)],
			schemas: [target, source],
		})

		try {
			await ultimabase.start()
			const result = await source
				.query()
				.select('target')
				.include('target', (query) => query.select('name'))
				.find({ ultimabase })

			expect(result[0]).not.toHaveProperty('target')
			expect(adapter.rootRequests).toHaveLength(1)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('makes denied and missing targets equally null while preserving master access', async () => {
		const restrictedTarget = Schema.define({
			className: 'PointerRuntimeRestrictedTarget',
			access: {
				operation: {
					read: ({ context }) => context.access.mode === 'master',
				},
			},
			fields: { name: stringField() },
		})
		const restrictedSource = Schema.define({
			className: 'PointerRuntimeRestrictedSource',
			fields: {
				target: pointerField({ target: () => restrictedTarget }),
			},
		})
		const targetPointer = restrictedTarget.pointer(
			'0198a43e-2431-7000-8000-000000000404',
		)
		const sourceResult = { target: targetPointer }
		const results: readonly QueuedAdapterResult[] = [
			{ status: 'fulfilled', value: [sourceResult] },
			{ status: 'fulfilled', value: [sourceResult] },
			{ status: 'fulfilled', value: { name: 'Visible to master' } },
			{ status: 'fulfilled', value: [sourceResult] },
			{ status: 'fulfilled', value: null },
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
		const includedQuery = restrictedSource
			.query()
			.select('target')
			.include('target', (query) => query.select('name'))

		try {
			await ultimabase.start()
			const denied = await includedQuery.find({ ultimabase })
			const allowed = await includedQuery.find({
				ultimabase,
				useMasterKey: true,
			})
			const missing = await includedQuery.find({
				ultimabase,
				useMasterKey: true,
			})

			expect(denied[0]?.target).toBeNull()
			expect(allowed[0]?.target?.name).toBe('Visible to master')
			expect(missing[0]?.target).toBeNull()
			expect(denied[0]?.toJSON()).toStrictEqual(missing[0]?.toJSON())
			expect(adapter.rootRequests).toHaveLength(5)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('returns an unloaded pointer from a complete mutation result', async () => {
		const failingTarget = Schema.define({
			className: 'PointerRuntimeFailingTarget',
			fields: { name: stringField() },
			hooks: {
				afterFind: () => {
					throw new TypeError('Mutation results must not load pointer targets')
				},
			},
		})
		const mutationSource = Schema.define({
			className: 'PointerRuntimeMutationSource',
			fields: {
				target: pointerField({ target: () => failingTarget }),
				title: stringField(),
			},
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
					where: (where) => where.equalTo('id', current.id),
					data: { title: 'Updated' },
				},
				{ ultimabase },
			)

			expect(updated?.target).toBe(target)

			if (updated?.target === undefined || updated.target === null) {
				throw new TypeError('Expected the complete mutation result pointer')
			}

			expect(updated.target.query().ast.schema.definition).toBe(failingTarget)
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
