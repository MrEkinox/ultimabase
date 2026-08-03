import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { Query } from '../../query/query/query.js'
import { snapshotDeclaredFieldValue } from '../fields/base/definition.js'
import {
	hasValidationFlag,
	isRequiredOnCreate,
} from '../fields/base/options.js'
import type { InferCreateInput, InferObject } from '../inference/types.js'
import type {
	SchemaClass,
	SchemaDefinition,
	SchemaExtensions,
	SchemaFields,
	SchemaMetadata,
} from './definition.js'

/** Distinguishes caller-created drafts from Runtime-materialized persisted values. */
type SchemaModelState = 'draft' | 'persisted'

/** Materializes public values and methods while retaining private model identity. */
type Simplify<TValue> = {
	readonly [TKey in keyof TValue]: TValue[TKey]
} & {}

declare const schemaModelStateType: unique symbol

/** @internal Carries nominal lifecycle identity without runtime surface. */
interface SchemaModelStateIdentity<
	TClassName extends string,
	TState extends SchemaModelState,
> {
	readonly [schemaModelStateType]: Readonly<{
		readonly className: TClassName
		readonly state: TState
	}>
}

/** Exposes immutable values without leaking the model's private lifecycle state. */
interface SchemaModelMethods<TValues extends object> {
	/** Reads one visible value through its exact field name. */
	get<const TField extends Extract<keyof TValues, string>>(
		field: TField,
	): TValues[TField]
	/** Returns a detached immutable object containing only visible values. */
	toJSON(): TValues
}

/** Represents one immutable instance of an exact generated schema class. */
type SchemaModelInstance<
	TSchema extends SchemaDefinition,
	TState extends SchemaModelState,
	TValues extends object,
> = Simplify<Readonly<TValues>> &
	SchemaModelMethods<Readonly<TValues>> &
	SchemaModelStateIdentity<TSchema['className'], TState>

/** Infers the immutable draft produced by a schema class constructor. */
export type SchemaDraft<TSchema extends SchemaDefinition> = Simplify<
	SchemaModelInstance<TSchema, 'draft', InferCreateInput<TSchema>>
>

/** Infers one persisted schema-class instance with an exact visible shape. */
export type SchemaResult<
	TSchema extends SchemaDefinition,
	TValues extends object = InferObject<TSchema>,
> = SchemaModelInstance<TSchema, 'persisted', TValues>

interface SchemaModelRecord {
	readonly schema: SchemaDefinition
	readonly values: Readonly<Record<string, unknown>>
}

const persistedModelConstructionKey: unique symbol = Symbol(
	'ultimabase.persisted-schema-model-construction',
)
const schemaModelRecords = new WeakMap<object, SchemaModelRecord>()
const schemaModelClasses = new WeakSet<SchemaDefinition>()

const readSchemaModelRecord = (instance: object): SchemaModelRecord => {
	const record = schemaModelRecords.get(instance)

	if (record === undefined) {
		throw new TypeError('Schema model instance has no trusted model state')
	}

	return record
}

/** Owns the common runtime behavior without becoming the public model identity. */
class SchemaModelPrototype {
	constructor(
		schema: SchemaDefinition,
		values: Readonly<Record<string, unknown>>,
	) {
		schemaModelRecords.set(this, immutableRecord({ schema, values }))

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
}

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
			value === null && hasValidationFlag(definition.options, 'nullable')
				? null
				: snapshotDeclaredFieldValue(definition, value, `input.${key}`)
	}

	return immutableRecord(values)
}

const snapshotPersistedValues = (
	definition: SchemaMetadata,
	input: unknown,
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(input)) {
		throw new TypeError('Persisted schema model values must be a plain object')
	}

	for (const key of Reflect.ownKeys(input)) {
		if (typeof key !== 'string' || !Object.hasOwn(definition.fields, key)) {
			throw new TypeError(
				`Persisted schema model contains an unknown field: ${String(key)}`,
			)
		}
	}

	// Runtime already validated and deeply detached every visible logical value.
	return immutableRecord(input)
}

/** Creates one final schema-specific class around immutable neutral metadata. */
export const createSchemaModelClass = <
	const TClassName extends string,
	const TFields extends SchemaFields,
	const TExtensions extends SchemaExtensions,
>(
	definition: SchemaMetadata<TClassName, TFields, TExtensions>,
	developerFields: TFields,
): SchemaClass<TClassName, TFields, TExtensions> => {
	class DefinedSchemaModel extends SchemaModelPrototype {
		constructor(input: unknown, persistedConstructionKey?: symbol) {
			if (new.target !== DefinedSchemaModel) {
				throw new TypeError('Schema model classes cannot be subclassed')
			}

			const persisted =
				persistedConstructionKey === persistedModelConstructionKey
			const schema = DefinedSchemaModel as unknown as SchemaDefinition
			const values = persisted
				? snapshotPersistedValues(definition, input)
				: snapshotDraftValues(developerFields, input)

			super(schema, values)
		}

		static query(): Query<SchemaClass> {
			return new Query(DefinedSchemaModel as unknown as SchemaClass)
		}
	}

	Object.defineProperty(DefinedSchemaModel, 'name', {
		configurable: false,
		value: definition.className,
	})
	Object.defineProperties(DefinedSchemaModel, {
		definition: { enumerable: true, value: definition },
		className: { enumerable: true, value: definition.className },
		fields: { enumerable: true, value: definition.fields },
		indexes: { enumerable: true, value: definition.indexes },
		extensions: { enumerable: true, value: definition.extensions },
	})

	const schema = DefinedSchemaModel as unknown as SchemaClass<
		TClassName,
		TFields,
		TExtensions
	>
	schemaModelClasses.add(schema)
	Object.freeze(DefinedSchemaModel.prototype)

	return schema
}

/** Converts one final plain Runtime record into its exact generated schema class. */
export const materializeSchemaModel = <
	const TSchema extends SchemaDefinition,
	const TValues extends object,
>(
	schema: TSchema,
	values: TValues,
): SchemaResult<TSchema, TValues> => {
	if (!schemaModelClasses.has(schema)) {
		throw new TypeError('Schema model class was not created by Schema.define')
	}

	type PersistedSchemaConstructor = new (
		input: unknown,
		constructionKey: symbol,
	) => object
	const Model = schema as unknown as PersistedSchemaConstructor

	return new Model(values, persistedModelConstructionKey) as SchemaResult<
		TSchema,
		TValues
	>
}

/** Checks trusted instance provenance without exposing private model state. */
export const isSchemaModelInstance = (
	schema: SchemaDefinition,
	value: unknown,
): boolean => {
	if (typeof value !== 'object' || value === null) {
		return false
	}

	return schemaModelRecords.get(value)?.schema === schema
}
