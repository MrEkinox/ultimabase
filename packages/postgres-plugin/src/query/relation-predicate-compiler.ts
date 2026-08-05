import {
	FrameworkError,
	type DatabaseRelationPredicateScope,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'
import {
	and,
	getColumns,
	not,
	type RelationsFilter,
	type SchemaEntry,
	type SQL,
	type TableRelationalConfig,
	type TablesRelationalConfig,
} from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'

import {
	compilePostgresConstraints,
	type PostgresConstraintCompilerRegistry,
} from '../constraints/compiler.js'
import type { PostgresSchemaCatalog } from '../schema/catalog.js'
import type {
	CompiledPostgresField,
	CompiledPostgresSchema,
} from '../schema/contracts.js'
import {
	compilePostgresDrizzleRelationFilter,
	createPostgresDrizzleRelationFilter,
} from './drizzle-relation-filter.js'
import {
	compilePostgresFilter,
	compilePostgresRowFilter,
	type PostgresRelationPredicateCompiler,
} from './filter-compiler.js'

type PostgresDrizzleRelationsFilter = RelationsFilter<
	TableRelationalConfig,
	TablesRelationalConfig
>

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
const rebindCompiledSchema = (
	schema: CompiledPostgresSchema,
	table: PgTable,
): CompiledPostgresSchema => {
	const columns = getColumns(table)
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
	catalog: PostgresSchemaCatalog,
	constraintCompilers: PostgresConstraintCompilerRegistry,
	scopes: readonly DatabaseRelationPredicateScope[],
): PostgresRelationPredicateCompiler => {
	let relationDepth = 0

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
		const binding = catalog.getDrizzleRelation(relation)
		const depth = relationDepth

		relationDepth += 1
		const targetFilter = {
			RAW: (table: SchemaEntry): SQL => {
				// Generated relation metadata only contains PostgreSQL tables, never views.
				const target = rebindCompiledSchema(relation.target, table as PgTable)
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
				const combined = and(
					targetConstraint,
					targetAccess,
					quantifiedPredicate,
				)

				if (combined === undefined) {
					throw new TypeError(
						'PostgreSQL relation target predicate is unavailable',
					)
				}

				return combined
			},
		} as unknown as PostgresDrizzleRelationsFilter
		const related = createPostgresDrizzleRelationFilter(
			binding.sourceRelationName,
			targetFilter,
		)
		const filter =
			predicate.operator === 'some'
				? related
				: ({ NOT: related } satisfies PostgresDrizzleRelationsFilter)

		return compilePostgresDrizzleRelationFilter(
			catalog,
			binding,
			'source',
			source.table,
			filter,
			depth,
		)
	}

	return compile
}
