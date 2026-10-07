import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type {
	PostgresColumnSnapshot,
	PostgresDatabaseSnapshot,
	PostgresIndexSnapshot,
	PostgresTableSnapshot,
	PostgresUnsupportedStructure,
} from '../introspection/contracts.js'
import type {
	DesiredPostgresColumn,
	DesiredPostgresForeignKey,
	DesiredPostgresIndex,
	DesiredPostgresTable,
	PostgresSchemaChange,
} from './contracts.js'

const normalizeType = (type: string): string =>
	type.replace(/\s+\(/gu, '(').replaceAll(/\s+/gu, ' ').trim()

const normalizeExpression = (
	expression: string | undefined,
): string | undefined => expression?.replaceAll(/\s+/gu, ' ').trim()

const arraysEqual = (
	left: readonly string[],
	right: readonly string[],
): boolean =>
	left.length === right.length &&
	left.every((value, index) => value === right[index])

const indexMatches = (
	desired: DesiredPostgresIndex,
	live: PostgresIndexSnapshot,
): boolean =>
	live.method === desired.method &&
	live.unique === desired.unique &&
	arraysEqual(live.columns, desired.columns)

const foreignKeyMatches = (
	desired: DesiredPostgresForeignKey,
	live: PostgresTableSnapshot['constraints'][number],
): boolean =>
	live.kind === 'f' &&
	live.columns.length === 1 &&
	live.columns[0] === desired.column &&
	live.targetTable === desired.targetTable &&
	live.targetColumns?.length === 1 &&
	live.targetColumns[0] === desired.targetColumn &&
	live.onDelete === desired.onDelete

/** Removes obsolete edges before columns or target tables can change. */
const planForeignKeyDrops = (
	desired: DesiredPostgresTable,
	live: PostgresTableSnapshot,
): PostgresSchemaChange[] => {
	const desiredByName = new Map(
		desired.foreignKeys.map((foreignKey) => [foreignKey.name, foreignKey]),
	)
	const changes: PostgresSchemaChange[] = []

	for (const constraint of live.constraints) {
		if (constraint.kind !== 'f') continue

		const expected = desiredByName.get(constraint.name)

		if (expected !== undefined && foreignKeyMatches(expected, constraint)) {
			continue
		}

		changes.push({
			constraint: constraint.name,
			kind: 'drop-constraint',
			table: desired.name,
		})
	}

	return changes
}

const planForeignKeyAdds = (
	desiredTables: readonly DesiredPostgresTable[],
	liveByName: ReadonlyMap<string, PostgresTableSnapshot>,
): PostgresSchemaChange[] => {
	const changes: PostgresSchemaChange[] = []

	for (const desired of desiredTables) {
		const liveConstraints = liveByName.get(desired.name)?.constraints ?? []

		for (const foreignKey of desired.foreignKeys) {
			const current = liveConstraints.find(
				(constraint) => constraint.name === foreignKey.name,
			)

			if (current !== undefined && foreignKeyMatches(foreignKey, current)) {
				continue
			}

			changes.push({
				foreignKey,
				kind: 'add-foreign-key',
				table: desired.name,
			})
		}
	}

	return changes
}

const planColumnChanges = (
	table: string,
	desired: DesiredPostgresColumn,
	live: PostgresColumnSnapshot,
): PostgresSchemaChange[] => {
	const changes: PostgresSchemaChange[] = []

	if (normalizeType(live.type) !== normalizeType(desired.type)) {
		changes.push({
			column: desired.name,
			from: live.type,
			kind: 'alter-column-type',
			table,
			to: desired.type,
		})
	}

	if (live.nullable !== desired.nullable) {
		changes.push({
			column: desired.name,
			kind: 'set-column-nullability',
			nullable: desired.nullable,
			table,
		})
	}

	if (live.identity !== desired.identity) {
		changes.push({
			column: desired.name,
			...(desired.identity === undefined ? {} : { identity: desired.identity }),
			kind: 'set-column-identity',
			table,
		})
	}

	// Identity changes precede defaults because PostgreSQL owns identity defaults.
	if (
		normalizeExpression(live.defaultExpression) !==
		normalizeExpression(desired.defaultExpression)
	) {
		changes.push({
			column: desired.name,
			...(desired.defaultExpression === undefined
				? {}
				: { expression: desired.defaultExpression }),
			kind: 'set-column-default',
			table,
		})
	}

	return changes
}

const readPrimaryColumns = (table: PostgresTableSnapshot): readonly string[] =>
	table.constraints.find(({ kind }) => kind === 'p')?.columns ?? []

const readDesiredPrimaryColumns = (
	table: DesiredPostgresTable,
): readonly string[] =>
	table.columns.filter(({ primary }) => primary).map(({ name }) => name)

const planPrimaryKey = (
	desired: DesiredPostgresTable,
	live: PostgresTableSnapshot,
): PostgresSchemaChange[] => {
	const desiredColumns = readDesiredPrimaryColumns(desired)
	const liveColumns = readPrimaryColumns(live)

	if (arraysEqual(desiredColumns, liveColumns) || desiredColumns.length === 0) {
		return []
	}

	const [first, ...rest] = desiredColumns

	if (first === undefined) return []

	const currentConstraint = live.constraints.find(({ kind }) => kind === 'p')

	return [
		{
			columns: [first, ...rest],
			...(currentConstraint === undefined
				? {}
				: { currentConstraint: currentConstraint.name }),
			kind: 'set-primary-key',
			table: desired.name,
		},
	]
}

const planIndexes = (
	desired: DesiredPostgresTable,
	live: PostgresTableSnapshot,
): PostgresSchemaChange[] => {
	const changes: PostgresSchemaChange[] = []
	const desiredByName = new Map(
		desired.indexes.map((index) => [index.name, index]),
	)
	const uniqueConstraints = new Map(
		live.constraints
			.filter(({ kind }) => kind === 'u')
			.map((constraint) => [constraint.name, constraint]),
	)

	for (const index of live.indexes) {
		if (index.primary) continue

		const expected = desiredByName.get(index.name)

		if (expected !== undefined && indexMatches(expected, index)) {
			desiredByName.delete(index.name)
			uniqueConstraints.delete(index.name)
			continue
		}

		if (uniqueConstraints.has(index.name)) {
			changes.push({
				constraint: index.name,
				kind: 'drop-constraint',
				table: desired.name,
			})
			uniqueConstraints.delete(index.name)
		} else {
			changes.push({
				index: index.name,
				kind: 'drop-index',
				table: desired.name,
			})
		}
	}

	for (const constraint of uniqueConstraints.values()) {
		changes.push({
			constraint: constraint.name,
			kind: 'drop-constraint',
			table: desired.name,
		})
	}

	for (const index of desired.indexes) {
		if (desiredByName.has(index.name)) {
			changes.push({ index, kind: 'create-index', table: desired.name })
		}
	}

	return changes
}

const planExistingTable = (
	desired: DesiredPostgresTable,
	live: PostgresTableSnapshot,
	unsupported: readonly PostgresUnsupportedStructure[],
): PostgresSchemaChange[] => {
	const changes: PostgresSchemaChange[] = unsupported.map((structure) => ({
		kind: 'unsupported-structure',
		structure: `${structure.kind}:${structure.name}`,
		table: desired.name,
	}))
	const liveColumns = new Map(
		live.columns.map((column) => [column.name, column]),
	)

	changes.push(...planForeignKeyDrops(desired, live))

	for (const column of desired.columns) {
		let current = liveColumns.get(column.name)

		if (
			current === undefined &&
			column.renamedFrom !== undefined &&
			column.renamedFrom !== column.name
		) {
			current = liveColumns.get(column.renamedFrom)

			if (current !== undefined) {
				changes.push({
					from: column.renamedFrom,
					kind: 'rename-column',
					table: desired.name,
					to: column.name,
				})
			}
		}

		if (current === undefined) {
			changes.push({ column, kind: 'add-column', table: desired.name })
			continue
		}

		changes.push(...planColumnChanges(desired.name, column, current))
	}

	// Indexes are removed before columns so PostgreSQL never sees stale dependencies.
	changes.push(...planIndexes(desired, live))
	changes.push(...planPrimaryKey(desired, live))

	return changes
}

/** Computes one immutable diff while deliberately preserving unrelated tables. */
export const planPostgresSchemaChanges = (
	desiredTables: readonly DesiredPostgresTable[],
	live: PostgresDatabaseSnapshot,
): readonly PostgresSchemaChange[] => {
	const liveByName = new Map(live.tables.map((table) => [table.name, table]))
	const changes: PostgresSchemaChange[] = []

	for (const desired of desiredTables) {
		const current = liveByName.get(desired.name)

		if (current === undefined) {
			changes.push({ kind: 'create-table', table: desired })
			continue
		}

		changes.push(
			...planExistingTable(
				desired,
				current,
				live.unsupported.filter(({ table }) => table === desired.name),
			),
		)
	}

	// Every table exists before any edge is added, including circular pointers.
	changes.push(...planForeignKeyAdds(desiredTables, liveByName))

	return immutableArray(changes.map((change) => immutableRecord(change)))
}
