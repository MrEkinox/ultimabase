import { normalizeQueryCursorOrdering } from '@ultimabase/core'
import type {
	DatabaseLogicalRecord,
	DatabaseOperationAst,
	DatabaseOperationRequest,
	DatabasePointerInclusionPlan,
	ExecutableOperationAst,
	QueryAst,
	SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import {
	and,
	eq,
	getColumns,
	sql,
	type AnyDBQueryConfig,
	type RelationsFilter,
	type SchemaEntry,
	type SQL,
	type TableRelationalConfig,
	type TablesRelationalConfig,
} from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'

import {
	compilePostgresConstraints,
	type PostgresConstraintCompilerRegistry,
} from '../constraints/compiler.js'
import { compilePostgresQueryClauses } from '../query/clause-compiler.js'
import { compilePostgresRowFilter } from '../query/filter-compiler.js'
import { compilePostgresRelationPredicate } from '../query/relation-compiler.js'
import {
	createPostgresRelationPredicateCompiler,
	rebindCompiledPostgresSchema,
} from '../query/relation-predicate-compiler.js'
import type { PostgresSchemaCatalog } from '../schema/catalog.js'
import type { CompiledPostgresSchema } from '../schema/contracts.js'
import type { PostgresDrizzlePointerBinding } from '../schema/drizzle-relations.js'
import type { PostgresDrizzleClient } from './client.js'
import { readBuiltInQuery } from './operation-executor.js'
import { mapPostgresOperationError } from './operation-error.js'
import { readPostgresRecord } from './record.js'

type PostgresRelationsFilter = RelationsFilter<
	TableRelationalConfig,
	TablesRelationalConfig
>

interface DynamicRelationalQueryBuilder {
	findFirst(config: AnyDBQueryConfig): Promise<unknown>
	findMany(config: AnyDBQueryConfig): Promise<unknown>
}

const postgresIncludedPointers = new WeakMap<
	object,
	ReadonlyMap<string, DatabaseLogicalRecord | null>
>()
const postgresRelationalObjectIdentities = new WeakMap<object, unknown>()

const inclusionPathKey = (fieldPath: readonly string[]): string =>
	JSON.stringify(fieldPath)

const readOperationSchema = (
	operation: DatabaseOperationAst,
): SchemaDefinition => {
	const query = readOperationQuery(operation)

	return query.schema.definition
}

const readOperationQuery = (operation: DatabaseOperationAst): QueryAst => {
	const query: unknown = 'query' in operation ? operation.query : undefined

	if (
		!isPlainRecord(query) ||
		!isPlainRecord(query.schema) ||
		!('definition' in query.schema)
	) {
		throw new TypeError('PostgreSQL relational read operation has no schema')
	}

	return query as unknown as QueryAst
}

const compileColumns = (
	schema: CompiledPostgresSchema,
	operation: DatabaseOperationAst,
): Readonly<Record<string, boolean>> => {
	const query = readBuiltInQuery(readOperationQuery(operation))
	const requested =
		query.selection.fields.length === 0
			? Object.keys(schema.fields)
			: query.selection.fields.map(({ field }) => field)
	const names = requested.includes('id') ? requested : [...requested, 'id']

	return immutableRecord(Object.fromEntries(names.map((name) => [name, true])))
}

const compileRequestPredicate = (
	catalog: PostgresSchemaCatalog,
	constraintCompilers: PostgresConstraintCompilerRegistry,
	schema: CompiledPostgresSchema,
	request: DatabaseOperationRequest,
): SQL | undefined => {
	const operationQuery = readOperationQuery(request.operation)

	const relationCompiler = createPostgresRelationPredicateCompiler(
		catalog,
		constraintCompilers,
		request.relationPredicates ?? [],
	)
	const clauses = compilePostgresQueryClauses(
		readBuiltInQuery(operationQuery),
		schema,
		undefined,
		relationCompiler,
	)
	const contributed = compilePostgresConstraints(
		constraintCompilers,
		schema,
		request.constraints,
	)
	const access =
		request.rowFilter === undefined
			? undefined
			: compilePostgresRowFilter(request.rowFilter, schema)
	let relation: SQL | undefined

	if (request.relation !== undefined) {
		const definition = catalog.getRelation(request.relation)

		if (definition.target.definition !== schema.definition) {
			throw new TypeError('PostgreSQL relational target is invalid')
		}

		relation = compilePostgresRelationPredicate(
			catalog,
			definition,
			request.relation.sourceObjectId,
			schema.table,
		)
	}

	const idField = schema.fields.id

	if (idField === undefined) {
		throw new TypeError('PostgreSQL relational schema is missing its id field')
	}

	const objectId =
		request.operation.kind === 'get'
			? eq(
					idField.column,
					(
						request.operation as Extract<
							ExecutableOperationAst,
							{ readonly kind: 'get' }
						>
					).id,
				)
			: undefined

	return and(clauses.where, contributed, access, relation, objectId)
}

const createRawFilter = (
	catalog: PostgresSchemaCatalog,
	constraintCompilers: PostgresConstraintCompilerRegistry,
	schema: CompiledPostgresSchema,
	request: DatabaseOperationRequest,
): PostgresRelationsFilter =>
	({
		RAW: (table: SchemaEntry): SQL => {
			const rebound = rebindCompiledPostgresSchema(schema, table as PgTable)
			const predicate = compileRequestPredicate(
				catalog,
				constraintCompilers,
				rebound,
				request,
			)

			return predicate ?? sql<boolean>`true`
		},
	}) as unknown as PostgresRelationsFilter

interface CompiledPointerBranch {
	readonly binding: PostgresDrizzlePointerBinding
	readonly plan: DatabasePointerInclusionPlan
	readonly schema: CompiledPostgresSchema
}

const resolvePointerBranches = (
	catalog: PostgresSchemaCatalog,
	source: CompiledPostgresSchema,
	plans: readonly DatabasePointerInclusionPlan[],
): readonly CompiledPointerBranch[] =>
	plans.map((plan) => {
		const target = catalog.get(readOperationSchema(plan.request.operation))
		const pointer = catalog.getPointerDefinition(
			source.definition,
			plan.fieldPath,
			target.definition,
		)
		const binding = catalog.getDrizzlePointer(pointer)

		return immutableRecord({
			binding,
			plan,
			schema: target,
		})
	})

const compileRelationalConfig = (
	catalog: PostgresSchemaCatalog,
	constraintCompilers: PostgresConstraintCompilerRegistry,
	schema: CompiledPostgresSchema,
	request: DatabaseOperationRequest,
	root: boolean,
): AnyDBQueryConfig => {
	const branches = resolvePointerBranches(
		catalog,
		schema,
		request.pointerInclusions ?? [],
	)
	const withConfig = Object.fromEntries(
		branches
			.filter(({ plan }) => plan.unavailable !== true)
			.map(({ binding, plan, schema: target }) => [
				binding.relationName,
				compileRelationalConfig(
					catalog,
					constraintCompilers,
					target,
					plan.request,
					false,
				),
			]),
	)
	const query = readBuiltInQuery(readOperationQuery(request.operation))
	const config: AnyDBQueryConfig = {
		columns: compileColumns(schema, request.operation),
		where: createRawFilter(catalog, constraintCompilers, schema, request),
		...(Object.keys(withConfig).length === 0 ? {} : { with: withConfig }),
		...(query.pagination?.kind === 'offset-pagination'
			? { offset: query.pagination.skip }
			: {}),
	}

	const ordering =
		query.pagination?.kind === 'cursor-pagination'
			? normalizeQueryCursorOrdering(
					query.schema.definition,
					query.ordering.orders,
				)
			: query.ordering

	if (ordering.orders.length > 0) {
		config.orderBy = (table, operators) => {
			const columns = getColumns(table as PgTable)

			return ordering.orders.map(({ direction, field }) => {
				const column = columns[field]

				if (column === undefined) {
					throw new TypeError(
						`PostgreSQL relational ordering field is unavailable: ${field}`,
					)
				}

				// Missing values stay last in both directions so changing direction does
				// not unexpectedly promote incomplete records.
				return direction === 'ascending'
					? operators.sql`${operators.asc(column)} nulls last`
					: operators.sql`${operators.desc(column)} nulls last`
			})
		}
	}
	if (
		root &&
		request.operation.kind === 'find-many' &&
		query.limit !== undefined
	) {
		config.limit = query.limit
	}

	return config
}

const decodeRelationalRecord = (
	catalog: PostgresSchemaCatalog,
	constraintCompilers: PostgresConstraintCompilerRegistry,
	schema: CompiledPostgresSchema,
	request: DatabaseOperationRequest,
	value: unknown,
): DatabaseLogicalRecord => {
	if (!isPlainRecord(value)) {
		throw new TypeError('PostgreSQL relational result must be a record')
	}

	const branches = resolvePointerBranches(
		catalog,
		schema,
		request.pointerInclusions ?? [],
	)
	const relationNames = new Set(
		branches.map(({ binding }) => binding.relationName),
	)
	const row = Object.fromEntries(
		Object.entries(value).filter(([field]) => !relationNames.has(field)),
	)
	const included = new Map<string, DatabaseLogicalRecord | null>()

	for (const branch of branches) {
		const nested: unknown = value[branch.binding.relationName]
		const decoded =
			branch.plan.unavailable === true ||
			nested === null ||
			nested === undefined
				? null
				: decodeRelationalRecord(
						catalog,
						constraintCompilers,
						branch.schema,
						branch.plan.request,
						nested,
					)

		included.set(inclusionPathKey(branch.plan.fieldPath), decoded)
	}

	const decoded = readPostgresRecord(schema, row)
	const query = readOperationQuery(request.operation)
	const selectedFields = query.selection.fields.map(({ field }) => field)
	let record = decoded

	if (selectedFields.length > 0) {
		const projection: Record<string, unknown> = {}

		for (const field of selectedFields) {
			if (!Object.hasOwn(decoded, field)) {
				throw new TypeError(
					`PostgreSQL relational result is missing selected field: ${field}`,
				)
			}

			projection[field] = decoded[field]
		}

		record = immutableRecord(projection)
	}

	postgresRelationalObjectIdentities.set(record, decoded.id)

	postgresIncludedPointers.set(record, included)

	return record
}

/** Executes one validated relational read before applying the shared error boundary. */
const executePostgresRelationalReadRaw = async (
	client: PostgresDrizzleClient,
	catalog: PostgresSchemaCatalog,
	constraintCompilers: PostgresConstraintCompilerRegistry,
	request: DatabaseOperationRequest,
): Promise<unknown> => {
	const operation = request.operation as ExecutableOperationAst

	if (
		operation.kind !== 'find-many' &&
		operation.kind !== 'find-one' &&
		operation.kind !== 'get'
	) {
		throw new TypeError(
			'PostgreSQL relational loading requires a model read operation',
		)
	}

	const schema = catalog.get(readOperationSchema(operation))
	const tableKey = catalog.getDrizzleTableKey(schema)
	const builder = client.query[tableKey] as unknown as
		DynamicRelationalQueryBuilder | undefined

	if (builder === undefined) {
		throw new TypeError('PostgreSQL relational query builder is unavailable')
	}

	const config = compileRelationalConfig(
		catalog,
		constraintCompilers,
		schema,
		request,
		true,
	)
	const raw =
		operation.kind === 'find-many'
			? await builder.findMany(config)
			: await builder.findFirst(config)

	if (operation.kind === 'find-many') {
		if (!isUnknownArray(raw)) {
			throw new TypeError('PostgreSQL relational find-many must return an array')
		}

		return raw.map((record) =>
			decodeRelationalRecord(
				catalog,
				constraintCompilers,
				schema,
				request,
				record,
			),
		)
	}

	return raw === undefined
		? null
		: decodeRelationalRecord(catalog, constraintCompilers, schema, request, raw)
}

/** Executes a relational model read without exposing Drizzle or driver diagnostics. */
export const executePostgresRelationalRead = async (
	client: PostgresDrizzleClient,
	catalog: PostgresSchemaCatalog,
	constraintCompilers: PostgresConstraintCompilerRegistry,
	request: DatabaseOperationRequest,
): Promise<unknown> => {
	try {
		return await executePostgresRelationalReadRaw(
			client,
			catalog,
			constraintCompilers,
			request,
		)
	} catch (error: unknown) {
		throw mapPostgresOperationError(error, request.operation.kind)
	}
}

/** Reads one target retained outside the public logical row. */
export const readPostgresIncludedPointer = (
	record: Readonly<Record<string, unknown>>,
	fieldPath: readonly string[],
): DatabaseLogicalRecord | null | undefined =>
	postgresIncludedPointers.get(record)?.get(inclusionPathKey(fieldPath))

/** Reads identity retained while relational selection removes the private id column. */
export const readPostgresRelationalObjectIdentity = (
	record: Readonly<Record<string, unknown>>,
): unknown => postgresRelationalObjectIdentities.get(record)
