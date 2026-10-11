import type {
	PostgresColumnSnapshot,
	PostgresDatabaseSnapshot,
} from '../introspection/contracts.js'
import { toPostgresColumnName } from '../naming.js'
import type { DesiredPostgresTable, PostgresSchemaChange } from './contracts.js'

/** Canonical spelling shared by catalog (`numeric(12,4)`) and Drizzle types. */
export const normalizePostgresType = (type: string): string =>
	type
		.toLowerCase()
		.replaceAll(/\s+/gu, ' ')
		.replaceAll(/\s*\(\s*/gu, '(')
		.replaceAll(/\s*,\s*/gu, ',')
		.replaceAll(/\s*\)/gu, ')')
		.replace(' without time zone', '')
		.trim()

type ParsedType =
	| Readonly<{ kind: 'bigint' }>
	| Readonly<{ kind: 'numeric'; precision?: number; scale: number }>
	| Readonly<{
			kind: 'time' | 'timestamp'
			precision: number
			timeZone: boolean
	  }>
	| Readonly<{ kind: 'other'; type: string }>

// PostgreSQL's default fractional precision of time and timestamp.
const defaultTemporalPrecision = 6
// Digits of the largest bigint, 9223372036854775807.
const bigintDigits = 19

const parseType = (type: string): ParsedType => {
	const normalized = normalizePostgresType(type)
	if (normalized === 'bigint') return { kind: 'bigint' }

	const numeric = /^numeric(?:\((\d+)(?:,(\d+))?\))?$/u.exec(normalized)
	if (numeric !== null) {
		const [, precision, scale] = numeric
		return precision === undefined
			? { kind: 'numeric', scale: 0 }
			: {
					kind: 'numeric',
					precision: Number(precision),
					scale: Number(scale ?? 0),
				}
	}

	const temporal = /^(time|timestamp)(?:\((\d+)\))?( with time zone)?$/u.exec(
		normalized,
	)
	if (temporal !== null) {
		const [, kind, precision, timeZone] = temporal
		return {
			kind: kind === 'time' ? 'time' : 'timestamp',
			precision:
				precision === undefined ? defaultTemporalPrecision : Number(precision),
			timeZone: timeZone !== undefined,
		}
	}

	return { kind: 'other', type: normalized }
}

/**
 * Answers whether converting a column keeps every existing value exactly
 * (ADR-0320): a wider or unconstrained `numeric`, `bigint` to a `numeric`
 * that holds it, or a finer `time`/`timestamp` of the same time-zone kind.
 * Any other change, `double precision` to `text` included, needs a migration.
 */
export const isWideningPostgresTypeChange = (
	from: string,
	to: string,
): boolean => {
	const source = parseType(from)
	const target = parseType(to)

	if (target.kind === 'numeric') {
		if (target.precision === undefined) {
			return source.kind === 'numeric' || source.kind === 'bigint'
		}
		const integerDigits = target.precision - target.scale
		if (source.kind === 'bigint') return integerDigits >= bigintDigits

		return (
			source.kind === 'numeric' &&
			source.precision !== undefined &&
			target.scale >= source.scale &&
			integerDigits >= source.precision - source.scale
		)
	}

	if (target.kind === 'time' || target.kind === 'timestamp') {
		return (
			source.kind === target.kind &&
			source.timeZone === target.timeZone &&
			target.precision >= source.precision
		)
	}

	return false
}

/** One live column of a managed table that no field declares any more. */
export interface UnmanagedPostgresColumn {
	readonly column: PostgresColumnSnapshot
	/** Fields added in the same plan with the same type: likely renames. */
	readonly renameCandidates: readonly string[]
	/** NOT NULL without default or identity: every insert would fail. */
	readonly blocksInserts: boolean
	readonly table: string
}

/**
 * Lists the live columns of managed tables that the desired schema neither
 * declares nor renames (ADR-0320). A field that disappears while a field of
 * the same type appears in the plan is reported as a likely forgotten
 * `renamedFrom`.
 */
export const findUnmanagedPostgresColumns = (
	desiredTables: readonly DesiredPostgresTable[],
	live: PostgresDatabaseSnapshot,
	changes: readonly PostgresSchemaChange[],
): readonly UnmanagedPostgresColumn[] => {
	const liveByName = new Map(live.tables.map((table) => [table.name, table]))

	return desiredTables.flatMap((desired) => {
		const current = liveByName.get(desired.name)
		if (current === undefined) return []

		const declared = new Set(desired.columns.map(({ name }) => name))
		const renamed = new Set(
			changes.flatMap((change) =>
				change.kind === 'rename-column' && change.table === desired.name
					? [change.from]
					: [],
			),
		)
		const added = changes.flatMap((change) =>
			change.kind === 'add-column' &&
			change.table === desired.name &&
			change.column.field !== undefined
				? [
						{
							column: change.column.name,
							field: change.column.field,
							type: change.column.type,
						},
					]
				: [],
		)
		/** Same-type new fields; the `snake_case` spelling of the old name wins. */
		const candidatesFor = (
			column: PostgresColumnSnapshot,
		): readonly string[] => {
			const sameType = added.filter(
				({ type }) =>
					normalizePostgresType(type) === normalizePostgresType(column.type),
			)
			const exact = sameType.filter(
				(candidate) => candidate.column === toPostgresColumnName(column.name),
			)
			return (exact.length > 0 ? exact : sameType).map(({ field }) => field)
		}

		return current.columns
			.filter(({ name }) => !declared.has(name) && !renamed.has(name))
			.map((column) => ({
				blocksInserts:
					!column.nullable &&
					column.defaultExpression === undefined &&
					column.identity === undefined,
				column,
				renameCandidates: candidatesFor(column),
				table: desired.name,
			}))
	})
}

const quote = (name: string): string => `"${name}"`

/** Names one unmanaged column and, when one is likely, the forgotten rename. */
export const describeUnmanagedPostgresColumn = ({
	column,
	renameCandidates,
	table,
}: UnmanagedPostgresColumn): string => {
	const name = `${quote(table)}.${quote(column.name)} (${column.type})`
	const [candidate, ...others] = renameCandidates
	if (candidate === undefined) return name

	const fields =
		others.length === 0
			? `field ${candidate}`
			: `one of fields ${renameCandidates.join(', ')}`
	return `${name}, which looks renamed to ${fields}: declare postgres: { renamedFrom: '${column.name}' } on that field or rename the column outside UltimaBase`
}
