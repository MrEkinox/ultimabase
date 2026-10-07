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
import { readActiveApplicationOwner } from '../../application/active-application.js'
import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import { executeStaticSchemaMutation } from '../../query/operations/execution.js'
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

/** Tests whether the sole active compiled application exposes one class mutation. */
const resolveStaticMutation = (
	schema: SchemaDefinition,
	name: string,
): boolean | undefined => {
	const application = readActiveApplicationOwner()
	if (
		application === undefined ||
		!['started', 'stopping', 'stopped', 'disposing'].includes(application.state)
	)
		return undefined
	const surface = readApplicationKernelState(
		application,
	).commands.schemaSurface(schema.className)
	return surface?.schema === schema && surface.schemaMutations.has(name)
}

/** Resolves class-level mutations from the sole active compiled application. */
const createStaticSchemaMutationView = <
	TSchema extends new (input: unknown) => object,
>(
	target: TSchema,
	readSchema: () => SchemaDefinition,
): TSchema => {
	const view: TSchema = new Proxy(target, {
		construct: (constructor, arguments_, newTarget): object =>
			Reflect.construct(
				constructor,
				arguments_,
				newTarget === view ? constructor : newTarget,
			) as object,
		get: (constructor, property, receiver): unknown => {
			if (
				typeof property === 'string' &&
				!Reflect.has(constructor, property) &&
				resolveStaticMutation(readSchema(), property) === true
			)
				return (input: unknown, options?: OperationOptions) =>
					executeStaticSchemaMutation(readSchema(), property, input, options)
			return Reflect.get(constructor, property, receiver)
		},
		has: (constructor, property): boolean =>
			Reflect.has(constructor, property) ||
			(typeof property === 'string' &&
				resolveStaticMutation(readSchema(), property) !== undefined),
	})
	return view
}

// Metadata getters read the deferred compilation each time, in public key order.
const definitionKeys = [
	'constraints',
	'fields',
	'indexes',
	'persistedFields',
	'provenance',
	'virtualFields',
] as const

/** Binds the canonical class-level query and command surface to one schema. */
const createStaticCommands = (schema: SchemaDefinition) => ({
	findMany: (
		input: FindManyInput<SchemaDefinition> = {},
		options?: OperationOptions,
	): Promise<readonly object[]> =>
		executeQueryFindMany(queryFromFindManyInput(schema, input), options),
	findOne: (
		input: FindOneInput<SchemaDefinition> = {},
		options?: OperationOptions,
	): Promise<object | null> =>
		executeQueryFindOne(queryFromFindOneInput(schema, input), options),
	get: (
		input: GetInput<SchemaDefinition>,
		options?: OperationOptions,
	): Promise<object> => {
		const normalized = queryFromGetInput(schema, input)

		return executeQueryGet(normalized.query, normalized.id, options)
	},
	count: (
		input: CountInput<SchemaDefinition> = {},
		options?: OperationOptions,
	): Promise<number> =>
		executeQueryCount(queryFromCountInput(schema, input), options),
	exists: (
		input: ExistsInput<SchemaDefinition> = {},
		options?: OperationOptions,
	): Promise<boolean> =>
		executeQueryExists(queryFromExistsInput(schema, input), options),
	createOne: (
		input: SchemaCreateOneExecutionInput<SchemaDefinition>,
		options?: OperationOptions,
	): Promise<object> => createSchemaRecord(schema, input, options),
	createMany: (
		input: SchemaCreateManyExecutionInput<SchemaDefinition>,
		options?: OperationOptions,
	): Promise<unknown> => createSchemaRecords(schema, input, options),
	updateOne: (
		input: SchemaUpdateOneExecutionInput<SchemaDefinition>,
		options?: OperationOptions,
	): Promise<object | null> => updateSchemaRecord(schema, input, options),
	updateMany: (
		input: SchemaUpdateManyExecutionInput<SchemaDefinition>,
		options?: OperationOptions,
	): Promise<readonly object[]> => updateSchemaRecords(schema, input, options),
	upsertOne: (
		input: SchemaUpsertOneExecutionInput<SchemaDefinition>,
		options?: OperationOptions,
	): Promise<object> => upsertSchemaRecord(schema, input, options),
	upsertMany: (
		input: SchemaUpsertManyExecutionInput<SchemaDefinition>,
		options?: OperationOptions,
	): Promise<unknown> => upsertSchemaRecords(schema, input, options),
	deleteOne: (
		input: SchemaDeleteOneExecutionInput<SchemaDefinition>,
		options?: OperationOptions,
	): Promise<object | null> => deleteSchemaRecord(schema, input, options),
	deleteMany: (
		input: SchemaDeleteManyExecutionInput<SchemaDefinition>,
		options?: OperationOptions,
	): Promise<readonly object[]> => deleteSchemaRecords(schema, input, options),
	// Pointers bind no QueryBuilder or Runtime execution state.
	pointer: (id: string): Pointer<SchemaClass> =>
		new Pointer(schema as SchemaClass, id),
})

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
	}

	// The generated class implements both structural views, while its constructor
	// signature deliberately remains private to this composition boundary.
	const schema = createStaticSchemaMutationView(
		DefinedSchemaModel,
		() => schema,
	) as unknown as SchemaReference<TClassName>
	const readDefinedSchema = (): SchemaReference<TClassName> => schema
	const definitionProperties = Object.fromEntries(
		definitionKeys.map((key) => [
			key,
			{ enumerable: true, get: () => reader.readDefinition()[key] },
		]),
	)

	Object.defineProperty(DefinedSchemaModel, 'name', {
		configurable: false,
		value: reader.className,
	})
	// Static commands keep native class-method visibility: writable until the
	// schema is frozen, and absent from enumeration.
	for (const [name, command] of Object.entries(createStaticCommands(schema))) {
		Object.defineProperty(DefinedSchemaModel, name, {
			configurable: true,
			enumerable: false,
			value: command,
			writable: true,
		})
	}
	Object.defineProperties(DefinedSchemaModel, {
		definition: { enumerable: true, get: reader.readDefinition },
		className: { enumerable: true, value: reader.className },
		...definitionProperties,
	})

	registerSchemaModelClass(schema)
	return schema
}
