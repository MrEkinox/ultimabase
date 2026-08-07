import {
	FrameworkError,
	type DatabaseRelationPredicateScope,
	type QueryRelationCountComparison,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'
import {
	and,
	between,
	count,
	eq,
	exists,
	getColumns,
	gt,
	gte,
	inArray,
	lt,
	lte,
	ne,
	not,
	notBetween,
	notInArray,
	type RelationsFilter,
	type SchemaEntry,
	type SQL,
	type SQLWrapper,
	type TableRelationalConfig,
	type TablesRelationalConfig,
} from 'drizzle-orm'
import {
	alias,
	QueryBuilder,
	type PgColumn,
	type PgTable,
} from 'drizzle-orm/pg-core'

import {
	compilePostgresConstraints,
	type PostgresConstraintCompilerRegistry,
} from '../constraints/compiler.js'
import type { PostgresSchemaCatalog } from '../schema/catalog.js'
import type {
	CompiledPostgresField,
	CompiledPostgresSchema,
} from '../schema/contracts.js'
import { resolveCompiledPostgresField } from '../schema/field.js'
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
export const rebindCompiledPostgresSchema = (
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

const compileRelationCountComparison = (
	comparison: QueryRelationCountComparison,
	cardinality: SQLWrapper,
): SQL => {
	switch (comparison.operator) {
		case 'equal':
			return eq(cardinality, comparison.value)
		case 'not-equal':
			return ne(cardinality, comparison.value)
		case 'greater-than':
			return gt(cardinality, comparison.value)
		case 'greater-than-or-equal':
			return gte(cardinality, comparison.value)
		case 'less-than':
			return lt(cardinality, comparison.value)
		case 'less-than-or-equal':
			return lte(cardinality, comparison.value)
		case 'in':
			return inArray(cardinality, [...comparison.values])
		case 'not-in':
			return notInArray(cardinality, [...comparison.values])
		case 'between':
			return between(cardinality, comparison.lower, comparison.upper)
		case 'not-between':
			return notBetween(cardinality, comparison.lower, comparison.upper)
	}
}

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

		const depth = relationDepth

		relationDepth += 1

		if (predicate.kind === 'relation-count') {
			const relation = catalog.getRelationDefinition(
				predicate.source.definition,
				[predicate.field],
				predicate.target.definition,
			)
			const targetAlias = alias(
				relation.target.table,
				`__ultimabase_relation_target_${String(depth)}`,
			)
			const target = rebindCompiledPostgresSchema(relation.target, targetAlias)
			const targetConstraint = compilePostgresConstraints(
				constraintCompilers,
				target,
				scope.constraints,
			)
			const targetAccess =
				scope.rowFilter === undefined
					? undefined
					: compilePostgresRowFilter(scope.rowFilter, target)
			const sourceId = resolveCompiledPostgresField(source, 'id').column
			const developerPredicate = compilePostgresFilter(
				predicate.expression,
				target,
				compile,
			)
			const cardinality = count()
			const comparisons = and(
				...predicate.comparisons.map((comparison) =>
					compileRelationCountComparison(comparison, cardinality),
				),
			)

			if (comparisons === undefined) {
				throw new TypeError(
					'PostgreSQL relation count comparison is unavailable',
				)
			}

			let aggregate: SQLWrapper

			if (relation.storage.kind === 'pointer') {
				const targetPointer = resolveAliasedColumn(
					getColumns(targetAlias),
					'',
					relation.storage.targetColumn.name,
				)

				aggregate = new QueryBuilder()
					.select({ value: cardinality })
					.from(targetAlias)
					.where(
						and(
							eq(targetPointer, sourceId),
							targetConstraint,
							targetAccess,
							developerPredicate,
						),
					)
					.having(comparisons)
			} else {
				const joinAlias = alias(
					relation.storage.relation.table,
					`__ultimabase_relation_join_${String(depth)}`,
				)
				const joinColumns = getColumns(joinAlias)
				const sourceEdge = resolveAliasedColumn(
					joinColumns,
					'',
					relation.storage.sourceColumn.name,
				)
				const targetEdge = resolveAliasedColumn(
					joinColumns,
					'',
					relation.storage.targetColumn.name,
				)
				const targetId = resolveCompiledPostgresField(target, 'id').column

				aggregate = new QueryBuilder()
					.select({ value: cardinality })
					.from(targetAlias)
					.innerJoin(joinAlias, eq(targetEdge, targetId))
					.where(
						and(
							eq(sourceEdge, sourceId),
							targetConstraint,
							targetAccess,
							developerPredicate,
						),
					)
					.having(comparisons)
			}

			return exists(aggregate)
		}

		const pointerPredicate =
			predicate.operator === 'is' || predicate.operator === 'is-not'
		const pointer = pointerPredicate
			? catalog.getPointerDefinition(
					predicate.source.definition,
					[predicate.field],
					predicate.target.definition,
				)
			: undefined
		const relation = pointerPredicate
			? undefined
			: catalog.getRelationDefinition(
					predicate.source.definition,
					[predicate.field],
					predicate.target.definition,
				)

		const metadata = (() => {
			if (pointer !== undefined) {
				return {
					binding: catalog.getDrizzlePointer(pointer),
					target: pointer.target,
				}
			}

			if (relation !== undefined) {
				return {
					binding: catalog.getDrizzleRelation(relation),
					target: relation.target,
				}
			}

			throw new TypeError('PostgreSQL relationship predicate is unavailable')
		})()
		const binding = metadata.binding
		const targetSchema = metadata.target
		const relationName =
			'relationName' in binding
				? binding.relationName
				: binding.sourceRelationName
		const targetFilter = {
			RAW: (table: SchemaEntry): SQL => {
				// Generated relation metadata only contains PostgreSQL tables, never views.
				const target = rebindCompiledPostgresSchema(
					targetSchema,
					table as PgTable,
				)
				const aliasedTargetConstraint = compilePostgresConstraints(
					constraintCompilers,
					target,
					scope.constraints,
				)
				const aliasedTargetAccess =
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
					aliasedTargetConstraint,
					aliasedTargetAccess,
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
			relationName,
			targetFilter,
		)
		const filter =
			predicate.operator === 'some' || predicate.operator === 'is'
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
