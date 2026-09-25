import { applicationFixture } from '../../tests/application-fixture.js'
import { describe, expect, it, vi } from 'vitest'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { plugin as createPlugin } from '../plugins/plugin.js'
import {
	contributeDeclarations,
	contributeApplication,
	withPluginPrivileges,
} from '../plugins/plugin-contributions.js'
import { contributeOperation } from '../plugins/plugin-operation-contributions.js'

import {
	defineOperation,
	defineOperationValue,
} from '../plugins/plugin-operations.js'
import { UltimaBase } from '../runtime/application/ultima-base.js'
import {
	databaseAdapterCapability,
	type DatabaseAdapter,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
	type PreparedDatabaseOperation,
	databasePersistencePlanCapability,
} from '../runtime/database/contracts.js'
import { provideCapability } from '../plugins/capabilities.js'
import { stringField } from '../schema/fields/builtins/string.js'
import { uuidField } from '../schema/fields/builtins/uuid.js'
import { FrameworkError } from '../errors/framework-error.js'
import { QueryBuilder, type CreateOneOperationAst } from '../query/index.js'
import { Schema } from '../schema/schema/definition.js'

import { createPreparedOperationFixture } from '../../tests/runtime/fixtures/recording-database-adapter.js'
import type { PrivateCollectionHandle } from './contracts.js'
import type {
	PrivateStorageAdapterCollection,
	PrivateStorageOperationRequest,
} from './adapter.js'
import { registerPrivateStorageAdapter } from './adapter.js'
import { definePrivateCollection } from './definition.js'
import { privateStore } from './runtime.js'

type StoredRows = Map<
	PrivateStorageAdapterCollection,
	Readonly<Record<string, unknown>>[]
>

const copyRows = (source: StoredRows): StoredRows =>
	new Map(
		[...source].map(([collection, rows]) => [
			collection,
			rows.map((row) => immutableRecord(row)),
		]),
	)

const matches = (
	record: Readonly<Record<string, unknown>>,
	where: Readonly<Record<string, unknown>>,
): boolean =>
	Object.entries(where).every(([name, value]) => Object.is(record[name], value))

const executeMemoryRequest = (
	rows: StoredRows,
	request: PrivateStorageOperationRequest,
): Readonly<Record<string, unknown>> | null => {
	const records = rows.get(request.collection)
	if (records === undefined)
		throw new TypeError('Private collection is not configured')
	const index =
		request.where === undefined
			? -1
			: records.findIndex((record) => matches(record, request.where ?? {}))
	switch (request.kind) {
		case 'find-unique':
			return index < 0 ? null : (records[index] ?? null)
		case 'insert': {
			const record = immutableRecord(request.data ?? {})
			for (const unique of request.collection.indexes) {
				if (
					records.some((candidate) =>
						unique.fields.every((name) =>
							Object.is(candidate[name], record[name]),
						),
					)
				) {
					throw new FrameworkError('VALIDATION_ERROR', 'Unique conflict')
				}
			}
			records.push(record)
			return record
		}
		case 'update':
		case 'compare-and-swap': {
			if (index < 0) return null
			const current = records[index]
			if (current === undefined) return null
			if (
				request.kind === 'compare-and-swap' &&
				!matches(current, request.expected ?? {})
			) {
				return null
			}
			const next = immutableRecord({ ...current, ...request.data })
			records[index] = next
			return next
		}
		case 'delete': {
			if (index < 0) return null
			return records.splice(index, 1)[0] ?? null
		}
	}
}

class MemoryTransaction implements DatabaseTransactionAdapter {
	readonly kind = 'database-transaction-adapter' as const
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}
	readonly #rows: StoredRows
	readonly #publicRows: Readonly<Record<string, unknown>>[]
	privateRequests = 0
	publicRequests = 0
	constructor(
		private readonly parent: MemoryPrivateAdapter,
		rows: StoredRows,
		publicRows: readonly Readonly<Record<string, unknown>>[],
	) {
		this.#rows = copyRows(rows)
		this.#publicRows = publicRows.map((row) => immutableRecord(row))
		registerPrivateStorageAdapter(
			this,
			immutableRecord({
				executePrivateStorage: (request) => {
					this.privateRequests += 1
					return Promise.resolve(executeMemoryRequest(this.#rows, request))
				},
			}),
		)
	}
	execute<const TOperation extends DatabaseOperationAst>(): Promise<
		DatabaseOperationResult<TOperation>
	> {
		throw new TypeError('Public execution is not used by this fixture')
	}
	prepare<const TOperation extends DatabaseMutationOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<PreparedDatabaseOperation<TOperation>> {
		if (request.operation.kind !== 'create-one') {
			throw new TypeError('Only create-one is supported by this fixture')
		}
		const input: unknown = Reflect.get(request.operation, 'input')
		if (!isPlainRecord(input))
			throw new TypeError('Create input is unavailable')
		const current = immutableRecord({
			...input,
			createdAt: '2026-09-06T00:00:00.000Z',
			id: `0198c000-0000-7000-8000-${String(this.#publicRows.length + 1).padStart(12, '0')}`,
			updatedAt: '2026-09-06T00:00:00.000Z',
		})
		return Promise.resolve(
			createPreparedOperationFixture({
				execute: () => {
					this.publicRequests += 1
					this.#publicRows.push(current)
					return Promise.resolve(current) as unknown as Promise<
						DatabaseOperationResult<TOperation>
					>
				},
				materializations: [{ current, kind: 'create' }] as never,
			}),
		)
	}
	commit(): Promise<void> {
		this.parent.replace(this.#rows, this.#publicRows)
		return Promise.resolve()
	}
	rollback(): Promise<void> {
		return Promise.resolve()
	}
}

class MemoryPrivateAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}
	readonly configured: PrivateStorageAdapterCollection[] = []
	readonly transactions: MemoryTransaction[] = []
	rootPrivateRequests = 0
	#rows: StoredRows = new Map()
	#publicRows: Readonly<Record<string, unknown>>[] = []
	constructor() {
		registerPrivateStorageAdapter(
			this,
			immutableRecord({
				configurePrivateStorage: (
					collections: readonly PrivateStorageAdapterCollection[],
				) => {
					this.configured.push(...collections)
					this.#rows = new Map(
						collections.map((collection) => [collection, []]),
					)
				},
				executePrivateStorage: (request: PrivateStorageOperationRequest) => {
					this.rootPrivateRequests += 1
					return Promise.resolve(executeMemoryRequest(this.#rows, request))
				},
			}),
		)
	}
	replace(
		rows: StoredRows,
		publicRows: readonly Readonly<Record<string, unknown>>[],
	): void {
		this.#rows = copyRows(rows)
		this.#publicRows = publicRows.map((row) => immutableRecord(row))
	}
	get publicRowCount(): number {
		return this.#publicRows.length
	}
	execute<const TOperation extends DatabaseOperationAst>(): Promise<
		DatabaseOperationResult<TOperation>
	> {
		throw new TypeError('Public execution is not used by this fixture')
	}
	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		const transaction = new MemoryTransaction(
			this,
			this.#rows,
			this.#publicRows,
		)
		this.transactions.push(transaction)
		return Promise.resolve(transaction)
	}
}

const PublicRecord = Schema.define({
	className: 'PrivateStoragePublicRecord',
	fields: (field) => ({ title: field.string({ required: true }) }),
})

const publicCreateOperation = (title: string) =>
	({
		input: { title },
		kind: 'create-one' as const,
		selection: { fields: [], kind: 'selection' as const },
		schema: new QueryBuilder(PublicRecord).ast.schema,
	}) satisfies CreateOneOperationAst<typeof PublicRecord>

const collection = definePrivateCollection({
	contributionId: 'credentials',
	fields: {
		id: uuidField({ immutable: true, required: true }),
		secret: stringField({ required: true }),
		version: stringField({ required: true }),
	},
	indexes: [{ fields: ['id'] }, { fields: ['secret'] }],
})

const actionValue = defineOperationValue((value) => {
	if (!isPlainRecord(value) || typeof value.action !== 'string') {
		throw new TypeError('action is required')
	}
	return immutableRecord({ action: value.action })
})
const resultValue = defineOperationValue((value) => {
	if (typeof value !== 'string') throw new TypeError('result must be a string')
	return value
})
const privateOperation = defineOperation({
	input: actionValue,
	name: 'fixture.private-storage.execute',
	result: resultValue,
	target: 'application',
	transaction: 'required',
	version: '1.0.0',
})
const optionalPrivateOperation = defineOperation({
	input: actionValue,
	name: 'fixture.private-storage.optional',
	result: resultValue,
	target: 'application',
	transaction: 'optional',
	version: '1.0.0',
})

let retainedStore: PrivateCollectionHandle<typeof collection> | undefined

const createFixture = async () => {
	const adapter = new MemoryPrivateAdapter()
	const handler: Parameters<
		typeof contributeOperation<typeof privateOperation>
	>[0]['execute'] = async ({ engine, input }) => {
		const store = privateStore(collection)
		switch (input.action) {
			case 'insert':
				await store.insert({
					data: {
						id: '0198c000-0000-7000-8000-000000000001',
						secret: 'digest-a',
						version: '1',
					},
				})
				return 'inserted'
			case 'read':
				return (
					(await store.findUnique({ where: { secret: 'digest-a' } }))
						?.version ?? 'missing'
				)
			case 'swap':
				return (
					(
						await store.compareAndSwap({
							data: { version: '2' },
							expected: { version: '1' },
							where: { secret: 'digest-a' },
						})
					)?.version ?? 'conflict'
				)
			case 'update':
				return (
					(
						await store.update({
							data: { version: '3' },
							where: { secret: 'digest-a' },
						})
					)?.version ?? 'missing'
				)
			case 'delete':
				return (await store.delete({ where: { secret: 'digest-a' } })) === null
					? 'missing'
					: 'deleted'
			case 'rollback':
				await store.insert({
					data: {
						id: '0198c000-0000-7000-8000-000000000002',
						secret: 'digest-b',
						version: '1',
					},
				})
				throw new Error('rollback')
			case 'read-b':
				return (await store.findUnique({ where: { secret: 'digest-b' } })) ===
					null
					? 'missing'
					: 'present'
			case 'atomic':
				await engine.execute(publicCreateOperation('committed'))
				await store.insert({
					data: {
						id: '0198c000-0000-7000-8000-000000000003',
						secret: 'digest-c',
						version: '1',
					},
				})
				return 'atomic'
			case 'atomic-rollback':
				await engine.execute(publicCreateOperation('rolled-back'))
				await store.insert({
					data: {
						id: '0198c000-0000-7000-8000-000000000004',
						secret: 'digest-d',
						version: '1',
					},
				})
				throw new Error('atomic rollback')
			case 'capture':
				retainedStore = store
				return 'captured'
			case 'use-retained':
				return (
					(await retainedStore?.findUnique({ where: { secret: 'digest-a' } }))
						?.version ?? 'missing'
				)
			case 'forge':
				privateStore({ kind: 'private-collection' } as never)
				return 'forged'
			default:
				return 'unknown'
		}
	}
	const optionalHandler: Parameters<
		typeof contributeOperation<typeof optionalPrivateOperation>
	>[0]['execute'] = async ({ input }) => {
		const store = privateStore(collection)
		if (input.action === 'read-root') {
			return (await store.findUnique({
				where: { secret: 'digest-auto' },
			})) === null
				? 'missing'
				: 'present'
		}
		if (input.action === 'insert-auto') {
			await store.insert({
				data: {
					id: '0198c000-0000-7000-8000-000000000005',
					secret: 'digest-auto',
					version: '1',
				},
			})
			return 'inserted'
		}
		return 'unknown'
	}
	const plugin = createPlugin({
		core: '^0.0.0',
		id: 'fixture.private-storage',
		permissions: {
			'operation:declare': 'Declares the fixture operation.',
			'storage:private': 'Stores fixture private records.',
		},
		version: '1.0.0',
		contributions: [
			contributeOperation({ operation: privateOperation, execute: handler }),
			contributeOperation({
				operation: optionalPrivateOperation,
				execute: optionalHandler,
			}),
			contributeDeclarations({
				privateStorage: ({ privateStorage }) => {
					privateStorage.register(collection)
					return undefined
				},
			}),
		],
	})
	const database = createPlugin({
		core: '^0.0.0',
		id: 'fixture.private-database',
		version: '1.0.0',
		contributions: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database',
				create: () => ({ value: adapter }),
			}),
		],
	})
	const ultimabase = applicationFixture(
		new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [database, plugin],
			schemas: [PublicRecord],
		}),
	)
	await ultimabase.start()
	return { adapter, ultimabase }
}

describe('owner-private plugin storage', () => {
	it('executes unique reads, mutations, CAS, and rollback on the shared transaction', async () => {
		const { adapter, ultimabase } = await createFixture()
		expect(adapter.configured).toHaveLength(1)
		expect(adapter).not.toHaveProperty('privateStorage')
		expect(
			await ultimabase
				.operation(privateOperation)
				.execute({ action: 'insert' }),
		).toBe('inserted')
		expect(
			await ultimabase.operation(privateOperation).execute({ action: 'read' }),
		).toBe('1')
		expect(
			await ultimabase.operation(privateOperation).execute({ action: 'swap' }),
		).toBe('2')
		expect(
			await ultimabase.operation(privateOperation).execute({ action: 'swap' }),
		).toBe('conflict')
		expect(
			await ultimabase
				.operation(privateOperation)
				.execute({ action: 'update' }),
		).toBe('3')
		expect(
			await ultimabase
				.operation(privateOperation)
				.execute({ action: 'delete' }),
		).toBe('deleted')
		expect(
			await ultimabase.operation(privateOperation).execute({ action: 'read' }),
		).toBe('missing')
		await expect(
			ultimabase.operation(privateOperation).execute({ action: 'rollback' }),
		).rejects.toThrow('handler failed')
		expect(
			await ultimabase
				.operation(privateOperation)
				.execute({ action: 'read-b' }),
		).toBe('missing')
		await ultimabase.dispose()
	})

	it('commits and rolls back public and private mutations on the same adapter transaction', async () => {
		const { adapter, ultimabase } = await createFixture()
		expect(
			await ultimabase
				.operation(privateOperation)
				.execute({ action: 'atomic' }),
		).toBe('atomic')
		const committed = adapter.transactions.at(-1)
		expect(committed).toMatchObject({ privateRequests: 1, publicRequests: 1 })
		expect(adapter.publicRowCount).toBe(1)

		await expect(
			ultimabase
				.operation(privateOperation)
				.execute({ action: 'atomic-rollback' }),
		).rejects.toThrow('handler failed')
		const rolledBack = adapter.transactions.at(-1)
		expect(rolledBack).toMatchObject({ privateRequests: 1, publicRequests: 1 })
		expect(adapter.publicRowCount).toBe(1)
		await ultimabase.dispose()
	})

	it('keeps reads on the root request and gives standalone mutations one transaction', async () => {
		const { adapter, ultimabase } = await createFixture()
		expect(
			await ultimabase
				.operation(optionalPrivateOperation)
				.execute({ action: 'read-root' }),
		).toBe('missing')
		expect(adapter.rootPrivateRequests).toBe(1)
		expect(adapter.transactions).toHaveLength(0)

		expect(
			await ultimabase
				.operation(optionalPrivateOperation)
				.execute({ action: 'insert-auto' }),
		).toBe('inserted')
		expect(adapter.transactions).toHaveLength(1)
		expect(adapter.transactions[0]).toMatchObject({
			privateRequests: 1,
			publicRequests: 0,
		})
		await ultimabase.dispose()
	})

	it('rejects forged tokens and retained handles crossing application boundaries', async () => {
		retainedStore = undefined
		const first = await createFixture()
		expect(
			await first.ultimabase
				.operation(privateOperation)
				.execute({ action: 'capture' }),
		).toBe('captured')
		await first.ultimabase.dispose()
		const second = await createFixture()
		await expect(
			second.ultimabase
				.operation(privateOperation)
				.execute({ action: 'use-retained' }),
		).rejects.toMatchObject({
			code: 'PLUGIN_PRIVILEGE_DENIED',
			internalDetails: { kind: 'private-storage-handle-owner-mismatch' },
		})
		await expect(
			second.ultimabase
				.operation(privateOperation)
				.execute({ action: 'forge' }),
		).rejects.toMatchObject({ code: 'PLUGIN_PRIVILEGE_DENIED' })
		await first.ultimabase.dispose()
		await second.ultimabase.dispose()
	})

	it('rejects handles outside attributed request callbacks', () => {
		expect(() => privateStore(collection)).toThrow(
			expect.objectContaining({ code: 'PLUGIN_PRIVILEGE_DENIED' }),
		)
	})

	it('denies the critical privilege before adapter configuration', () => {
		const declarationEffect = vi.fn()
		const adapterEffect = vi.fn()
		const setupEffect = vi.fn()
		const plugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.private-storage-denied',
			permissions: { 'storage:private': 'Tests denial.' },
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					privateStorage: ({ privateStorage }) => {
						declarationEffect()
						privateStorage.register(collection)
						return undefined
					},
				}),
				withPluginPrivileges(
					contributeApplication((context) => {
						setupEffect()
						const exports = undefined
						const lifecycleContext = { ...context, pluginExports: exports }
						void lifecycleContext
						return { exports }
					}),
					['storage:private'],
				),
			],
		})
		const database = createPlugin({
			core: '^0.0.0',
			id: 'fixture.denied-private-database',
			version: '1.0.0',
			contributions: [
				provideCapability(databaseAdapterCapability, {
					contributionId: 'database',
					create: () => {
						adapterEffect()
						return { value: new MemoryPrivateAdapter() }
					},
				}),
			],
		})
		expect(() =>
			applicationFixture(
				new UltimaBase({
					pluginPrivileges: { deny: ['storage:private'], logger: false },
					plugins: [database, plugin],
					schemas: [],
				}),
			),
		).toThrow(expect.objectContaining({ code: 'PLUGIN_PRIVILEGE_DENIED' }))
		expect(declarationEffect).not.toHaveBeenCalled()
		expect(adapterEffect).not.toHaveBeenCalled()
		expect(setupEffect).not.toHaveBeenCalled()
	})

	it('keeps applications without private declarations compatible with older adapters', async () => {
		const adapter = new MemoryPrivateAdapter()
		const database = createPlugin({
			core: '^0.0.0',
			id: 'fixture.private-zero-database',
			version: '1.0.0',
			contributions: [
				provideCapability(databaseAdapterCapability, {
					contributionId: 'database',
					create: () => ({ value: adapter }),
				}),
			],
		})
		const ultimabase = applicationFixture(
			new UltimaBase({
				pluginPrivileges: { logger: false },
				plugins: [database],
				schemas: [],
			}),
		)
		await ultimabase.start()
		expect(adapter.configured).toHaveLength(0)
		await ultimabase.dispose()
	})
})
