import { FrameworkError } from '@ultimabase/core'
import type { PrivateStorageOperationRequest } from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { and, eq, isNull, type SQL } from 'drizzle-orm'

import { readPostgresDriverCode } from '../connection/driver-error.js'
import { mapPostgresStorageError } from '../drizzle/operation-error.js'
import type { PostgresDrizzleClient } from '../drizzle/client.js'
import { required } from '../required.js'
import type { PostgresSchemaCatalog } from '../schema/catalog.js'
import type { CompiledPostgresPrivateCollection } from './compiler.js'

type PrivateRecord = Readonly<Record<string, unknown>>

const predicate = (
	collection: CompiledPostgresPrivateCollection,
	values: PrivateRecord,
): SQL | undefined =>
	and(
		...Object.entries(values).map(([name, value]) => {
			const field = required(
				collection.fields[name],
				`PostgreSQL private field is unavailable: ${name}`,
			)

			return value === null ? isNull(field.column) : eq(field.column, value)
		}),
	)

const execute = async (
	client: PostgresDrizzleClient,
	collection: CompiledPostgresPrivateCollection,
	request: PrivateStorageOperationRequest,
): Promise<readonly PrivateRecord[]> => {
	const returning = Object.fromEntries(
		Object.entries(collection.fields).map(([name, { column }]) => [
			name,
			column,
		]),
	)

	switch (request.kind) {
		case 'find-unique':
			return client
				.select(returning)
				.from(collection.table)
				.where(predicate(collection, request.where))
				.limit(1)
		case 'find-many':
			return client
				.select(returning)
				.from(collection.table)
				.where(predicate(collection, request.where))
				.limit(request.limit)
		case 'insert':
			return client
				.insert(collection.table)
				.values(request.data)
				.returning(returning)
		case 'update':
			return client
				.update(collection.table)
				.set(request.data)
				.where(predicate(collection, request.where))
				.returning(returning)
		case 'delete':
			return client
				.delete(collection.table)
				.where(predicate(collection, request.where))
				.returning(returning)
		case 'compare-and-swap':
			return client
				.update(collection.table)
				.set(request.data)
				.where(
					and(
						predicate(collection, request.where),
						predicate(collection, request.expected),
					),
				)
				.returning(returning)
	}
}

/** Executes one bounded private request and sanitizes every driver failure. */
export const executePostgresPrivateStorage = async (
	client: PostgresDrizzleClient,
	catalog: Pick<
		PostgresSchemaCatalog,
		'describeConstraint' | 'getPrivateCollection'
	>,
	request: PrivateStorageOperationRequest,
): Promise<PrivateRecord | readonly PrivateRecord[] | null> => {
	try {
		const rows = await execute(
			client,
			catalog.getPrivateCollection(request.collection),
			request,
		)
		if (request.kind === 'find-many') {
			return immutableArray(rows.map((row) => immutableRecord(row)))
		}
		const [row] = rows

		if (row === undefined && request.kind === 'insert') {
			throw new TypeError('PostgreSQL private insert returned no row')
		}

		return row === undefined ? null : immutableRecord(row)
	} catch (error: unknown) {
		if (error instanceof FrameworkError) throw error
		const driverCode = readPostgresDriverCode(error)
		const internalDetails = {
			...(driverCode === undefined ? {} : { driverCode }),
			kind: 'postgres-private-storage-failed',
			operation: request.kind,
		}
		const storageError = mapPostgresStorageError(
			error,
			request.kind === 'delete',
			internalDetails,
			{ constraints: (name) => catalog.describeConstraint(name) },
		)
		if (storageError !== undefined) throw storageError
		const developerData =
			driverCode?.startsWith('22') === true ||
			driverCode?.startsWith('23') === true
		throw new FrameworkError(
			developerData ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
			developerData
				? 'PostgreSQL rejected a private record constraint.'
				: 'PostgreSQL private storage operation failed.',
			{ cause: error, internalDetails },
		)
	}
}
