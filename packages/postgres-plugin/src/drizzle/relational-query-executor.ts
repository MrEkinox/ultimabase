import type {
	DatabaseInclusionPlan,
	DatabaseLogicalRecord,
	DatabaseOperationRequest,
	ExecutableOperationAst,
	QueryAst,
} from '@ultimabase/core'
import {
	immutableArray,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import {
	and,
	eq,
	getColumns,
	sql,
	type AnyDBQueryConfig,
	type SchemaEntry,
	type SQL,
} from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'

import {
	compilePostgresQueryClauses,
	selectPostgresFieldNames,
} from '../query/clause-compiler.js'
import { compilePostgresRowFilter } from '../query/filter-compiler.js'
import {
	compilePostgresRelationPredicate,
	type PostgresDrizzleRelationsFilter,
} from '../query/relation-compiler.js'
import {
	createPostgresRelationPredicateCompiler,
	rebindCompiledPostgresSchema,
} from '../query/relation-predicate-compiler.js'
import { required } from '../required.js'
import type { PostgresSchemaCatalog } from '../schema/catalog.js'
import type { CompiledPostgresSchema } from '../schema/contracts.js'
import type { PostgresDrizzleClient } from './client.js'
import { mapPostgresOperationError } from './operation-error.js'
import { readPostgresPersistenceOperation } from './persistence-plan.js'
import { projectPostgresRecord, readPostgresRecord } from './record.js'

interface DynamicRelationalQueryBuilder {
	findFirst(config: AnyDBQueryConfig): Promise<unknown>
	findMany(config: AnyDBQueryConfig): Promise<unknown>
}

type PostgresIncludedValue =
	DatabaseLogicalRecord | readonly DatabaseLogicalRecord[] | null

/** Resolves one request level and its available inclusions once per read. */
interface RelationalReadPlan {
	readonly branches: readonly RelationalReadBranch[]
	readonly operation: ExecutableOperationAst
	readonly query: QueryAst
	readonly request: DatabaseOperationRequest
	readonly schema: CompiledPostgresSchema
}

interface RelationalReadBranch {
	readonly plan: DatabaseInclusionPlan
	/** Absent when protected policy denied loading this inclusion. */
	readonly read: RelationalReadPlan | undefined
	readonly relationName: string
}

const postgresIncludedValues = new WeakMap<
	object,
	ReadonlyMap<string, PostgresIncludedValue>
>()
const postgresRelationalObjectIdentities = new WeakMap<object, unknown>()

const readOperationQuery = (operation: ExecutableOperationAst): QueryAst => {
	const query: unknown = 'query' in operation ? operation.query : undefined

	if (
		!('query' in operation) ||
		!isPlainRecord(query) ||
		!isPlainRecord(query.schema) ||
		!('definition' in query.schema)
	) {
		throw new TypeError('PostgreSQL relational read operation has no schema')
	}

	return operation.query
}

/** Reads the adapter-facing operation without consulting logical projections. */
const createReadPlan = (
	catalog: PostgresSchemaCatalog,
	schema: CompiledPostgresSchema,
	request: DatabaseOperationRequest,
): RelationalReadPlan => {
	const operation = readPostgresPersistenceOperation(
		request.operation,
		request.plan,
	)
	const branches = (request.inclusions ?? []).map((plan) => {
		const targetOperation = readPostgresPersistenceOperation(
			plan.request.operation,
			plan.request.plan,
		)
		const target = catalog.get(
			readOperationQuery(targetOperation).schema.definition,
		)
		const relationName =
			plan.kind === 'pointer'
				? catalog.getDrizzlePointer(
						catalog.getPointerDefinition(
							schema.definition,
							plan.fieldPath,
							target.definition,
						),
					).relationName
				: catalog.getDrizzleRelation(
						catalog.getRelationDefinition(
							schema.definition,
							plan.fieldPath,
							target.definition,
						),
					).sourceRelationName

		return { plan, relationName, target }
	})

	return {
		branches: branches.map(({ plan, relationName, target }) => ({
			plan,
			read:
				plan.unavailable === true
					? undefined
					: createReadPlan(catalog, target, plan.request),
			relationName,
		})),
		operation,
		query: readOperationQuery(operation),
		request,
		schema,
	}
}

const compileRequestPredicate = (
	catalog: PostgresSchemaCatalog,
	schema: CompiledPostgresSchema,
	{ operation, query, request }: RelationalReadPlan,
): SQL | undefined => {
	const relationCompiler = createPostgresRelationPredicateCompiler(
		catalog,
		request.relationPredicates ?? [],
	)
	const clauses = compilePostgresQueryClauses(query, schema, relationCompiler)
	const access =
		request.rowFilter === undefined
			? undefined
			: compilePostgresRowFilter(request.rowFilter, schema, relationCompiler)
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

	const idField = required(
		schema.fields.id,
		'PostgreSQL relational schema is missing its id field',
	)
	const objectId =
		operation.kind === 'get' ? eq(idField.column, operation.id) : undefined

	return and(clauses.where, access, relation, objectId)
}

const compileRelationalConfig = (
	catalog: PostgresSchemaCatalog,
	read: RelationalReadPlan,
): AnyDBQueryConfig => {
	const withConfig = Object.fromEntries(
		read.branches.flatMap(({ read: branch, relationName }) =>
			branch === undefined
				? []
				: [[relationName, compileRelationalConfig(catalog, branch)]],
		),
	)
	const { operation, query } = read
	// Drizzle hands RAW the query-local alias of this generated table.
	const where = {
		RAW: (table: SchemaEntry): SQL =>
			compileRequestPredicate(
				catalog,
				rebindCompiledPostgresSchema(read.schema, table as PgTable),
				read,
			) ?? sql<boolean>`true`,
	} as unknown as PostgresDrizzleRelationsFilter
	const orders = query.ordering.orders

	return {
		columns: Object.fromEntries(
			selectPostgresFieldNames(query.selection, read.schema).map((name) => [
				name,
				true,
			]),
		),
		where,
		...(Object.keys(withConfig).length === 0 ? {} : { with: withConfig }),
		...(query.pagination?.kind === 'offset-pagination'
			? { offset: query.pagination.offset }
			: {}),
		...(orders.length === 0
			? {}
			: {
					orderBy: (table, operators) => {
						const columns = getColumns(table as PgTable)

						return orders.map(({ direction, field }) => {
							const column = required(
								columns[field],
								`PostgreSQL relational ordering field is unavailable: ${field}`,
							)

							// Missing values stay last in both directions so changing direction does
							// not unexpectedly promote incomplete records.
							return direction === 'ascending'
								? operators.sql`${operators.asc(column)} nulls last`
								: operators.sql`${operators.desc(column)} nulls last`
						})
					},
				}),
		...(operation.kind === 'find-many' && query.limit !== undefined
			? { limit: query.limit }
			: {}),
	}
}

const decodeRelationalRecord = (
	read: RelationalReadPlan,
	value: unknown,
): DatabaseLogicalRecord => {
	if (!isPlainRecord(value)) {
		throw new TypeError('PostgreSQL relational result must be a record')
	}

	const relationNames = new Set(
		read.branches.map(({ relationName }) => relationName),
	)
	const included = new Map<string, PostgresIncludedValue>()

	for (const { plan, read: branch, relationName } of read.branches) {
		const nested: unknown = value[relationName]
		let decoded: PostgresIncludedValue

		if (plan.kind === 'pointer') {
			decoded =
				branch === undefined || nested === null || nested === undefined
					? null
					: decodeRelationalRecord(branch, nested)
		} else if (branch === undefined) {
			decoded = immutableArray([])
		} else {
			if (!isUnknownArray(nested)) {
				throw new TypeError(
					'PostgreSQL relational inclusion must return an array',
				)
			}

			decoded = immutableArray(
				nested.map((record) => decodeRelationalRecord(branch, record)),
			)
		}

		included.set(JSON.stringify(plan.fieldPath), decoded)
	}

	const decoded = readPostgresRecord(
		read.schema,
		Object.fromEntries(
			Object.entries(value).filter(([field]) => !relationNames.has(field)),
		),
	)
	const record = projectPostgresRecord(
		decoded,
		read.query.selection,
		'PostgreSQL relational result is missing selected field',
	)

	postgresRelationalObjectIdentities.set(record, decoded.id)
	postgresIncludedValues.set(record, included)

	return record
}

/** Executes a relational model read without exposing Drizzle or driver diagnostics. */
export const executePostgresRelationalRead = async (
	client: PostgresDrizzleClient,
	catalog: PostgresSchemaCatalog,
	request: DatabaseOperationRequest,
): Promise<unknown> => {
	try {
		const operation = readPostgresPersistenceOperation(
			request.operation,
			request.plan,
		)

		if (
			operation.kind !== 'find-many' &&
			operation.kind !== 'find-one' &&
			operation.kind !== 'get'
		) {
			throw new TypeError(
				'PostgreSQL relational loading requires a model read operation',
			)
		}

		const schema = catalog.get(readOperationQuery(operation).schema.definition)
		const builder = required(
			// Generated table keys are absent from Drizzle's static query map type.
			client.query[catalog.getDrizzleTableKey(schema)] as unknown as
				DynamicRelationalQueryBuilder | undefined,
			'PostgreSQL relational query builder is unavailable',
		)
		const read = createReadPlan(catalog, schema, request)
		const config = compileRelationalConfig(catalog, read)

		if (operation.kind === 'find-many') {
			const raw = await builder.findMany(config)

			if (!isUnknownArray(raw)) {
				throw new TypeError(
					'PostgreSQL relational find-many must return an array',
				)
			}

			return raw.map((record) => decodeRelationalRecord(read, record))
		}

		const raw = await builder.findFirst(config)

		return raw === undefined ? null : decodeRelationalRecord(read, raw)
	} catch (error: unknown) {
		throw mapPostgresOperationError(error, request.operation.kind)
	}
}

/** Reads one target retained outside the public logical row. */
export const readPostgresIncludedValue = (
	record: Readonly<Record<string, unknown>>,
	fieldPath: readonly string[],
): PostgresIncludedValue | undefined =>
	postgresIncludedValues.get(record)?.get(JSON.stringify(fieldPath))

/** Reads identity retained while relational selection removes the private id column. */
export const readPostgresRelationalObjectIdentity = (
	record: Readonly<Record<string, unknown>>,
): unknown => postgresRelationalObjectIdentities.get(record)
