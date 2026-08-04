import {
	FrameworkError,
	type DatabaseRelationPredicateScope,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'
import { and, eq, exists, getTableColumns, not, type SQL } from 'drizzle-orm'
import { alias, type PgColumn } from 'drizzle-orm/pg-core'

import {
	compilePostgresConstraints,
	type PostgresConstraintCompilerRegistry,
} from '../constraints/compiler.js'
import type { PostgresDrizzleClient } from '../drizzle/client.js'
import type { PostgresSchemaCatalog } from '../schema/catalog.js'
import type {
	CompiledPostgresField,
	CompiledPostgresSchema,
} from '../schema/contracts.js'
import { resolveCompiledPostgresField } from '../schema/field.js'
import {
	compilePostgresFilter,
	compilePostgresRowFilter,
	type PostgresRelationPredicateCompiler,
} from './filter-compiler.js'

const resolveAliasedColumn = (
	columns: Readonly<Record<string, PgColumn>>,
	fieldName: string,
	physicalName: string,
): PgColumn => {
	const direct = columns[fieldName]
	const column =
		direct?.name === physicalName
			? direct
			: Object.values(columns).find(
					(candidate) => candidate.name === physicalName,
				)

	if (column === undefined) {
		throw new TypeError(`PostgreSQL alias omitted column: ${physicalName}`)
	}

	return column
}

/** Rebinds codecs and validation metadata to one query-local table alias. */
const aliasCompiledSchema = (
	schema: CompiledPostgresSchema,
	name: string,
): CompiledPostgresSchema => {
	const table = alias(schema.table, name)
	const columns = getTableColumns(table)
	const fields = immutableRecord(
		Object.fromEntries(
			Object.entries(schema.fields).map(
				([fieldName, field]): readonly [string, CompiledPostgresField] => [
					fieldName,
					immutableRecord({
						...field,
						column: resolveAliasedColumn(columns, fieldName, field.column.name),
					}),
				],
			),
		) as Record<string, CompiledPostgresField>,
	)

	return immutableRecord({ ...schema, fields, table })
}

const createMissingScopeError = (): FrameworkError<'INTERNAL_ERROR'> =>
	new FrameworkError(
		'INTERNAL_ERROR',
		'PostgreSQL relation predicate is missing its target policy scope.',
		{ publicMessage: 'Relation filters are not available.' },
	)

/** Creates one request-local compiler so nested aliases remain deterministic. */
export const createPostgresRelationPredicateCompiler = (
	client: PostgresDrizzleClient,
	catalog: PostgresSchemaCatalog,
	constraintCompilers: PostgresConstraintCompilerRegistry,
	scopes: readonly DatabaseRelationPredicateScope[],
): PostgresRelationPredicateCompiler => {
	let aliasPosition = 0

	const compile: PostgresRelationPredicateCompiler = (
		predicate,
		source,
	): SQL => {
		if (source.definition !== predicate.source.definition) {
			throw new TypeError(
				'PostgreSQL relation predicate source schema does not match its alias',
			)
		}

		const scope = scopes.find((candidate) => candidate.predicate === predicate)

		if (scope === undefined) {
			throw createMissingScopeError()
		}

		const relation = catalog.getRelationDefinition(
			predicate.source.definition,
			[predicate.field],
			predicate.target.definition,
		)
		const position = aliasPosition
		aliasPosition += 1
		const target = aliasCompiledSchema(
			relation.target,
			`ub_relation_${String(position)}_target`,
		)
		const targetConstraint = compilePostgresConstraints(
			constraintCompilers,
			target,
			scope.constraints,
		)
		const targetAccess =
			scope.rowFilter === undefined
				? undefined
				: compilePostgresRowFilter(scope.rowFilter, target)
		const developerPredicate = compilePostgresFilter(
			predicate.expression,
			target,
			compile,
		)
		const quantifiedPredicate =
			predicate.operator === 'every'
				? not(developerPredicate)
				: developerPredicate
		const sourceId = resolveCompiledPostgresField(source, 'id').column
		let correlated: SQL

		if (relation.storage.kind === 'pointer') {
			const pointerField = Object.entries(relation.target.fields).find(
				([, field]) => field.column === relation.storage.targetColumn,
			)?.[0]

			if (pointerField === undefined) {
				throw new TypeError(
					'PostgreSQL inverse relation pointer field is unavailable',
				)
			}

			const pointerColumn = resolveCompiledPostgresField(
				target,
				pointerField,
			).column
			correlated = exists(
				client
					.select({ value: resolveCompiledPostgresField(target, 'id').column })
					.from(target.table)
					.where(
						and(
							eq(pointerColumn, sourceId),
							targetConstraint,
							targetAccess,
							quantifiedPredicate,
						),
					),
			)
		} else {
			const joinTable = alias(
				relation.storage.relation.table,
				`ub_relation_${String(position)}_edge`,
			)
			const joinColumns = getTableColumns(joinTable)
			const sourceColumn = resolveAliasedColumn(
				joinColumns,
				'sourceId',
				relation.storage.sourceColumn.name,
			)
			const targetColumn = resolveAliasedColumn(
				joinColumns,
				'targetId',
				relation.storage.targetColumn.name,
			)
			const targetId = resolveCompiledPostgresField(target, 'id').column

			correlated = exists(
				client
					.select({ value: targetId })
					.from(joinTable)
					.innerJoin(target.table, eq(targetId, targetColumn))
					.where(
						and(
							eq(sourceColumn, sourceId),
							targetConstraint,
							targetAccess,
							quantifiedPredicate,
						),
					),
			)
		}

		return predicate.operator === 'some' ? correlated : not(correlated)
	}

	return compile
}
