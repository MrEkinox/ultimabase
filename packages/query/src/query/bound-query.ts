import type {
	InferCreateInput,
	InferObject,
	SchemaDefinition,
} from '@ultimabase/schema'
import { immutableRecord } from '@ultimabase/shared'
import type { QueryAst, QueryFieldName } from '../ast/contracts.js'
import type { QueryFilterNode } from '../filters/logical.js'
import type {
	QueryFilterFieldName,
	QueryFilterValue,
	QueryRegexPattern,
} from '../filters/primitive.js'
import type {
	CountOperationAst,
	CreateManyOperationAst,
	CreateOneOperationAst,
	DeleteManyOperationAst,
	DeleteOneOperationAst,
	ExistsOperationAst,
	FindOperationAst,
	FirstOperationAst,
	GetOperationAst,
	ExecutableOperationAst,
	OperationObjectId,
	UpdateManyOperationAst,
	UpdateOneOperationAst,
	UpsertManyOperationAst,
	UpsertOneOperationAst,
} from '../operations/contracts.js'
import {
	normalizeBulkOperationOptions,
	snapshotCreateInputs,
	type BulkOperationOptions,
} from '../operations/bulk.js'
import type {
	QueryExecutorBinding,
	QueryOperationExecutor,
} from '../operations/executor.js'
import type { InferOperationResult } from '../operations/results.js'
import {
	normalizeUniqueUpsertTarget,
	normalizeUpsertInput,
	normalizeUpsertItems,
	type UpsertInput,
	type UpsertManyItemInput,
} from '../operations/upsert.js'
import type {
	UpdateExpression,
	UpdateExpressionInput,
} from '../updates/contracts.js'
import { normalizeUpdateExpression } from '../updates/normalize.js'
import type { Query } from './query.js'
import type { InferQueryResult } from './result.js'
import type { QueryScope } from './scope.js'

type QueryComparisonValue<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> = Exclude<QueryFilterValue<TSchema, TFieldName>, null>

type QueryStringValue<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> = Extract<QueryFilterValue<TSchema, TFieldName>, string>

/** Revalidates the executor at the JavaScript boundary before dispatch. */
const isQueryOperationExecutor = <TSchema extends SchemaDefinition>(
	engine: object,
): engine is QueryOperationExecutor<TSchema> =>
	'execute' in engine && typeof engine.execute === 'function'

/** Retains one Runtime-owned execution binding across immutable query branches. */
export class BoundQuery<
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema> = never,
	TEngine extends QueryExecutorBinding = QueryOperationExecutor<TSchema>,
> {
	readonly #engine: TEngine
	readonly #query: Query<TSchema, TSelectedField>

	constructor(query: Query<TSchema, TSelectedField>, engine: TEngine) {
		this.#query = query
		this.#engine = engine

		// A bound branch cannot acquire mutable execution or query state later.
		Object.freeze(this)
	}

	/** Exposes the exact engine retained for terminal execution. */
	get engine(): TEngine {
		return this.#engine
	}

	/** Exposes the reusable unbound query without copying its immutable AST. */
	get unbound(): Query<TSchema, TSelectedField> {
		return this.#query
	}

	/** Exposes the shared transport-neutral representation. */
	get ast(): QueryAst<TSchema, QueryFilterNode<TSchema>> {
		return this.#query.ast
	}

	/** Returns the exact schema retained by the underlying query. */
	get schema(): TSchema {
		return this.#query.schema
	}

	/** Adds selected fields while preserving the Runtime binding. */
	select<const TField extends QueryFieldName<TSchema>>(
		...fields: readonly TField[]
	): BoundQuery<TSchema, TSelectedField | TField, TEngine> {
		return this.#branch(this.#query.select(...fields))
	}

	/** Appends ascending order terms on a new bound branch. */
	ascending(
		...fields: readonly QueryFieldName<TSchema>[]
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.ascending(...fields))
	}

	/** Appends descending order terms on a new bound branch. */
	descending(
		...fields: readonly QueryFieldName<TSchema>[]
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.descending(...fields))
	}

	/** Defines the page size on a new bound branch. */
	limit(value: number): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.limit(value))
	}

	/** Selects offset pagination on a new bound branch. */
	skip(value: number): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.skip(value))
	}

	/** Selects the first or a resumed cursor page on a new bound branch. */
	after(cursor?: string): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.after(cursor))
	}

	/**
	 * Adds the exact object identifier while preserving this execution binding.
	 *
	 * @example `query.byId(post.id).deleteOne()`
	 */
	byId(
		id: OperationObjectId<TSchema>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.byId(id))
	}

	/** Adds an equality condition on a new bound branch. */
	equalTo<TFieldName extends QueryFilterFieldName<TSchema, 'equal'>>(
		fieldName: TFieldName,
		value: QueryFilterValue<TSchema, TFieldName>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.equalTo(fieldName, value))
	}

	/** Adds an inequality condition on a new bound branch. */
	notEqualTo<TFieldName extends QueryFilterFieldName<TSchema, 'not-equal'>>(
		fieldName: TFieldName,
		value: QueryFilterValue<TSchema, TFieldName>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.notEqualTo(fieldName, value))
	}

	/** Adds a strict lower comparison on a new bound branch. */
	greaterThan<TFieldName extends QueryFilterFieldName<TSchema, 'greater-than'>>(
		fieldName: TFieldName,
		value: QueryComparisonValue<TSchema, TFieldName>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.greaterThan(fieldName, value))
	}

	/** Adds an inclusive lower comparison on a new bound branch. */
	greaterThanOrEqualTo<
		TFieldName extends QueryFilterFieldName<TSchema, 'greater-than-or-equal'>,
	>(
		fieldName: TFieldName,
		value: QueryComparisonValue<TSchema, TFieldName>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.greaterThanOrEqualTo(fieldName, value))
	}

	/** Adds a strict upper comparison on a new bound branch. */
	lessThan<TFieldName extends QueryFilterFieldName<TSchema, 'less-than'>>(
		fieldName: TFieldName,
		value: QueryComparisonValue<TSchema, TFieldName>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.lessThan(fieldName, value))
	}

	/** Adds an inclusive upper comparison on a new bound branch. */
	lessThanOrEqualTo<
		TFieldName extends QueryFilterFieldName<TSchema, 'less-than-or-equal'>,
	>(
		fieldName: TFieldName,
		value: QueryComparisonValue<TSchema, TFieldName>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.lessThanOrEqualTo(fieldName, value))
	}

	/** Adds an inclusion condition on a new bound branch. */
	containedIn<TFieldName extends QueryFilterFieldName<TSchema, 'in'>>(
		fieldName: TFieldName,
		values: readonly QueryFilterValue<TSchema, TFieldName>[],
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.containedIn(fieldName, values))
	}

	/** Adds an exclusion condition on a new bound branch. */
	notContainedIn<TFieldName extends QueryFilterFieldName<TSchema, 'not-in'>>(
		fieldName: TFieldName,
		values: readonly QueryFilterValue<TSchema, TFieldName>[],
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.notContainedIn(fieldName, values))
	}

	/** Adds a substring condition on a new bound branch. */
	contains<TFieldName extends QueryFilterFieldName<TSchema, 'contains'>>(
		fieldName: TFieldName,
		value: QueryStringValue<TSchema, TFieldName>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.contains(fieldName, value))
	}

	/** Adds a prefix condition on a new bound branch. */
	startsWith<TFieldName extends QueryFilterFieldName<TSchema, 'starts-with'>>(
		fieldName: TFieldName,
		value: QueryStringValue<TSchema, TFieldName>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.startsWith(fieldName, value))
	}

	/** Adds a suffix condition on a new bound branch. */
	endsWith<TFieldName extends QueryFilterFieldName<TSchema, 'ends-with'>>(
		fieldName: TFieldName,
		value: QueryStringValue<TSchema, TFieldName>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.endsWith(fieldName, value))
	}

	/** Adds an inert regular-expression condition on a new bound branch. */
	matches(
		fieldName: QueryFilterFieldName<TSchema, 'regex'>,
		pattern: QueryRegexPattern,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.matches(fieldName, pattern))
	}

	/** Adds a field-presence condition or executes the zero-argument terminal. */
	exists(
		fieldName: QueryFilterFieldName<TSchema, 'exists'>,
	): BoundQuery<TSchema, TSelectedField, TEngine>

	exists(): Promise<boolean>

	exists(
		fieldName?: QueryFilterFieldName<TSchema, 'exists'>,
	): BoundQuery<TSchema, TSelectedField, TEngine> | Promise<boolean> {
		if (fieldName !== undefined) {
			return this.#branch(this.#query.exists(fieldName))
		}

		const operation: ExistsOperationAst<
			TSchema,
			QueryFilterNode<TSchema>,
			TSelectedField
		> = immutableRecord({ kind: 'exists', query: this.ast })

		return this.#execute(operation)
	}

	/** Adds a negative field-presence condition on a new bound branch. */
	doesNotExist(
		fieldName: QueryFilterFieldName<TSchema, 'exists'>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.doesNotExist(fieldName))
	}

	/** Combines a reusable query filter through AND without changing this selection. */
	and<TOtherSelection extends QueryFieldName<TSchema>>(
		query: Query<TSchema, TOtherSelection>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.and(query))
	}

	/** Combines a reusable query filter through OR without changing this selection. */
	or<TOtherSelection extends QueryFieldName<TSchema>>(
		query: Query<TSchema, TOtherSelection>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.or(query))
	}

	/** Negates a reusable query filter without changing this selection. */
	not<TOtherSelection extends QueryFieldName<TSchema>>(
		query: Query<TSchema, TOtherSelection>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.not(query))
	}

	/** Applies an unbound scope and restores this branch's execution owner. */
	use(
		scope: QueryScope<TSchema>,
	): BoundQuery<TSchema, TSelectedField, TEngine> {
		return this.#branch(this.#query.use(scope))
	}

	/** Executes a collection read through the bound Runtime engine. */
	find(): Promise<readonly InferQueryResult<TSchema, TSelectedField>[]> {
		const operation: FindOperationAst<
			TSchema,
			QueryFilterNode<TSchema>,
			TSelectedField
		> = immutableRecord({ kind: 'find', query: this.ast })

		return this.#execute(operation)
	}

	/** Executes a nullable first-match read through the bound Runtime engine. */
	first(): Promise<InferQueryResult<TSchema, TSelectedField> | null> {
		const operation: FirstOperationAst<
			TSchema,
			QueryFilterNode<TSchema>,
			TSelectedField
		> = immutableRecord({ kind: 'first', query: this.ast })

		return this.#execute(operation)
	}

	/** Reads one identifier while retaining this query's selection and filters. */
	get(
		id: OperationObjectId<TSchema>,
	): Promise<InferQueryResult<TSchema, TSelectedField> | null> {
		const operation: GetOperationAst<
			TSchema,
			QueryFilterNode<TSchema>,
			TSelectedField
		> = immutableRecord({ kind: 'get', query: this.ast, id })

		return this.#execute(operation)
	}

	/** Counts matches without loading their persisted object values. */
	count(): Promise<number> {
		const operation: CountOperationAst<
			TSchema,
			QueryFilterNode<TSchema>,
			TSelectedField
		> = immutableRecord({ kind: 'count', query: this.ast })

		return this.#execute(operation)
	}

	/** Creates one object from schema-derived input through the bound engine. */
	createOne(input: InferCreateInput<TSchema>): Promise<InferObject<TSchema>> {
		const operation: CreateOneOperationAst<TSchema> = immutableRecord({
			kind: 'create-one',
			schema: this.ast.schema,
			input,
		})

		return this.#execute(operation)
	}

	/** Provides the concise Parse-inspired alias for singular creation. */
	create(input: InferCreateInput<TSchema>): Promise<InferObject<TSchema>> {
		return this.createOne(input)
	}

	/** Creates objects in input order and uses one transaction unless opted out. */
	createMany(
		inputs: readonly InferCreateInput<TSchema>[],
		options?: BulkOperationOptions,
	): Promise<readonly InferObject<TSchema>[]> {
		const operation: CreateManyOperationAst<TSchema> = immutableRecord({
			kind: 'create-many',
			schema: this.ast.schema,
			inputs: snapshotCreateInputs(inputs),
			options: normalizeBulkOperationOptions(options),
		})

		return this.#execute(operation)
	}

	/** Normalizes and executes one atomic update against the first match. */
	updateOne(
		input: UpdateExpressionInput<TSchema> & {},
	): Promise<InferQueryResult<TSchema, TSelectedField> | null> {
		const operation: UpdateOneOperationAst<
			TSchema,
			UpdateExpression<TSchema>,
			QueryFilterNode<TSchema>,
			TSelectedField
		> = immutableRecord({
			kind: 'update-one',
			query: this.ast,
			update: normalizeUpdateExpression(this.schema, input),
		})

		return this.#execute(operation)
	}

	/** Applies one normalized expression to every match and returns its count. */
	updateMany(input: UpdateExpressionInput<TSchema> & {}): Promise<number> {
		const operation: UpdateManyOperationAst<
			TSchema,
			UpdateExpression<TSchema>,
			QueryFilterNode<TSchema>,
			TSelectedField
		> = immutableRecord({
			kind: 'update-many',
			query: this.ast,
			update: normalizeUpdateExpression(this.schema, input),
		})

		return this.#execute(operation)
	}

	/** Updates one unique match or creates it while retaining query selection. */
	upsertOne(
		input: UpsertInput<TSchema> & {},
	): Promise<InferQueryResult<TSchema, TSelectedField>> {
		const normalizedInput = normalizeUpsertInput(this.schema, input)
		const operation: UpsertOneOperationAst<
			TSchema,
			UpdateExpression<TSchema>,
			QueryFilterNode<TSchema>,
			TSelectedField
		> = immutableRecord({
			kind: 'upsert-one',
			query: this.ast,
			target: normalizeUniqueUpsertTarget(this.schema, this.ast),
			...normalizedInput,
		})

		return this.#execute(operation)
	}

	/** Provides the concise alias for the singular unique-target operation. */
	upsert(
		input: UpsertInput<TSchema> & {},
	): Promise<InferQueryResult<TSchema, TSelectedField>> {
		return this.upsertOne(input)
	}

	/** Upserts independently targeted items in input order, atomically by default. */
	upsertMany(
		inputs: readonly UpsertManyItemInput<TSchema>[],
		options?: BulkOperationOptions,
	): Promise<readonly InferObject<TSchema>[]> {
		const operation: UpsertManyOperationAst<
			TSchema,
			UpdateExpression<TSchema>,
			QueryFilterNode<TSchema>
		> = immutableRecord({
			kind: 'upsert-many',
			schema: this.ast.schema,
			items: normalizeUpsertItems(this.schema, inputs),
			options: normalizeBulkOperationOptions(options),
		})

		return this.#execute(operation)
	}

	/** Deletes and returns the first match, or null when no object matches. */
	deleteOne(): Promise<InferQueryResult<TSchema, TSelectedField> | null> {
		const operation: DeleteOneOperationAst<
			TSchema,
			QueryFilterNode<TSchema>,
			TSelectedField
		> = immutableRecord({ kind: 'delete-one', query: this.ast })

		return this.#execute(operation)
	}

	/** Deletes every match without loading objects and returns its count. */
	deleteMany(): Promise<number> {
		const operation: DeleteManyOperationAst<
			TSchema,
			QueryFilterNode<TSchema>,
			TSelectedField
		> = immutableRecord({ kind: 'delete-many', query: this.ast })

		return this.#execute(operation)
	}

	#execute<const TOperation extends ExecutableOperationAst<TSchema>>(
		operation: TOperation,
	): Promise<InferOperationResult<TOperation>> {
		if (!isQueryOperationExecutor<TSchema>(this.#engine)) {
			throw new TypeError('bound query engine cannot execute operations')
		}

		return this.#engine.execute(operation)
	}

	#branch<TNextSelection extends QueryFieldName<TSchema>>(
		query: Query<TSchema, TNextSelection>,
	): BoundQuery<TSchema, TNextSelection, TEngine> {
		return new BoundQuery(query, this.#engine)
	}
}
