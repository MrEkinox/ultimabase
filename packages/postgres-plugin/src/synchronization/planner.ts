import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type {
	PostgresColumnSnapshot,
	PostgresConstraintSnapshot,
	PostgresDatabaseSnapshot,
	PostgresTableSnapshot,
	PostgresUnsupportedStructure,
} from '../introspection/contracts.js'
import type {
	DesiredPostgresColumn,
	DesiredPostgresForeignKey,
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

const foreignKeyMatches = (
	desired: DesiredPostgresForeignKey,
	live: PostgresConstraintSnapshot | undefined,
): boolean =>
	live?.kind === 'f' &&
	arraysEqual(live.columns, [desired.column]) &&
	live.targetTable === desired.targetTable &&
	arraysEqual(live.targetColumns ?? [], [desired.targetColumn]) &&
	live.onDelete === desired.onDelete

const planColumnChanges = (
	table: string,
	desired: DesiredPostgresColumn,
	live: PostgresColumnSnapshot,
): PostgresSchemaChange[] => {
	const column = desired.name
	const changes: PostgresSchemaChange[] = []

	if (normalizeType(live.type) !== normalizeType(desired.type)) {
		changes.push({
			column,
			from: live.type,
			kind: 'alter-column-type',
			table,
			to: desired.type,
		})
	}

	if (live.nullable !== desired.nullable) {
		changes.push({
			column,
			kind: 'set-column-nullability',
			nullable: desired.nullable,
			table,
		})
	}

	if (live.identity !== desired.identity) {
		changes.push({
			column,
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
			column,
			...(desired.defaultExpression === undefined
				? {}
				: { expression: desired.defaultExpression }),
			kind: 'set-column-default',
			table,
		})
	}

	return changes
}

const planIndexes = (
	desired: DesiredPostgresTable,
	live: PostgresTableSnapshot,
): PostgresSchemaChange[] => {
	const table = desired.name
	const changes: PostgresSchemaChange[] = []
	const missing = new Map(desired.indexes.map((index) => [index.name, index]))
	const uniqueConstraints = new Set(
		live.constraints.filter(({ kind }) => kind === 'u').map(({ name }) => name),
	)

	for (const index of live.indexes) {
		if (index.primary) continue

		const expected = missing.get(index.name)

		if (
			expected?.method === index.method &&
			expected.unique === index.unique &&
			arraysEqual(index.columns, expected.columns)
		) {
			missing.delete(index.name)
		} else if (uniqueConstraints.has(index.name)) {
			changes.push({ constraint: index.name, kind: 'drop-constraint', table })
		} else {
			changes.push({ index: index.name, kind: 'drop-index', table })
		}

		// Handled live indexes never trigger a second unique-constraint drop below.
		uniqueConstraints.delete(index.name)
	}

	for (const constraint of uniqueConstraints) {
		changes.push({ constraint, kind: 'drop-constraint', table })
	}

	for (const index of desired.indexes) {
		if (missing.has(index.name)) {
			changes.push({ index, kind: 'create-index', table })
		}
	}

	return changes
}

const planPrimaryKey = (
	desired: DesiredPostgresTable,
	live: PostgresTableSnapshot,
): PostgresSchemaChange[] => {
	const [first, ...rest] = desired.columns
		.filter(({ primary }) => primary)
		.map(({ name }) => name)
	const current = live.constraints.find(({ kind }) => kind === 'p')

	if (
		first === undefined ||
		arraysEqual([first, ...rest], current?.columns ?? [])
	) {
		return []
	}

	return [
		{
			columns: [first, ...rest],
			...(current === undefined ? {} : { currentConstraint: current.name }),
			kind: 'set-primary-key',
			table: desired.name,
		},
	]
}

const planExistingTable = (
	desired: DesiredPostgresTable,
	live: PostgresTableSnapshot,
	unsupported: readonly PostgresUnsupportedStructure[],
): PostgresSchemaChange[] => {
	const table = desired.name
	const changes: PostgresSchemaChange[] = unsupported.map((structure) => ({
		kind: 'unsupported-structure',
		structure: `${structure.kind}:${structure.name}`,
		table,
	}))
	const liveColumns = new Map(
		live.columns.map((column) => [column.name, column]),
	)
	const desiredForeignKeys = new Map(
		desired.foreignKeys.map((foreignKey) => [foreignKey.name, foreignKey]),
	)

	// Obsolete edges are removed before columns or target tables can change.
	for (const constraint of live.constraints) {
		const expected = desiredForeignKeys.get(constraint.name)

		if (
			constraint.kind === 'f' &&
			(expected === undefined || !foreignKeyMatches(expected, constraint))
		) {
			changes.push({
				constraint: constraint.name,
				kind: 'drop-constraint',
				table,
			})
		}
	}

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
					table,
					to: column.name,
				})
			}
		}

		changes.push(
			...(current === undefined
				? [{ column, kind: 'add-column' as const, table }]
				: planColumnChanges(table, column, current)),
		)
	}

	// Indexes are removed before columns so PostgreSQL never sees stale dependencies.
	return [
		...changes,
		...planIndexes(desired, live),
		...planPrimaryKey(desired, live),
	]
}

/** Computes one immutable diff while deliberately preserving unrelated tables. */
export const planPostgresSchemaChanges = (
	desiredTables: readonly DesiredPostgresTable[],
	live: PostgresDatabaseSnapshot,
): readonly PostgresSchemaChange[] => {
	const liveByName = new Map(live.tables.map((table) => [table.name, table]))
	const changes = desiredTables.flatMap((desired): PostgresSchemaChange[] => {
		const current = liveByName.get(desired.name)

		return current === undefined
			? [{ kind: 'create-table', table: desired }]
			: planExistingTable(
					desired,
					current,
					live.unsupported.filter(({ table }) => table === desired.name),
				)
	})

	// Every table exists before any edge is added, including circular pointers.
	for (const desired of desiredTables) {
		const liveConstraints = liveByName.get(desired.name)?.constraints ?? []

		for (const foreignKey of desired.foreignKeys) {
			const current = liveConstraints.find(
				({ name }) => name === foreignKey.name,
			)

			if (!foreignKeyMatches(foreignKey, current)) {
				changes.push({
					foreignKey,
					kind: 'add-foreign-key',
					table: desired.name,
				})
			}
		}
	}

	return immutableArray(changes.map((change) => immutableRecord(change)))
}
