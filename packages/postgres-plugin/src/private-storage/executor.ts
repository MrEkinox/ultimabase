import { FrameworkError } from '@ultimabase/core'
import type { PrivateStorageOperationRequest } from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'
import { and, eq, isNull, type SQL } from 'drizzle-orm'

import { readPostgresDriverCode } from '../connection/driver-error.js'
import type { PostgresDrizzleClient } from '../drizzle/client.js'
import type {
	CompiledPostgresPrivateCollection,
	PostgresPrivateStorageCatalog,
	PrivatePostgresSelection,
} from './contracts.js'

const selection = (
	collection: CompiledPostgresPrivateCollection,
): PrivatePostgresSelection =>
	immutableRecord(
		Object.fromEntries(
			Object.entries(collection.fields).map(([name, field]) => [
				name,
				field.column,
			]),
		),
	)

const predicate = (
	collection: CompiledPostgresPrivateCollection,
	values: Readonly<Record<string, unknown>>,
): SQL | undefined =>
	and(
		...Object.entries(values).map(([name, value]) => {
			const field = collection.fields[name]
			if (field === undefined)
				throw new TypeError(`PostgreSQL private field is unavailable: ${name}`)
			return value === null ? isNull(field.column) : eq(field.column, value)
		}),
	)

const execute = async (
	client: PostgresDrizzleClient,
	collection: CompiledPostgresPrivateCollection,
	request: PrivateStorageOperationRequest,
): Promise<Readonly<Record<string, unknown>> | null> => {
	const returning = selection(collection)
	switch (request.kind) {
		case 'find-unique': {
			const [row] = await client
				.select(returning)
				.from(collection.table)
				.where(predicate(collection, request.where))
				.limit(1)
			return row === undefined ? null : immutableRecord(row)
		}
		case 'insert': {
			const [row] = await client
				.insert(collection.table)
				.values(request.data)
				.returning(returning)
			if (row === undefined)
				throw new TypeError('PostgreSQL private insert returned no row')
			return immutableRecord(row)
		}
		case 'update': {
			const [row] = await client
				.update(collection.table)
				.set(request.data)
				.where(predicate(collection, request.where))
				.returning(returning)
			return row === undefined ? null : immutableRecord(row)
		}
		case 'delete': {
			const [row] = await client
				.delete(collection.table)
				.where(predicate(collection, request.where))
				.returning(returning)
			return row === undefined ? null : immutableRecord(row)
		}
		case 'compare-and-swap': {
			const where = and(
				predicate(collection, request.where),
				predicate(collection, request.expected),
			)
			const [row] = await client
				.update(collection.table)
				.set(request.data)
				.where(where)
				.returning(returning)
			return row === undefined ? null : immutableRecord(row)
		}
	}
}

/** Executes one bounded private request and sanitizes every driver failure. */
export const executePostgresPrivateStorage = async (
	client: PostgresDrizzleClient,
	catalog: PostgresPrivateStorageCatalog,
	request: PrivateStorageOperationRequest,
): Promise<Readonly<Record<string, unknown>> | null> => {
	try {
		return await execute(
			client,
			catalog.getPrivateCollection(request.collection),
			request,
		)
	} catch (error: unknown) {
		if (error instanceof FrameworkError) throw error
		const driverCode = readPostgresDriverCode(error)
		const developerData =
			driverCode?.startsWith('22') === true ||
			driverCode?.startsWith('23') === true
		throw new FrameworkError(
			developerData ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
			developerData
				? 'PostgreSQL rejected a private record constraint.'
				: 'PostgreSQL private storage operation failed.',
			{
				cause: error,
				internalDetails: {
					...(driverCode === undefined ? {} : { driverCode }),
					kind: 'postgres-private-storage-failed',
					operation: request.kind,
				},
				retryable: driverCode === '40001' || driverCode === '40P01',
			},
		)
	}
}
