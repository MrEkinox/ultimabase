import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type {
	QueryFilterFieldName,
	QueryFilterValue,
} from '../../query/filters/primitive.js'
import type { QueryTerminalOptions } from '../../query/operations/execution.js'
import { Query } from '../../query/query/query.js'
import type {
	NumericUpdateInput,
	UnsetUpdateFieldName,
	UpdateExpressionInput,
	UpdateSetInput,
} from '../../query/updates/contracts.js'
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

type SchemaUpsertWhereFields<TSchema extends SchemaDefinition> = {
	readonly [TField in QueryFilterFieldName<TSchema, 'equal'>]?: Exclude<
		QueryFilterValue<TSchema, TField>,
		null | undefined
	>
}

type RequireOneProperty<TValue extends object> = {
	[TKey in keyof TValue]-?: Readonly<
		Required<Pick<TValue, TKey>> & Partial<Omit<TValue, TKey>>
	>
}[keyof TValue]

/** Selects one non-null equality target that Runtime verifies against a unique index. */
export type SchemaDraftUpsertWhere<TSchema extends SchemaDefinition> =
	RequireOneProperty<SchemaUpsertWhereFields<TSchema>>

/** Combines a draft's create values with one unique target and update branch. */
export interface SchemaDraftUpsertInput<TSchema extends SchemaDefinition> {
	/** Declares equality values that must exactly match one schema unique index. */
	readonly where: SchemaDraftUpsertWhere<TSchema>
	/** Applies this exact atomic update when the unique target already exists. */
	readonly update: UpdateExpressionInput<TSchema> & {}
}

interface CompactSchemaModelUpdateGroups<
	TSet extends object,
	TNumeric extends object,
	TUnset extends string,
> {
	readonly set?: TSet
	readonly unset?: readonly TUnset[]
	readonly increment?: TNumeric
	readonly decrement?: TNumeric
}

/** Names one exact update without retaining complete field definitions in hovers. */
export type CompactSchemaModelUpdateInput<
	TSet extends object,
	TNumeric extends object,
	TUnset extends string,
> = RequireOneProperty<CompactSchemaModelUpdateGroups<TSet, TNumeric, TUnset>>

/** Infers the compact atomic update surface reused by persisted model commands. */
export type SchemaModelUpdateInput<TSchema extends SchemaDefinition> =
	CompactSchemaModelUpdateInput<
		UpdateSetInput<TSchema>,
		NumericUpdateInput<TSchema>,
		UnsetUpdateFieldName<TSchema>
	>

/** Exposes only persistence commands valid for a caller-created immutable draft. */
export interface SchemaDraftCommands<
	TResult extends object,
	TUpsertInput extends object,
> {
	/**
	 * Persists this draft through the same Query and Runtime pipeline.
	 *
	 * @example `const created = await new Post({ title: "Hello" }).create()`
	 */
	create(options?: QueryTerminalOptions): Promise<TResult>
	/**
	 * Creates this draft or updates the object selected by one unique target.
	 *
	 * @example `await draft.upsert({ where: { slug: "hello" }, update: { increment: { views: 1 } } })`
	 */
	upsert(input: TUpsertInput, options?: QueryTerminalOptions): Promise<TResult>
}

/** Exposes only object-targeted commands valid for trusted persisted instances. */
export interface SchemaResultCommands<
	TUpdateInput extends object,
	TResult extends object,
> {
	/**
	 * Updates this protected object identity and preserves its visible projection.
	 *
	 * @example `const updated = await post.update({ set: { title: "Updated" } })`
	 */
	update(
		input: TUpdateInput,
		options?: QueryTerminalOptions,
	): Promise<TResult | null>
	/**
	 * Deletes this protected object identity and preserves its visible projection.
	 *
	 * @example `const deleted = await post.delete()`
	 */
	delete(options?: QueryTerminalOptions): Promise<TResult | null>
}

/** Keeps persisted model hovers independent from complete field definitions. */
export type PersistedSchemaModel<
	TClassName extends string,
	TValues extends object,
	TUpdateInput extends object,
> = SchemaModelInstance<SchemaDefinition<TClassName>, 'persisted', TValues> &
	SchemaResultCommands<
		TUpdateInput,
		PersistedSchemaModel<TClassName, TValues, TUpdateInput>
	>

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
	SchemaModelInstance<TSchema, 'draft', InferCreateInput<TSchema>> &
		SchemaDraftCommands<
			PersistedSchemaModel<
				TSchema['className'],
				InferObject<TSchema>,
				CompactSchemaModelUpdateInput<
					Simplify<UpdateSetInput<TSchema>>,
					Simplify<NumericUpdateInput<TSchema>>,
					UnsetUpdateFieldName<TSchema>
				>
			>,
			SchemaDraftUpsertInput<TSchema>
		>
>

/** Infers one persisted schema-class instance with an exact visible shape. */
export type SchemaResult<
	TSchema extends SchemaDefinition,
	TValues extends object = InferObject<TSchema>,
> = PersistedSchemaModel<
	TSchema['className'],
	TValues,
	CompactSchemaModelUpdateInput<
		Simplify<UpdateSetInput<TSchema>>,
		Simplify<NumericUpdateInput<TSchema>>,
		UnsetUpdateFieldName<TSchema>
	>
>

interface SchemaModelRecord {
	readonly objectId: unknown
	readonly schema: SchemaDefinition
	readonly selectedFields: readonly string[] | undefined
	readonly state: SchemaModelState
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

const assertSchemaModelState = (
	record: SchemaModelRecord,
	expected: SchemaModelState,
	command: string,
): void => {
	if (record.state !== expected) {
		throw new TypeError(
			`Schema model ${command} requires ${expected} model state`,
		)
	}
}

const readPersistedSchemaModelRecord = (
	instance: object,
	command: string,
): SchemaModelRecord & { readonly objectId: unknown } => {
	const record = readSchemaModelRecord(instance)

	assertSchemaModelState(record, 'persisted', command)

	if (record.objectId === undefined) {
		throw new TypeError(
			`Schema model ${command} requires protected persisted identity`,
		)
	}

	return record
}

interface NormalizedSchemaDraftUpsertInput {
	readonly update: unknown
	readonly where: Readonly<Record<string, unknown>>
}

/** Erases schema variance only inside the private model-to-Query delegation. */
interface SchemaModelQuery {
	byId(id: unknown): SchemaModelQuery
	delete(options?: QueryTerminalOptions): Promise<object | null>
	equalTo(field: string, value: unknown): SchemaModelQuery
	select(...fields: readonly string[]): SchemaModelQuery
	update(input: unknown, options?: QueryTerminalOptions): Promise<object | null>
	upsert(
		input: Readonly<{
			readonly create: Readonly<Record<string, unknown>>
			readonly update: unknown
		}>,
		options?: QueryTerminalOptions,
	): Promise<object>
}

const createSchemaModelQuery = (schema: SchemaDefinition): SchemaModelQuery =>
	// Public model types validate exact fields before this private variance boundary.
	new Query(schema)

const readSchemaDraftUpsertInput = (
	input: unknown,
): NormalizedSchemaDraftUpsertInput => {
	if (!isPlainRecord(input)) {
		throw new TypeError('Schema model upsert input must be a plain object')
	}

	for (const key of Object.keys(input)) {
		if (key !== 'update' && key !== 'where') {
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

	if (!isPlainRecord(input.where) || Object.keys(input.where).length === 0) {
		throw new TypeError('Schema model upsert where must be a non-empty object')
	}

	for (const [field, value] of Object.entries(input.where)) {
		if (value === null || value === undefined) {
			throw new TypeError(
				`Schema model upsert where field must be non-null: ${field}`,
			)
		}
	}

	return immutableRecord({ update: input.update, where: input.where })
}

/** Builds a target-only Query whose unique-index proof remains Runtime-owned. */
const createSchemaDraftUpsertQuery = (
	schema: SchemaDefinition,
	where: Readonly<Record<string, unknown>>,
): SchemaModelQuery => {
	let query = createSchemaModelQuery(schema)

	for (const [field, value] of Object.entries(where)) {
		query = query.equalTo(field, value)
	}

	return query
}

/** Restores the exact protected target without deriving identity from visible values. */
const createPersistedModelQuery = (
	record: SchemaModelRecord & { readonly objectId: unknown },
): SchemaModelQuery => {
	let query = createSchemaModelQuery(record.schema).byId(record.objectId)

	if (record.selectedFields !== undefined && record.selectedFields.length > 0) {
		query = query.select(...record.selectedFields)
	}

	return query
}

/** Reapplies an instance's original projection even when authority changes. */
const retainSchemaModelSelection = (
	result: object | null,
	selectedFields: readonly string[] | undefined,
): object | null => {
	if (result === null || selectedFields === undefined) {
		return result
	}

	const resultRecord = readSchemaModelRecord(result)
	const visibleValues: Record<string, unknown> = {}

	for (const field of selectedFields) {
		if (Object.hasOwn(resultRecord.values, field)) {
			visibleValues[field] = resultRecord.values[field]
		}
	}

	return materializeSchemaModel(
		resultRecord.schema,
		immutableRecord(visibleValues),
		{
			objectId: resultRecord.objectId,
			selectedFields,
		},
	)
}

/** Owns the common runtime behavior without becoming the public model identity. */
class SchemaModelPrototype {
	constructor(
		schema: SchemaDefinition,
		values: Readonly<Record<string, unknown>>,
		state: SchemaModelState,
		objectId?: unknown,
		selectedFields?: readonly string[],
	) {
		schemaModelRecords.set(
			this,
			immutableRecord({ objectId, schema, selectedFields, state, values }),
		)

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

	/** Persists only trusted draft state through Query's ordinary create terminal. */
	create(options?: QueryTerminalOptions): Promise<object> {
		const record = readSchemaModelRecord(this)

		assertSchemaModelState(record, 'draft', 'create')

		return new Query(record.schema).create(record.values, options)
	}

	/** Resolves one unique conflict target without retaining execution on the model. */
	upsert(input: unknown, options?: QueryTerminalOptions): Promise<object> {
		const record = readSchemaModelRecord(this)

		assertSchemaModelState(record, 'draft', 'upsert')
		const normalized = readSchemaDraftUpsertInput(input)
		const query = createSchemaDraftUpsertQuery(record.schema, normalized.where)

		return query.upsert(
			{
				create: record.values,
				update: normalized.update,
			},
			options,
		)
	}

	/** Targets only Runtime-issued object identity and never a visible caller field. */
	async update(
		input: unknown,
		options?: QueryTerminalOptions,
	): Promise<object | null> {
		const record = readPersistedSchemaModelRecord(this, 'update')
		const result = await createPersistedModelQuery(record).update(
			input,
			options,
		)

		return retainSchemaModelSelection(result, record.selectedFields)
	}

	/** Deletes only Runtime-issued object identity through Query's singular alias. */
	async delete(options?: QueryTerminalOptions): Promise<object | null> {
		const record = readPersistedSchemaModelRecord(this, 'delete')
		const result = await createPersistedModelQuery(record).delete(options)

		return retainSchemaModelSelection(result, record.selectedFields)
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

/** Carries Runtime-only identity and projection data into one public model shell. */
export interface SchemaModelMaterialization {
	readonly objectId?: unknown
	readonly selectedFields?: readonly string[] | undefined
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
		constructor(
			input: unknown,
			persistedConstructionKey?: symbol,
			materialization?: SchemaModelMaterialization,
		) {
			if (new.target !== DefinedSchemaModel) {
				throw new TypeError('Schema model classes cannot be subclassed')
			}

			const persisted =
				persistedConstructionKey === persistedModelConstructionKey
			const schema = DefinedSchemaModel as unknown as SchemaDefinition
			const values = persisted
				? snapshotPersistedValues(definition, input)
				: snapshotDraftValues(developerFields, input)
			const protectedState = persisted
				? snapshotSchemaModelMaterialization(
						definition,
						values,
						materialization,
					)
				: undefined

			super(
				schema,
				values,
				persisted ? 'persisted' : 'draft',
				protectedState?.objectId,
				protectedState?.selectedFields,
			)
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
	materialization?: SchemaModelMaterialization,
): SchemaResult<TSchema, TValues> => {
	if (!schemaModelClasses.has(schema)) {
		throw new TypeError('Schema model class was not created by Schema.define')
	}

	type PersistedSchemaConstructor = new (
		input: unknown,
		constructionKey: symbol,
		materialization?: SchemaModelMaterialization,
	) => object
	const Model = schema as unknown as PersistedSchemaConstructor

	return new Model(
		values,
		persistedModelConstructionKey,
		materialization,
	) as SchemaResult<TSchema, TValues>
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
