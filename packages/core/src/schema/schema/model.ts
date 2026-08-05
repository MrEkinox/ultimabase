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
	SchemaDeleteManyInput,
	SchemaDeleteOneInput,
	SchemaUpdateManyInput,
	SchemaUpdateOneInput,
	SchemaUpsertInput,
	SchemaUpsertManyItemInput,
	SchemaWhereFactory,
} from '../../query/operations/schema-commands.js'
import type {
	QueryBulkTerminalOptions,
	QueryTerminalOptions,
} from '../../query/operations/execution.js'
import {
	executeQueryDeleteOne,
	executeQueryUpdateOne,
	Query,
} from '../../query/query/query.js'
import type {
	CompactUpdateExpressionInput,
	NumericUpdateInput,
	UpdateExpressionInput,
	UpdateSetInput,
} from '../../query/updates/contracts.js'
import { snapshotDeclaredFieldValue } from '../fields/base/definition.js'
import { isFieldNullable, isRequiredOnCreate } from '../fields/base/options.js'
import type { InferCreateInput, InferObject } from '../inference/types.js'
import { Pointer } from '../relations/pointer.js'
import {
	createRelationHandle,
	type Relation,
	type SchemaRelationFieldName,
	type SchemaRelationTarget,
} from '../relations/relation.js'
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
declare const schemaResultCapabilitiesType: unique symbol

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

/** Carries package-owned persisted commands through Query result inference. */
export interface SchemaResultCapabilityCarrier<TCapabilities extends object> {
	readonly [schemaResultCapabilitiesType]: TCapabilities
}

/** Extracts specialized persisted commands without affecting ordinary schemas. */
export type SchemaResultCapabilitiesOf<TSchema> =
	TSchema extends SchemaResultCapabilityCarrier<infer TCapabilities>
		? TCapabilities
		: Readonly<Record<never, never>>

/** Identifies a trusted persisted model independently from its visible selection. */
export type PersistedSchemaReference<TSchema extends SchemaDefinition> =
	SchemaModelStateIdentity<TSchema['className'], 'persisted'>

/** Exposes immutable values without leaking the model's private lifecycle state. */
interface SchemaModelMethods<TValues extends object> {
	/** Reads one visible value through its exact field name. */
	get<const TField extends Extract<keyof TValues, string>>(
		field: TField,
	): TValues[TField]
	/** Returns a detached immutable object containing only visible values. */
	toJSON(): TValues
}

/** Combines a draft's create values with one unique target and update branch. */
export interface SchemaDraftUpsertInput<TSchema extends SchemaDefinition> {
	/** Builds the exact equality target that Runtime verifies against a unique index. */
	readonly where: SchemaWhereFactory<TSchema>
	/** Applies this exact atomic update when the unique target already exists. */
	readonly update: UpdateExpressionInput<TSchema> & {}
}

/** Names one exact field-oriented update without retaining field definitions in hovers. */
export type CompactSchemaModelUpdateInput<
	TSet extends object,
	TNumeric extends object,
> = CompactUpdateExpressionInput<TSet, TNumeric>

/** Infers the compact atomic update surface reused by persisted model commands. */
export type SchemaModelUpdateInput<TSchema extends SchemaDefinition> =
	CompactSchemaModelUpdateInput<
		Simplify<UpdateSetInput<TSchema>>,
		Simplify<NumericUpdateInput<TSchema>>
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
	 * @example `await draft.upsert({ where: (where) => where.equalTo("slug", "hello"), update: { views: increment(1) } })`
	 */
	upsert(input: TUpsertInput, options?: QueryTerminalOptions): Promise<TResult>
}

/** Exposes only object-targeted commands valid for trusted persisted instances. */
export interface SchemaResultCommands<
	TUpdateInput extends object,
	TMutationResult extends object,
> {
	/**
	 * Updates this protected object identity and returns the complete model.
	 *
	 * @example `const updated = await post.update({ title: "Updated" })`
	 */
	update(
		input: TUpdateInput,
		options?: QueryTerminalOptions,
	): Promise<TMutationResult | null>
	/**
	 * Deletes this protected object identity and returns the complete model.
	 *
	 * @example `const deleted = await post.delete()`
	 */
	delete(options?: QueryTerminalOptions): Promise<TMutationResult | null>
}

/** Exposes exact to-many handles only on Runtime-materialized model results. */
interface SchemaResultRelationCommands<TSchema extends SchemaDefinition> {
	/**
	 * Returns an independently queryable immutable relationship handle.
	 *
	 * Only declared relation fields are suggested. The handle retains protected
	 * source identity even when the visible result projection omits `id`.
	 *
	 * @example `const tags = post.relation('tags')`
	 */
	relation<const TFieldName extends SchemaRelationFieldName<TSchema>>(
		fieldName: TFieldName,
	): Relation<TSchema, SchemaRelationTarget<TSchema, TFieldName>>
}

/** Omits the relation method entirely when a schema declares no to-many fields. */
export type SchemaResultRelations<TSchema extends SchemaDefinition> = [
	SchemaRelationFieldName<TSchema>,
] extends [never]
	? Readonly<Record<never, never>>
	: SchemaResultRelationCommands<TSchema>

/** Keeps persisted model hovers independent from complete field definitions. */
export type PersistedSchemaModel<
	TClassName extends string,
	TValues extends object,
	TUpdateInput extends object,
	TRelations extends object = Readonly<Record<never, never>>,
	TCompleteValues extends object = TValues,
> = SchemaModelInstance<SchemaDefinition<TClassName>, 'persisted', TValues> &
	SchemaResultCommands<
		TUpdateInput,
		PersistedSchemaModel<
			TClassName,
			TCompleteValues,
			TUpdateInput,
			TRelations,
			TCompleteValues
		>
	> &
	TRelations

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
					Simplify<NumericUpdateInput<TSchema>>
				>,
				SchemaResultRelations<TSchema> & SchemaResultCapabilitiesOf<TSchema>
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
		Simplify<NumericUpdateInput<TSchema>>
	>,
	SchemaResultRelations<TSchema> & SchemaResultCapabilitiesOf<TSchema>,
	InferObject<TSchema>
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

/** Gives one specialization only the safe model operations needed by commands. */
export interface SchemaModelCapabilityContext<
	TSchema extends SchemaDefinition,
> {
	readonly schema: TSchema
	/** Rejects drafts and forged receivers before a specialized command runs. */
	assertPersisted(instance: object, command: string): void
	/** Converts an exact Pointer or persisted model into a detached Pointer. */
	toPointer<TTarget extends SchemaDefinition>(
		target: TTarget,
		value: Pointer<TTarget> | PersistedSchemaReference<TTarget>,
		command: string,
	): Pointer<TTarget>
}

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

const toPersistedSchemaPointer = <TTarget extends SchemaDefinition>(
	target: TTarget,
	value: unknown,
	command: string,
): Pointer<TTarget> => {
	if (Pointer.is(value)) {
		if (value.schema !== target) {
			throw new TypeError(
				`${command} target must belong to ${target.className}`,
			)
		}

		return new Pointer(target, value.id)
	}

	if (typeof value !== 'object' || value === null) {
		throw new TypeError(
			`${command} target must be a Pointer or persisted schema model`,
		)
	}

	const record = readPersistedSchemaModelRecord(value, command)

	if (record.schema !== target) {
		throw new TypeError(`${command} target must belong to ${target.className}`)
	}
	if (typeof record.objectId !== 'string') {
		throw new TypeError(`${command} target has an invalid persisted identity`)
	}

	return new Pointer(target, record.objectId)
}

/** Creates an immutable specialization context without exposing private model state. */
export const createSchemaModelCapabilityContext = <
	const TSchema extends SchemaDefinition,
>(
	schema: TSchema,
): SchemaModelCapabilityContext<TSchema> =>
	Object.freeze({
		schema,
		assertPersisted: (instance: object, command: string): void => {
			const record = readPersistedSchemaModelRecord(instance, command)

			if (record.schema !== schema) {
				throw new TypeError(
					`${command} receiver must belong to ${schema.className}`,
				)
			}
		},
		toPointer: toPersistedSchemaPointer,
	})

/** Attaches package-owned result methods before the generated prototype is frozen. */
export const defineSchemaModelResultCapabilities = (
	schema: SchemaDefinition,
	capabilities: object,
): void => {
	if (!isPlainRecord(capabilities)) {
		throw new TypeError('schema result capabilities must be a plain object')
	}

	const prototype: unknown = Reflect.get(schema, 'prototype')

	if (typeof prototype !== 'object' || prototype === null) {
		throw new TypeError('schema model prototype is unavailable')
	}

	for (const [name, capability] of Object.entries(capabilities)) {
		if (name.length === 0 || typeof capability !== 'function') {
			throw new TypeError(
				'schema result capabilities must contain named functions',
			)
		}

		if (name in prototype) {
			throw new TypeError(`Reserved schema result capability: ${name}`)
		}

		Object.defineProperty(prototype, name, {
			configurable: false,
			enumerable: false,
			value: capability,
			writable: false,
		})
	}
}

/** Closes the generated model prototype after every specialization is attached. */
export const finalizeSchemaModelClass = (schema: SchemaDefinition): void => {
	const prototype: unknown = Reflect.get(schema, 'prototype')

	if (typeof prototype !== 'object' || prototype === null) {
		throw new TypeError('schema model prototype is unavailable')
	}

	Object.freeze(prototype)
}

interface NormalizedSchemaDraftUpsertInput {
	readonly update: UpdateExpressionInput<SchemaDefinition> & {}
	readonly where: SchemaWhereFactory<SchemaDefinition>
}

/** Erases schema variance only inside the private model-to-Query delegation. */
interface SchemaModelQuery {
	byId(id: unknown): SchemaModelQuery
	readonly ast: Query<SchemaDefinition>['ast']
	readonly schema: SchemaDefinition
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

	if (typeof input.where !== 'function') {
		throw new TypeError('Schema model upsert where must be a function')
	}

	return immutableRecord({
		update: input.update as UpdateExpressionInput<SchemaDefinition> & {},
		where: input.where as SchemaWhereFactory<SchemaDefinition>,
	})
}

/** Restores the exact protected target without deriving identity from visible values. */
const createPersistedModelQuery = (
	record: SchemaModelRecord & { readonly objectId: unknown },
): SchemaModelQuery =>
	// Mutation results intentionally ignore the receiver's read projection.
	createSchemaModelQuery(record.schema).byId(record.objectId)

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

	/** Creates one handle only from trusted persisted state and protected identity. */
	relation(fieldName: string): Relation {
		const record = readPersistedSchemaModelRecord(this, 'relation')

		return createRelationHandle(record.schema, fieldName, record.objectId)
	}

	/** Persists only trusted draft state through Query's ordinary create terminal. */
	create(options?: QueryTerminalOptions): Promise<object> {
		const record = readSchemaModelRecord(this)

		assertSchemaModelState(record, 'draft', 'create')

		return createSchemaRecord(record.schema, record.values, options)
	}

	/** Resolves one unique conflict target without retaining execution on the model. */
	upsert(input: unknown, options?: QueryTerminalOptions): Promise<object> {
		const record = readSchemaModelRecord(this)

		assertSchemaModelState(record, 'draft', 'upsert')
		const normalized = readSchemaDraftUpsertInput(input)
		return upsertSchemaRecord(
			record.schema,
			{
				where: normalized.where,
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

		return executeQueryUpdateOne(
			createPersistedModelQuery(record) as Query<SchemaDefinition>,
			input as UpdateExpressionInput<SchemaDefinition> & {},
			options,
		)
	}

	/** Deletes only Runtime-issued object identity through Query's singular alias. */
	async delete(options?: QueryTerminalOptions): Promise<object | null> {
		const record = readPersistedSchemaModelRecord(this, 'delete')

		return executeQueryDeleteOne(
			createPersistedModelQuery(record) as Query<SchemaDefinition>,
			options,
		)
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
			value === null && isFieldNullable(definition)
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

		/** Creates one persisted model through the shared Runtime operation pipeline. */
		static create(
			input: InferCreateInput<SchemaDefinition>,
			options?: QueryTerminalOptions,
		): Promise<object> {
			return createSchemaRecord(
				DefinedSchemaModel as unknown as SchemaDefinition,
				input,
				options,
			)
		}

		/** Creates ordered models through one atomic bulk operation by default. */
		static createMany(
			inputs: readonly InferCreateInput<SchemaDefinition>[],
			options?: QueryBulkTerminalOptions,
		): Promise<unknown> {
			return createSchemaRecords(
				DefinedSchemaModel as unknown as SchemaDefinition,
				inputs,
				options,
			)
		}

		/** Updates one exact unique target. */
		static updateOne(
			input: SchemaUpdateOneInput<SchemaDefinition>,
			options?: QueryTerminalOptions,
		): Promise<object | null> {
			return updateSchemaRecord(
				DefinedSchemaModel as unknown as SchemaDefinition,
				input,
				options,
			)
		}

		/** Updates one explicit filtered set. */
		static updateMany(
			input: SchemaUpdateManyInput<SchemaDefinition>,
			options?: QueryTerminalOptions,
		): Promise<number> {
			return updateSchemaRecords(
				DefinedSchemaModel as unknown as SchemaDefinition,
				input,
				options,
			)
		}

		/** Creates or updates one exact unique target. */
		static upsert(
			input: SchemaUpsertInput<SchemaDefinition>,
			options?: QueryTerminalOptions,
		): Promise<object> {
			return upsertSchemaRecord(
				DefinedSchemaModel as unknown as SchemaDefinition,
				input,
				options,
			)
		}

		/** Upserts independently targeted inputs in order. */
		static upsertMany(
			inputs: readonly SchemaUpsertManyItemInput<SchemaDefinition>[],
			options?: QueryBulkTerminalOptions,
		): Promise<unknown> {
			return upsertSchemaRecords(
				DefinedSchemaModel as unknown as SchemaDefinition,
				inputs,
				options,
			)
		}

		/** Deletes one exact unique target. */
		static deleteOne(
			input: SchemaDeleteOneInput<SchemaDefinition>,
			options?: QueryTerminalOptions,
		): Promise<object | null> {
			return deleteSchemaRecord(
				DefinedSchemaModel as unknown as SchemaDefinition,
				input,
				options,
			)
		}

		/** Deletes one explicit filtered set. */
		static deleteMany(
			input: SchemaDeleteManyInput<SchemaDefinition>,
			options?: QueryTerminalOptions,
		): Promise<number> {
			return deleteSchemaRecords(
				DefinedSchemaModel as unknown as SchemaDefinition,
				input,
				options,
			)
		}

		/** Creates a pointer without binding Query or Runtime execution state. */
		static pointer(id: string): Pointer<SchemaClass> {
			return new Pointer(DefinedSchemaModel as unknown as SchemaClass, id)
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
