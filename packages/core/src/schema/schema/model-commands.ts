import { createPointer } from '../relations/pointer.js'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { assertExactEnumerablePlainObject } from '../../exact-object-validation.js'

import {
	createSchemaRecord,
	upsertSchemaRecord,
} from '../../query/operations/schema-command-execution.js'
import { assertOperationExecutionOwnerToken } from '../../query/operations/execution.js'
import type { SchemaWhereInput } from '../../query/operations/schema-commands.js'
import type { OperationOptions } from '../../query/operations/options.js'
import type { QuerySelection } from '../../query/clauses/selection.js'
import {
	executeQueryDeleteOne,
	executeQueryExists,
	executeQueryGet,
	executeQueryUpdateOne,
} from '../../query/query/operation-execution.js'
import { scopeQueryToObjectId } from '../../query/query/private-scope.js'
import {
	queryFromFindOneInput,
	type NormalizedQueryInput,
} from '../../query/query/input.js'
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

/** Rejects non-object inputs and keys that one instance command does not accept. */
const readCommandInput = (
	input: unknown,
	command: string,
	keys: readonly string[],
): Readonly<Record<string, unknown>> => {
	assertExactEnumerablePlainObject(
		input,
		new Set(keys),
		`Schema model ${command} input must be a plain object`,
		`Schema model ${command} input contains unknown key: `,
	)
	return input
}

/** Retains only an explicitly supplied result projection. */
const readSelection = (
	input: Readonly<Record<string, unknown>>,
): { readonly select?: QuerySelection<SchemaDefinition> } =>
	Object.hasOwn(input, 'select')
		? { select: input.select as QuerySelection<SchemaDefinition> }
		: {}

/** Restores the exact protected target without deriving identity from visible values. */
const createPersistedModelQuery = (
	record: SchemaModelRecord & { readonly objectId: unknown },
	selection?: QuerySelection<SchemaDefinition>,
): NormalizedQueryInput<SchemaDefinition> => {
	if (typeof record.objectId !== 'string') {
		throw new TypeError('Persisted schema model has an invalid object identity')
	}

	// Mutation results intentionally ignore the receiver's read projection.
	const query = queryFromFindOneInput(record.schema, {
		where: { id: { eq: record.objectId } },
		...(selection === undefined ? {} : { select: selection }),
	})

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

		return createRelationHandle(
			record.schema,
			fieldName,
			record.objectId,
			record.ownerToken,
		)
	}

	/** Reloads one trusted identity through the ordinary read pipeline. */
	async fetch(input: unknown, options?: OperationOptions): Promise<object> {
		const record = readPersistedSchemaModelRecord(this, 'fetch')
		assertOperationExecutionOwnerToken(record.ownerToken, options)

		if (typeof record.objectId !== 'string') {
			throw new TypeError(
				'Schema model fetch has an invalid persisted identity',
			)
		}

		const { select } = readSelection(
			readCommandInput(input, 'fetch', ['select']),
		)
		const query = createPersistedModelQuery(record, select)

		return executeQueryGet(query, record.objectId, options)
	}

	/** Tests one trusted identity through the ordinary read pipeline. */
	exists(options?: OperationOptions): Promise<boolean> {
		const record = readPersistedSchemaModelRecord(this, 'exists')
		assertOperationExecutionOwnerToken(record.ownerToken, options)

		return executeQueryExists(createPersistedModelQuery(record), options)
	}

	/** Detaches one exact pointer from protected identity without performing I/O. */
	toPointer(): Pointer {
		const record = readPersistedSchemaModelRecord(this, 'toPointer')

		if (typeof record.objectId !== 'string') {
			throw new TypeError(
				'Schema model toPointer has an invalid persisted identity',
			)
		}

		return createPointer(record.schema, record.objectId)
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
		const selection = readSelection(
			readCommandInput(input, 'create', ['select']),
		)

		return createSchemaRecord(
			record.schema,
			{ data: record.values, ...selection },
			options,
			'flat',
		)
	}

	/** Resolves one unique conflict target without retaining execution on the model. */
	upsert(input: unknown, options?: OperationOptions): Promise<object> {
		const record = readSchemaModelRecord(this)

		assertSchemaModelState(record, 'draft', 'upsert')
		const normalized = readCommandInput(input, 'upsert', [
			'select',
			'update',
			'where',
		])

		if (
			!Object.hasOwn(normalized, 'update') ||
			!Object.hasOwn(normalized, 'where')
		) {
			throw new TypeError(
				'Schema model upsert input must contain update and where',
			)
		}

		if (
			typeof normalized.where !== 'function' &&
			!isPlainRecord(normalized.where)
		) {
			throw new TypeError(
				'Schema model upsert where must be an object or function',
			)
		}

		return upsertSchemaRecord(
			record.schema,
			{
				where: normalized.where as SchemaWhereInput<SchemaDefinition>,
				create: record.values,
				...readSelection(normalized),
				update:
					normalized.update as UpdateExpressionInput<SchemaDefinition> & {},
			},
			options,
		)
	}

	/** Targets only Runtime-issued object identity and never a visible caller field. */
	async update(input: unknown, options?: OperationOptions): Promise<object> {
		const record = readPersistedSchemaModelRecord(this, 'update')
		assertOperationExecutionOwnerToken(record.ownerToken, options)
		const normalized = readCommandInput(input, 'update', ['data', 'select'])

		if (!Object.hasOwn(normalized, 'data')) {
			throw new TypeError('Schema model update input must contain data')
		}

		return requirePersistedMutationResult(
			executeQueryUpdateOne(
				createPersistedModelQuery(record, readSelection(normalized).select),
				normalized.data as UpdateExpressionInput<SchemaDefinition> & {},
				options,
			),
			'update',
		)
	}

	/** Deletes only Runtime-issued object identity through the ordinary Query executor. */
	async delete(input: unknown, options?: OperationOptions): Promise<object> {
		const record = readPersistedSchemaModelRecord(this, 'delete')
		assertOperationExecutionOwnerToken(record.ownerToken, options)
		const { select } = readSelection(
			readCommandInput(input, 'delete', ['select']),
		)

		return requirePersistedMutationResult(
			executeQueryDeleteOne(createPersistedModelQuery(record, select), options),
			'delete',
		)
	}
}
