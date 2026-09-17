import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	createSchemaRecord,
	createSchemaRecords,
	deleteSchemaRecord,
	deleteSchemaRecords,
	updateSchemaRecord,
	updateSchemaRecords,
	upsertSchemaRecord,
	upsertSchemaRecords,
} from '../../query/operations/schema-command-execution.js'
import type {
	SchemaCreateManyExecutionInput,
	SchemaCreateOneExecutionInput,
	SchemaDeleteManyExecutionInput,
	SchemaDeleteOneExecutionInput,
	SchemaUpdateManyExecutionInput,
	SchemaUpdateOneExecutionInput,
	SchemaUpsertManyExecutionInput,
	SchemaUpsertOneExecutionInput,
} from '../../query/operations/schema-commands.js'
import type { OperationOptions } from '../../query/operations/options.js'
import {
	executeQueryCount,
	executeQueryExists,
	executeQueryFindMany,
	executeQueryFindOne,
	executeQueryGet,
} from '../../query/query/operation-execution.js'
import {
	queryFromCountInput,
	queryFromExistsInput,
	queryFromFindManyInput,
	queryFromFindOneInput,
	queryFromGetInput,
	type CountInput,
	type ExistsInput,
	type FindManyInput,
	type FindOneInput,
	type GetInput,
} from '../../query/query/input.js'
import { snapshotDeclaredFieldValue } from '../fields/base/definition.js'
import { isFieldNullable, isRequiredOnCreate } from '../fields/base/options.js'
import { Pointer } from '../relations/pointer.js'
import type {
	SchemaClass,
	SchemaDefinition,
	SchemaFields,
	SchemaMetadata,
	SchemaReference,
} from './definition.js'
import type {
	SchemaModelDefinitionReader,
	SchemaModelMaterialization,
	SchemaModelState,
} from './model-contracts.js'
import { SchemaModelPrototype } from './model-commands.js'
import { createStaticSchemaMutationView } from './model-static-mutations.js'
import {
	persistedModelConstructionKey,
	preparedDraftConstructionKey,
	registerSchemaModelClass,
} from './model-state.js'

const snapshotDraftValues = (
	fields: SchemaFields,
	input: unknown,
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(input)) {
		throw new TypeError('Schema model input must be a plain object')
	}

	for (const [field, definition] of Object.entries(fields)) {
		if (!Object.hasOwn(input, field) && isRequiredOnCreate(definition)) {
			throw new TypeError(`Schema model input field is required: ${field}`)
		}
	}

	const values: Record<string, unknown> = {}

	for (const key of Reflect.ownKeys(input)) {
		if (typeof key !== 'string') {
			throw new TypeError(
				`Schema model input contains an unknown field: ${String(key)}`,
			)
		}

		const definition = fields[key]

		if (definition === undefined) {
			throw new TypeError(
				`Schema model input contains an unknown field: ${key}`,
			)
		}

		const value = input[key]

		values[key] =
			value === null && isFieldNullable(definition)
				? null
				: snapshotDeclaredFieldValue(definition, value, `input.${key}`)
	}

	return immutableRecord(values)
}

const snapshotMaterializedValues = (
	definition: SchemaMetadata,
	input: unknown,
	materializationKind: 'Persisted' | 'Prepared draft',
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(input)) {
		throw new TypeError(
			`${materializationKind} schema model values must be a plain object`,
		)
	}

	for (const key of Reflect.ownKeys(input)) {
		if (typeof key !== 'string' || !Object.hasOwn(definition.fields, key)) {
			throw new TypeError(
				`${materializationKind} schema model contains an unknown field: ${String(key)}`,
			)
		}
	}

	// Runtime already validated and deeply detached every visible logical value.
	return immutableRecord(input)
}

const snapshotSchemaModelMaterialization = (
	definition: SchemaMetadata,
	values: Readonly<Record<string, unknown>>,
	materialization: SchemaModelMaterialization | undefined,
): Readonly<{
	readonly objectId: unknown
	readonly selectedFields: readonly string[] | undefined
}> => {
	const visibleObjectId = Object.hasOwn(values, 'id') ? values.id : undefined
	const candidateObjectId = materialization?.objectId ?? visibleObjectId
	const objectId =
		candidateObjectId === undefined
			? undefined
			: snapshotDeclaredFieldValue(
					definition.fields.id,
					candidateObjectId,
					'model.identity.id',
				)

	if (
		visibleObjectId !== undefined &&
		objectId !== undefined &&
		visibleObjectId !== objectId
	) {
		throw new TypeError(
			'Persisted schema model visible id does not match protected identity',
		)
	}

	const selectedFields =
		materialization?.selectedFields === undefined
			? undefined
			: immutableArray(materialization.selectedFields)

	return immutableRecord({ objectId, selectedFields })
}

/** Creates one final schema-specific class around deferred neutral metadata. */
export const createSchemaModelClass = <
	const TClassName extends string,
	const TFields extends SchemaFields,
>(
	reader: SchemaModelDefinitionReader<TClassName, TFields>,
): SchemaReference<TClassName> => {
	class DefinedSchemaModel extends SchemaModelPrototype {
		constructor(
			input: unknown,
			constructionKey?: symbol,
			materialization?: SchemaModelMaterialization,
		) {
			if (new.target !== DefinedSchemaModel) {
				throw new TypeError('Schema model classes cannot be subclassed')
			}

			const state: SchemaModelState =
				constructionKey === persistedModelConstructionKey
					? 'persisted'
					: constructionKey === preparedDraftConstructionKey
						? 'prepared-draft'
						: 'draft'
			const schema = readDefinedSchema()
			const definition = reader.readDefinition()
			const values =
				state === 'draft'
					? snapshotDraftValues(reader.readDeveloperFields(), input)
					: snapshotMaterializedValues(
							definition,
							input,
							state === 'persisted' ? 'Persisted' : 'Prepared draft',
						)
			const protectedState =
				state === 'persisted'
					? snapshotSchemaModelMaterialization(
							definition,
							values,
							materialization,
						)
					: undefined

			super(
				schema,
				values,
				state,
				protectedState?.objectId,
				protectedState?.selectedFields,
			)
		}

		/** Reads matching rows from one canonical object input. */
		static findMany(
			input: FindManyInput<SchemaDefinition> = {},
			options?: OperationOptions,
		): Promise<readonly object[]> {
			return executeQueryFindMany(
				queryFromFindManyInput(readDefinedSchema(), input),
				options,
			)
		}

		/** Reads the first matching row from one canonical object input. */
		static findOne(
			input: FindOneInput<SchemaDefinition> = {},
			options?: OperationOptions,
		): Promise<object | null> {
			return executeQueryFindOne(
				queryFromFindOneInput(readDefinedSchema(), input),
				options,
			)
		}

		/** Reads one exact identifier with its requested projection. */
		static get(
			input: GetInput<SchemaDefinition>,
			options?: OperationOptions,
		): Promise<object> {
			const normalized = queryFromGetInput(readDefinedSchema(), input)

			return executeQueryGet(normalized.query, normalized.id, options)
		}

		/** Counts rows matching one canonical object filter. */
		static count(
			input: CountInput<SchemaDefinition> = {},
			options?: OperationOptions,
		): Promise<number> {
			return executeQueryCount(
				queryFromCountInput(readDefinedSchema(), input),
				options,
			)
		}

		/** Tests whether one row matches one canonical object filter. */
		static exists(
			input: ExistsInput<SchemaDefinition> = {},
			options?: OperationOptions,
		): Promise<boolean> {
			return executeQueryExists(
				queryFromExistsInput(readDefinedSchema(), input),
				options,
			)
		}

		/** Creates one persisted model through the shared Runtime operation pipeline. */
		static createOne(
			input: SchemaCreateOneExecutionInput<SchemaDefinition>,
			options?: OperationOptions,
		): Promise<object> {
			return createSchemaRecord(readDefinedSchema(), input, options)
		}

		/** Creates ordered models through one all-or-nothing operation. */
		static createMany(
			input: SchemaCreateManyExecutionInput<SchemaDefinition>,
			options?: OperationOptions,
		): Promise<unknown> {
			return createSchemaRecords(readDefinedSchema(), input, options)
		}

		/** Updates one exact unique target. */
		static updateOne(
			input: SchemaUpdateOneExecutionInput<SchemaDefinition>,
			options?: OperationOptions,
		): Promise<object | null> {
			return updateSchemaRecord(readDefinedSchema(), input, options)
		}

		/** Updates one explicit filtered set. */
		static updateMany(
			input: SchemaUpdateManyExecutionInput<SchemaDefinition>,
			options?: OperationOptions,
		): Promise<readonly object[]> {
			return updateSchemaRecords(readDefinedSchema(), input, options)
		}

		/** Creates or updates one exact unique target. */
		static upsertOne(
			input: SchemaUpsertOneExecutionInput<SchemaDefinition>,
			options?: OperationOptions,
		): Promise<object> {
			return upsertSchemaRecord(readDefinedSchema(), input, options)
		}

		/** Upserts independently targeted inputs in order. */
		static upsertMany(
			input: SchemaUpsertManyExecutionInput<SchemaDefinition>,
			options?: OperationOptions,
		): Promise<unknown> {
			return upsertSchemaRecords(readDefinedSchema(), input, options)
		}

		/** Deletes one exact unique target. */
		static deleteOne(
			input: SchemaDeleteOneExecutionInput<SchemaDefinition>,
			options?: OperationOptions,
		): Promise<object | null> {
			return deleteSchemaRecord(readDefinedSchema(), input, options)
		}

		/** Deletes one explicit filtered set. */
		static deleteMany(
			input: SchemaDeleteManyExecutionInput<SchemaDefinition>,
			options?: OperationOptions,
		): Promise<readonly object[]> {
			return deleteSchemaRecords(readDefinedSchema(), input, options)
		}

		/** Creates a pointer without binding QueryBuilder or Runtime execution state. */
		static pointer(id: string): Pointer<SchemaClass> {
			return new Pointer(readDefinedSchemaClass(), id)
		}
	}

	// The generated class implements both structural views, while its constructor
	// signature deliberately remains private to this composition boundary.
	const schema = createStaticSchemaMutationView(
		DefinedSchemaModel,
	) as unknown as SchemaReference<TClassName>
	const readDefinedSchema = (): SchemaReference<TClassName> => schema
	const readDefinedSchemaClass = (): SchemaClass => schema as SchemaClass

	Object.defineProperty(DefinedSchemaModel, 'name', {
		configurable: false,
		value: reader.className,
	})
	Object.defineProperties(DefinedSchemaModel, {
		definition: { enumerable: true, get: reader.readDefinition },
		className: { enumerable: true, value: reader.className },
		constraints: {
			enumerable: true,
			get: (): SchemaMetadata<TClassName, TFields>['constraints'] =>
				reader.readDefinition().constraints,
		},
		fields: {
			enumerable: true,
			get: (): SchemaMetadata<TClassName, TFields>['fields'] =>
				reader.readDefinition().fields,
		},
		indexes: {
			enumerable: true,
			get: (): SchemaMetadata<TClassName, TFields>['indexes'] =>
				reader.readDefinition().indexes,
		},
		persistedFields: {
			enumerable: true,
			get: (): SchemaMetadata<TClassName, TFields>['persistedFields'] =>
				reader.readDefinition().persistedFields,
		},
		provenance: {
			enumerable: true,
			get: (): SchemaMetadata<TClassName, TFields>['provenance'] =>
				reader.readDefinition().provenance,
		},
		virtualFields: {
			enumerable: true,
			get: (): SchemaMetadata<TClassName, TFields>['virtualFields'] =>
				reader.readDefinition().virtualFields,
		},
	})

	registerSchemaModelClass(schema)
	return schema
}
