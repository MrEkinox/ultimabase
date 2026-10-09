import type { SchemaIndexCondition, SchemaIndexLiteral } from '@ultimabase/core'

import type { PostgresStorageKind } from './contracts.js'

const quoteIdentifier = (identifier: string): string =>
	`"${identifier.replaceAll('"', '""')}"`

const comparisonOperators: Readonly<
	Record<Exclude<SchemaIndexCondition['kind'], 'null'>, string>
> = {
	equal: '=',
	'greater-than': '>',
	'greater-than-or-equal': '>=',
	'less-than': '<',
	'less-than-or-equal': '<=',
}

/** Renders one Core-validated literal; DDL predicates cannot use parameters. */
const renderLiteral = (
	value: SchemaIndexLiteral,
	storage: PostgresStorageKind | undefined,
): string => {
	switch (typeof value) {
		case 'boolean':
			return value ? 'TRUE' : 'FALSE'
		case 'bigint':
			return value.toString()
		case 'number':
			if (!Number.isFinite(value)) {
				throw new TypeError('PostgreSQL partial index literal must be finite')
			}
			return String(value)
		default:
			if (value.includes('\0')) {
				throw new TypeError('PostgreSQL partial index literal contains NUL')
			}
			return `'${value.replaceAll("'", "''")}'${storage === 'uuid' ? '::uuid' : ''}`
	}
}

/**
 * Renders the conjunction of a partial index (ADR-0303) with inline literals,
 * which `CREATE INDEX ... WHERE` requires.
 */
export const renderPostgresIndexPredicate = (
	conditions: readonly SchemaIndexCondition[],
	storageByField: ReadonlyMap<string, PostgresStorageKind>,
): string =>
	conditions
		.map((condition) => {
			const column = quoteIdentifier(condition.field)
			if (condition.kind === 'null') {
				return `${column} IS ${condition.isNull ? '' : 'NOT '}NULL`
			}
			return `${column} ${comparisonOperators[condition.kind]} ${renderLiteral(
				condition.value,
				storageByField.get(condition.field),
			)}`
		})
		.join(' AND ')
