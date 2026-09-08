import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import {
	createSchemaRecord,
	upsertSchemaRecord,
} from '../../query/operations/schema-command-execution.js'
import type { SchemaWhereInput } from '../../query/operations/schema-commands.js'
import type { OperationOptions } from '../../query/operations/options.js'
import type { WhereInput } from '../../query/filters/where.js'
import {
	normalizeQuerySelection,
	type QuerySelection,
} from '../../query/clauses/selection.js'
import {
	executeQueryDeleteOne,
	executeQueryExists,
	executeQueryGet,
	executeQueryUpdateOne,
} from '../../query/query/operation-execution.js'
import { scopeQueryToObjectId } from '../../query/query/private-scope.js'
import { hydrateQueryFromAst, QueryBuilder } from '../../query/query/query.js'
import type { UpdateExpressionInput } from '../../query/updates/contracts.js'
import { Pointer } from '../relations/pointer.js'
import { createRelationHandle, type Relation } from '../relations/relation.js'
import type { SchemaDefinition } from './definition.js'
import type { SchemaModelState } from './model-contracts.js'
import {
	assertSchemaModelState,
	findSchemaModelRecord,
	readPersistedSchemaModelRecord,
	readSchemaModelRecord,
	retainSchemaModelRecord,
	type SchemaModelRecord,
} from './model-state.js'

interface NormalizedSchemaDraftUpsertInput {
	readonly select?: QuerySelection<SchemaDefinition>
	readonly update: UpdateExpressionInput<SchemaDefinition> & {}
	readonly where: SchemaWhereInput<SchemaDefinition>
}

interface NormalizedSchemaModelSelectionInput {
	readonly select?: QuerySelection<SchemaDefinition>
}

interface NormalizedSchemaModelUpdateInput extends NormalizedSchemaModelSelectionInput {
	readonly data: UpdateExpressionInput<SchemaDefinition> & {}
}

/** Erases schema variance only inside the private model-to-QueryBuilder delegation. */
interface SchemaModelQuery {
	readonly ast: QueryBuilder<SchemaDefinition>['ast']
	readonly schema: SchemaDefinition
}

const createSchemaModelQuery = (
	schema: SchemaDefinition,
): QueryBuilder<SchemaDefinition> =>
	// Public model types validate exact fields before this private variance boundary.
	new QueryBuilder(schema)

const selectSchemaModelQuery = (
	query: SchemaModelQuery,
	selection?: QuerySelection<SchemaDefinition>,
): SchemaModelQuery => {
	if (selection === undefined) {
		return query
	}

	return hydrateQueryFromAst<SchemaDefinition, never>(
		immutableRecord({
			...query.ast,
			selection: normalizeQuerySelection(query.schema, selection),
		}),
	)
}

const readSchemaModelSelectionInput = (
	input: unknown,
	command: 'create' | 'delete' | 'fetch',
): NormalizedSchemaModelSelectionInput => {
	if (!isPlainRecord(input)) {
		throw new TypeError(`Schema model ${command} input must be a plain object`)
	}

	for (const key of Object.keys(input)) {
		if (key !== 'select') {
			throw new TypeError(
				`Schema model ${command} input contains unknown key: ${key}`,
			)
		}
	}

	return immutableRecord({
		...(Object.hasOwn(input, 'select')
			? { select: input.select as QuerySelection<SchemaDefinition> }
			: {}),
	})
}

const readSchemaModelUpdateInput = (
	input: unknown,
): NormalizedSchemaModelUpdateInput => {
	if (!isPlainRecord(input)) {
		throw new TypeError('Schema model update input must be a plain object')
	}

	for (const key of Object.keys(input)) {
		if (key !== 'data' && key !== 'select') {
			throw new TypeError(
				`Schema model update input contains unknown key: ${key}`,
			)
		}
	}

	if (!Object.hasOwn(input, 'data')) {
		throw new TypeError('Schema model update input must contain data')
	}

	return immutableRecord({
		data: input.data as UpdateExpressionInput<SchemaDefinition> & {},
		...(Object.hasOwn(input, 'select')
			? { select: input.select as QuerySelection<SchemaDefinition> }
			: {}),
	})
}

const readSchemaDraftUpsertInput = (
	input: unknown,
): NormalizedSchemaDraftUpsertInput => {
	if (!isPlainRecord(input)) {
		throw new TypeError('Schema model upsert input must be a plain object')
	}

	for (const key of Object.keys(input)) {
		if (key !== 'select' && key !== 'update' && key !== 'where') {
			throw new TypeError(
				`Schema model upsert input contains unknown key: ${key}`,
			)
		}
	}

	if (!Object.hasOwn(input, 'update') || !Object.hasOwn(input, 'where')) {
		throw new TypeError(
			'Schema model upsert input must contain update and where',
		)
	}

	if (typeof input.where !== 'function' && !isPlainRecord(input.where)) {
		throw new TypeError(
			'Schema model upsert where must be an object or function',
		)
	}

	return immutableRecord({
		...(Object.hasOwn(input, 'select')
			? { select: input.select as QuerySelection<SchemaDefinition> }
			: {}),
		update: input.update as UpdateExpressionInput<SchemaDefinition> & {},
		where: input.where as SchemaWhereInput<SchemaDefinition>,
	})
}

/** Restores the exact protected target without deriving identity from visible values. */
const createPersistedModelQuery = (
	record: SchemaModelRecord & { readonly objectId: unknown },
	selection?: QuerySelection<SchemaDefinition>,
): SchemaModelQuery => {
	if (typeof record.objectId !== 'string') {
		throw new TypeError('Persisted schema model has an invalid object identity')
	}

	// Mutation results intentionally ignore the receiver's read projection.
	const query = selectSchemaModelQuery(
		createSchemaModelQuery(record.schema).where({
			id: { eq: record.objectId },
		} as unknown as WhereInput<typeof record.schema>),
		selection,
	)

	return scopeQueryToObjectId(query, record.objectId, {
		protectedPolicyDeniedAsMissing: true,
	})
}

/** Defends the private strict-target invariant at the generic nullable query boundary. */
const requirePersistedMutationResult = async (
	result: Promise<object | null>,
	command: 'delete' | 'update',
): Promise<object> => {
	const item = await result

	if (item === null) {
		throw new TypeError(`Persisted schema model ${command} returned no target`)
	}

	return item
}

/** Owns the common runtime behavior without becoming the public model identity. */
export class SchemaModelPrototype {
	constructor(
		schema: SchemaDefinition,
		values: Readonly<Record<string, unknown>>,
		state: SchemaModelState,
		objectId?: unknown,
		selectedFields?: readonly string[],
	) {
		retainSchemaModelRecord(this, {
			objectId,
			schema,
			selectedFields,
			state,
			values,
		})

		for (const [field, value] of Object.entries(values)) {
			Object.defineProperty(this, field, {
				configurable: false,
				enumerable: true,
				value,
				writable: false,
			})
		}

		Object.freeze(this)
	}

	get(field: string): unknown {
		const { values } = readSchemaModelRecord(this)

		if (!Object.hasOwn(values, field)) {
			throw new TypeError(`Schema model field is not visible: ${field}`)
		}

		return values[field]
	}

	toJSON(): Readonly<Record<string, unknown>> {
		return immutableRecord(readSchemaModelRecord(this).values)
	}

	/** Creates one handle only from trusted persisted state and protected identity. */
	relation(fieldName: string): Relation {
		const record = readPersistedSchemaModelRecord(this, 'relation')

		return createRelationHandle(record.schema, fieldName, record.objectId)
	}

	/** Reloads one trusted identity through the ordinary read pipeline. */
	async fetch(input: unknown, options?: OperationOptions): Promise<object> {
		const record = readPersistedSchemaModelRecord(this, 'fetch')

		if (typeof record.objectId !== 'string') {
			throw new TypeError(
				'Schema model fetch has an invalid persisted identity',
			)
		}

		const normalized = readSchemaModelSelectionInput(input, 'fetch')
		const query = createPersistedModelQuery(record, normalized.select)

		return executeQueryGet(
			query as QueryBuilder<SchemaDefinition>,
			record.objectId,
			options,
		)
	}

	/** Tests one trusted identity through the ordinary read pipeline. */
	exists(options?: OperationOptions): Promise<boolean> {
		const record = readPersistedSchemaModelRecord(this, 'exists')

		return executeQueryExists(
			createPersistedModelQuery(record) as QueryBuilder<SchemaDefinition>,
			options,
		)
	}

	/** Detaches one exact pointer from protected identity without performing I/O. */
	toPointer(): Pointer {
		const record = readPersistedSchemaModelRecord(this, 'toPointer')

		if (typeof record.objectId !== 'string') {
			throw new TypeError(
				'Schema model toPointer has an invalid persisted identity',
			)
		}

		return new Pointer(record.schema, record.objectId)
	}

	/** Compares only trusted schema-qualified identities without performing I/O. */
	equals(other: unknown): boolean {
		const record = readPersistedSchemaModelRecord(this, 'equals')

		if (Pointer.is(other)) {
			return other.schema === record.schema && other.id === record.objectId
		}

		if (typeof other !== 'object' || other === null) {
			return false
		}

		const otherRecord = findSchemaModelRecord(other)

		return (
			otherRecord?.state === 'persisted' &&
			otherRecord.schema === record.schema &&
			otherRecord.objectId === record.objectId
		)
	}

	/** Persists only trusted draft state through the ordinary schema create operation. */
	create(input: unknown, options?: OperationOptions): Promise<object> {
		const record = readSchemaModelRecord(this)

		assertSchemaModelState(record, 'draft', 'create')
		const normalized = readSchemaModelSelectionInput(input, 'create')

		return createSchemaRecord(
			record.schema,
			{ data: record.values, ...normalized },
			options,
			'flat',
		)
	}

	/** Resolves one unique conflict target without retaining execution on the model. */
	upsert(input: unknown, options?: OperationOptions): Promise<object> {
		const record = readSchemaModelRecord(this)

		assertSchemaModelState(record, 'draft', 'upsert')
		const normalized = readSchemaDraftUpsertInput(input)
		return upsertSchemaRecord(
			record.schema,
			{
				where: normalized.where,
				create: record.values,
				...(normalized.select === undefined
					? {}
					: { select: normalized.select }),
				update: normalized.update,
			},
			options,
		)
	}

	/** Targets only Runtime-issued object identity and never a visible caller field. */
	async update(input: unknown, options?: OperationOptions): Promise<object> {
		const record = readPersistedSchemaModelRecord(this, 'update')
		const normalized = readSchemaModelUpdateInput(input)

		return requirePersistedMutationResult(
			executeQueryUpdateOne(
				createPersistedModelQuery(record, normalized.select),
				normalized.data,
				options,
			),
			'update',
		)
	}

	/** Deletes only Runtime-issued object identity through QueryBuilder's singular alias. */
	async delete(input: unknown, options?: OperationOptions): Promise<object> {
		const record = readPersistedSchemaModelRecord(this, 'delete')
		const normalized = readSchemaModelSelectionInput(input, 'delete')

		return requirePersistedMutationResult(
			executeQueryDeleteOne(
				createPersistedModelQuery(record, normalized.select),
				options,
			),
			'delete',
		)
	}
}
