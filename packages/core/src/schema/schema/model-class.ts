import { createPointer, type Pointer } from '../relations/pointer.js'
import { isSchemaDeclarationMethod } from './declaration-methods.js'

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
	requireFoundRow,
} from '../../query/query/operation-execution.js'
import {
	queryFromCountInput,
	queryFromExistsInput,
	queryFromFindManyInput,
	queryFromFindOneInput,
	type CountInput,
	type ExistsInput,
	type FindManyInput,
	type FindOneInput,
} from '../../query/query/input.js'
import { readActiveApplicationOwner } from '../../application/active-application.js'
import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import { executeStaticSchemaMutation } from '../../query/operations/execution.js'
import type {
	SchemaClass,
	SchemaDefinition,
	SchemaFields,
	SchemaReference,
} from './definition.js'
import type { SchemaModelDefinitionReader } from './model-contracts.js'

/** Tests whether the sole active compiled application exposes one class mutation. */
const resolveStaticMutation = (
	schema: SchemaDefinition,
	className: string,
	name: string,
): boolean | undefined => {
	const application = readActiveApplicationOwner()
	if (
		application === undefined ||
		!['started', 'stopping', 'stopped', 'disposing'].includes(application.state)
	)
		return undefined
	const surface =
		readApplicationKernelState(application).commands.schemaSurface(className)
	return surface?.schema === schema && surface.schemaMutations.has(name)
}

/** Resolves class-level mutations from the sole active compiled application. */
const createStaticSchemaMutationView = <TSchema extends object>(
	target: TSchema,
	className: string,
	readSchema: () => SchemaDefinition,
): TSchema => {
	const view: TSchema = new Proxy(target, {
		get: (constructor, property, receiver): unknown => {
			if (
				typeof property === 'string' &&
				(!Reflect.has(constructor, property) ||
					isSchemaDeclarationMethod(Reflect.get(constructor, property))) &&
				resolveStaticMutation(readSchema(), className, property) === true
			)
				return (input: unknown, options?: OperationOptions) =>
					executeStaticSchemaMutation(readSchema(), property, input, options)
			return Reflect.get(constructor, property, receiver)
		},
		has: (constructor, property): boolean =>
			Reflect.has(constructor, property) ||
			(typeof property === 'string' &&
				resolveStaticMutation(readSchema(), className, property) !== undefined),
	})
	return view
}

// Metadata getters read the deferred compilation each time, in public key order.
const definitionKeys = [
	'fields',
	'indexes',
	'persistedFields',
	'provenance',
	'virtualFields',
] as const

/**
 * Binds the canonical class-level query and command surface to one schema.
 * Every command is `async`, so a failure while normalizing its input or
 * selecting its application rejects the returned promise instead of throwing
 * from the call.
 */
const createStaticCommands = (schema: SchemaDefinition) => ({
	findMany: async (
		input: FindManyInput<SchemaDefinition> = {},
		options?: OperationOptions,
	): Promise<readonly object[]> =>
		executeQueryFindMany(queryFromFindManyInput(schema, input), options),
	findOne: async (
		input: FindOneInput<SchemaDefinition> = {},
		options?: OperationOptions,
	): Promise<object | null> =>
		executeQueryFindOne(queryFromFindOneInput(schema, input), options),
	findOneOrThrow: async (
		input: FindOneInput<SchemaDefinition> = {},
		options?: OperationOptions,
	): Promise<object> =>
		requireFoundRow(
			await executeQueryFindOne(queryFromFindOneInput(schema, input), options),
		),
	count: async (
		input: CountInput<SchemaDefinition> = {},
		options?: OperationOptions,
	): Promise<number> =>
		executeQueryCount(queryFromCountInput(schema, input), options),
	exists: async (
		input: ExistsInput<SchemaDefinition> = {},
		options?: OperationOptions,
	): Promise<boolean> =>
		executeQueryExists(queryFromExistsInput(schema, input), options),
	createOne: async (
		input: SchemaCreateOneExecutionInput<SchemaDefinition>,
		options?: OperationOptions,
	): Promise<object> => createSchemaRecord(schema, input, options),
	createMany: async (
		input: SchemaCreateManyExecutionInput<SchemaDefinition>,
		options?: OperationOptions,
	): Promise<unknown> => createSchemaRecords(schema, input, options),
	updateOne: async (
		input: SchemaUpdateOneExecutionInput<SchemaDefinition>,
		options?: OperationOptions,
	): Promise<object | null> => updateSchemaRecord(schema, input, options),
	updateMany: async (
		input: SchemaUpdateManyExecutionInput<SchemaDefinition>,
		options?: OperationOptions,
	): Promise<readonly object[]> => updateSchemaRecords(schema, input, options),
	upsertOne: async (
		input: SchemaUpsertOneExecutionInput<SchemaDefinition>,
		options?: OperationOptions,
	): Promise<object> => upsertSchemaRecord(schema, input, options),
	upsertMany: async (
		input: SchemaUpsertManyExecutionInput<SchemaDefinition>,
		options?: OperationOptions,
	): Promise<unknown> => upsertSchemaRecords(schema, input, options),
	deleteOne: async (
		input: SchemaDeleteOneExecutionInput<SchemaDefinition>,
		options?: OperationOptions,
	): Promise<object | null> => deleteSchemaRecord(schema, input, options),
	deleteMany: async (
		input: SchemaDeleteManyExecutionInput<SchemaDefinition>,
		options?: OperationOptions,
	): Promise<readonly object[]> => deleteSchemaRecords(schema, input, options),
	// Pointers bind no QueryBuilder or Runtime execution state.
	pointer: (id: string): Pointer<SchemaClass> =>
		createPointer(schema as SchemaClass, id),
})

/** Creates one final schema-specific class around deferred neutral metadata. */
export const createSchemaModelClass = <
	const TClassName extends string,
	const TFields extends SchemaFields,
>(
	reader: SchemaModelDefinitionReader<TClassName, TFields>,
): SchemaReference<TClassName> => {
	// A schema is a class value for its static API only: results are plain
	// data and nothing constructs a model (ADR-0310).
	const DefinedSchemaModel = function (): never {
		throw new TypeError(
			`${reader.className} is not constructible: create rows with ${reader.className}.createOne({ data })`,
		)
	}
	Object.freeze(DefinedSchemaModel.prototype)

	// The generated class implements both structural views, while its constructor
	// signature deliberately remains private to this composition boundary.
	const schema = createStaticSchemaMutationView(
		DefinedSchemaModel,
		reader.className,
		() => schema,
	) as unknown as SchemaReference<TClassName>
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

	return schema
}
