import {
	FrameworkError,
	type DatabaseRelationPredicateScope,
	type QueryRelationCountComparison,
	type QueryRelationFilterNode,
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
	type SchemaEntry,
	type SQL,
	type SQLWrapper,
} from 'drizzle-orm'
import {
	alias,
	QueryBuilder,
	type PgColumn,
	type PgTable,
} from 'drizzle-orm/pg-core'

import { required } from '../required.js'
import type { PostgresSchemaCatalog } from '../schema/catalog.js'
import {
	resolveCompiledPostgresField,
	type CompiledPostgresField,
	type CompiledPostgresSchema,
} from '../schema/contracts.js'
import type {
	PostgresDrizzlePointerBinding,
	PostgresDrizzleRelationBinding,
} from '../schema/drizzle-relations.js'
import {
	compilePostgresFilter,
	compilePostgresRowFilter,
	type PostgresRelationPredicateCompiler,
} from './filter-compiler.js'
import {
	compilePostgresDrizzleRelationFilter,
	type PostgresDrizzleRelationsFilter,
} from './relation-compiler.js'

const resolveAliasedColumn = (
	columns: Readonly<Record<string, PgColumn>>,
	fieldName: string,
	physicalName: string,
): PgColumn => {
	const direct = columns[fieldName]

	return required(
		direct?.name === physicalName
			? direct
			: Object.values(columns).find(({ name }) => name === physicalName),
		`PostgreSQL alias omitted column: ${physicalName}`,
	)
}

/** Rebinds codecs and validation metadata to one query-local table alias. */
export const rebindCompiledPostgresSchema = (
	schema: CompiledPostgresSchema,
	table: PgTable,
): CompiledPostgresSchema => {
	const columns = getColumns(table)
	const fields = Object.fromEntries(
		Object.entries(schema.fields).map(
			([fieldName, field]): [string, CompiledPostgresField] => [
				fieldName,
				immutableRecord({
					...field,
					column: resolveAliasedColumn(columns, fieldName, field.column.name),
				}),
			],
		),
	)

	return immutableRecord({ ...schema, fields: immutableRecord(fields), table })
}

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

/** Resolves the generated Drizzle relation that one quantified leaf traverses. */
const resolveRelatedTarget = (
	catalog: PostgresSchemaCatalog,
	predicate: Extract<QueryRelationFilterNode, { kind: 'relation-predicate' }>,
): Readonly<{
	binding: PostgresDrizzlePointerBinding | PostgresDrizzleRelationBinding
	relationName: string
	targetSchema: CompiledPostgresSchema
}> => {
	const path = [predicate.field]

	if (predicate.operator === 'is' || predicate.operator === 'is-not') {
		const pointer = catalog.getPointerDefinition(
			predicate.source.definition,
			path,
			predicate.target.definition,
		)
		const binding = catalog.getDrizzlePointer(pointer)

		return {
			binding,
			relationName: binding.relationName,
			targetSchema: pointer.target,
		}
	}

	const relation = catalog.getRelationDefinition(
		predicate.source.definition,
		path,
		predicate.target.definition,
	)
	const binding = catalog.getDrizzleRelation(relation)

	return {
		binding,
		relationName: binding.sourceRelationName,
		targetSchema: relation.target,
	}
}

/** Creates one request-local compiler so nested aliases remain deterministic. */
export const createPostgresRelationPredicateCompiler = (
	catalog: PostgresSchemaCatalog,
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
			throw new FrameworkError(
				'INTERNAL_ERROR',
				'PostgreSQL relation predicate is missing its target policy scope.',
				{ publicMessage: 'Relation filters are not available.' },
			)
		}

		const depth = relationDepth
		// Protected target policy is compiled before developer predicates, which
		// may allocate nested aliases from this same request-local counter.
		const compileTargetPolicy = (
			target: CompiledPostgresSchema,
		): SQL | undefined =>
			scope.rowFilter === undefined
				? undefined
				: compilePostgresRowFilter(scope.rowFilter, target, compile)

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
			const targetAccess = compileTargetPolicy(target)
			const sourceId = resolveCompiledPostgresField(source, 'id').column
			const developerPredicate = compilePostgresFilter(
				predicate.expression,
				target,
				compile,
			)
			const cardinality = count()
			const comparisons = required(
				and(
					...predicate.comparisons.map((comparison) =>
						compileRelationCountComparison(comparison, cardinality),
					),
				),
				'PostgreSQL relation count comparison is unavailable',
			)
			const aggregate = new QueryBuilder()
				.select({ value: cardinality })
				.from(targetAlias)
				.$dynamic()
			const storage = relation.storage
			let edges = aggregate
			let sourceEdge: PgColumn

			if (storage.kind === 'pointer') {
				// The target row itself carries the source identity.
				sourceEdge = resolveAliasedColumn(
					getColumns(targetAlias),
					'',
					storage.targetColumn.name,
				)
			} else {
				const joinAlias = alias(
					storage.relation.table,
					`__ultimabase_relation_join_${String(depth)}`,
				)
				const joinColumns = getColumns(joinAlias)

				sourceEdge = resolveAliasedColumn(
					joinColumns,
					'',
					storage.sourceColumn.name,
				)
				edges = aggregate.innerJoin(
					joinAlias,
					eq(
						resolveAliasedColumn(joinColumns, '', storage.targetColumn.name),
						resolveCompiledPostgresField(target, 'id').column,
					),
				)
			}

			return exists(
				edges
					.where(
						and(eq(sourceEdge, sourceId), targetAccess, developerPredicate),
					)
					.having(comparisons),
			)
		}

		const { binding, relationName, targetSchema } = resolveRelatedTarget(
			catalog,
			predicate,
		)
		const targetFilter = {
			RAW: (table: SchemaEntry): SQL => {
				// Generated relation metadata only contains PostgreSQL tables, never views.
				const target = rebindCompiledPostgresSchema(
					targetSchema,
					table as PgTable,
				)
				const targetAccess = compileTargetPolicy(target)
				const developerPredicate = compilePostgresFilter(
					predicate.expression,
					target,
					compile,
				)

				return required(
					and(
						targetAccess,
						predicate.operator === 'every'
							? not(developerPredicate)
							: developerPredicate,
					),
					'PostgreSQL relation target predicate is unavailable',
				)
			},
		} as unknown as PostgresDrizzleRelationsFilter
		// Generated relation keys are unknown to Drizzle's erased relation map.
		const related: PostgresDrizzleRelationsFilter = {
			[relationName]: targetFilter,
		}

		return compilePostgresDrizzleRelationFilter(
			catalog,
			binding,
			'source',
			source.table,
			predicate.operator === 'some' || predicate.operator === 'is'
				? related
				: { NOT: related },
			depth,
		)
	}

	return compile
}
