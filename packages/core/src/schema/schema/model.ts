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
	SchemaUpsertOneExecutionInput,
	SchemaUpsertManyExecutionInput,
	SchemaWhereFactory,
} from '../../query/operations/schema-commands.js'
import type {
	QueryBulkTerminalOptions,
	QueryTerminalOptions,
} from '../../query/operations/execution.js'
import type { WhereInput } from '../../query/filters/where.js'
import {
	normalizeQuerySelection,
	type QuerySelection,
} from '../../query/clauses/selection.js'
import {
	executeQueryDeleteOne,
	executeQueryUpdateOne,
	hydrateQueryFromAst,
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

/** Describes one flat instance result projection without retaining field definitions. */
export type SchemaModelSelection<TValues extends object> = Readonly<
	Partial<Record<Extract<keyof TValues, string>, boolean>>
>

type SchemaModelSelectionKeyWithValue<TSelection, TValue extends boolean> = {
	[TKey in keyof TSelection]-?: [TSelection[TKey]] extends [TValue]
		? TKey
		: never
}[keyof TSelection]

type SchemaModelSelectedField<
	TValues extends object,
	TSelection,
> = keyof TSelection extends never
	? never
	: [SchemaModelSelectionKeyWithValue<TSelection, true>] extends [never]
		? Exclude<
				Extract<keyof TValues, string>,
				SchemaModelSelectionKeyWithValue<TSelection, false>
			>
		: Extract<SchemaModelSelectionKeyWithValue<TSelection, true>, keyof TValues>

type LiteralSchemaModelSelection<TSelection> = {
	readonly [TKey in keyof TSelection]: boolean extends TSelection[TKey]
		? never
		: TSelection[TKey]
}

type ExactSchemaModelSelection<
	TValues extends object,
	TSelection,
> = TSelection &
	Readonly<Record<Exclude<keyof TSelection, keyof TValues>, never>>

type SchemaModelResultSelection<
	TValues extends object,
	TSelection extends SchemaModelSelection<TValues> | undefined,
> = [TSelection] extends [SchemaModelSelection<TValues>]
	? Readonly<{
			readonly select: SchemaModelSelection<TValues> &
				ExactSchemaModelSelection<TValues, TSelection> &
				LiteralSchemaModelSelection<TSelection>
		}>
	: Readonly<{ readonly select?: never }>

export interface SchemaDraftUpsertFields<TSchema extends SchemaDefinition> {
	/** Builds the exact equality target that Runtime verifies against a unique index. */
	readonly where: SchemaWhereFactory<TSchema>
	/** Applies this exact atomic update when the unique target already exists. */
	readonly update: UpdateExpressionInput<TSchema> & {}
}

/** Combines a draft's create values with one unique target, update, and projection. */
export type SchemaDraftUpsertInput<
	TSchema extends SchemaDefinition,
	TSelection extends SchemaModelSelection<InferObject<TSchema>> | undefined =
		undefined,
> = SchemaDraftUpsertFields<TSchema> &
	SchemaModelResultSelection<InferObject<TSchema>, TSelection>

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

/** Selects the visible result returned after one draft is persisted. */
export type SchemaModelCreateInput<
	TValues extends object,
	TSelection extends SchemaModelSelection<TValues> | undefined = undefined,
> = SchemaModelResultSelection<TValues, TSelection>

interface SchemaModelUpdateFields<TUpdateInput extends object> {
	/** Applies typed atomic field operations to the protected object identity. */
	readonly data: TUpdateInput
}

/** Combines one instance update expression with its exact result projection. */
export type SchemaModelUpdateCommandInput<
	TValues extends object,
	TUpdateInput extends object,
	TSelection extends SchemaModelSelection<TValues> | undefined = undefined,
> = SchemaModelUpdateFields<TUpdateInput> &
	SchemaModelResultSelection<TValues, TSelection>

/** Selects the visible pre-delete result of one protected object identity. */
export type SchemaModelDeleteInput<
	TValues extends object,
	TSelection extends SchemaModelSelection<TValues> | undefined = undefined,
> = SchemaModelResultSelection<TValues, TSelection>

/** Computes the visible model values produced by one literal instance selection. */
type SchemaModelSelectedValues<TValues extends object, TSelection> = [
	SchemaModelSelectedField<TValues, TSelection>,
] extends [never]
	? TValues
	: Simplify<
			Pick<
				TValues,
				Extract<SchemaModelSelectedField<TValues, TSelection>, keyof TValues>
			>
		>

/** Materializes a projected model exactly like Query result inference. */
type SelectedPersistedSchemaModel<
	TClassName extends string,
	TCompleteValues extends object,
	TUpdateInput extends object,
	TRelations extends object,
	TSelection,
> = Simplify<
	PersistedSchemaModel<
		TClassName,
		SchemaModelSelectedValues<TCompleteValues, TSelection>,
		TUpdateInput,
		TRelations,
		TCompleteValues
	>
>

/** Exposes only persistence commands valid for a caller-created immutable draft. */
export interface SchemaDraftCommands<
	TClassName extends string,
	TCompleteValues extends object,
	TUpdateInput extends object,
	TRelations extends object,
	TUpsertFields extends object,
> {
	/**
	 * Persists this draft and returns its selected model fields.
	 *
	 * @example `await draft.create({ select: { id: true, title: true } })`
	 */
	create<const TSelection extends SchemaModelSelection<TCompleteValues>>(
		input: SchemaModelCreateInput<TCompleteValues, TSelection>,
		options?: QueryTerminalOptions,
	): Promise<
		SelectedPersistedSchemaModel<
			TClassName,
			TCompleteValues,
			TUpdateInput,
			TRelations,
			TSelection
		>
	>
	/**
	 * Persists this draft and returns its complete model.
	 *
	 * @example `const created = await new Post({ title: "Hello" }).create({})`
	 */
	create(
		input: SchemaModelCreateInput<TCompleteValues>,
		options?: QueryTerminalOptions,
	): Promise<
		PersistedSchemaModel<
			TClassName,
			TCompleteValues,
			TUpdateInput,
			TRelations,
			TCompleteValues
		>
	>
	/**
	 * Creates this draft or updates one target and returns selected model fields.
	 *
	 * @example `await draft.upsert({ where: { slug: { eq: "hello" } }, update: { views: increment(1) }, select: { id: true } })`
	 */
	upsert<const TSelection extends SchemaModelSelection<TCompleteValues>>(
		input: TUpsertFields &
			SchemaModelResultSelection<TCompleteValues, TSelection>,
		options?: QueryTerminalOptions,
	): Promise<
		SelectedPersistedSchemaModel<
			TClassName,
			TCompleteValues,
			TUpdateInput,
			TRelations,
			TSelection
		>
	>
	/** Creates this draft or updates one unique target and returns the complete model. */
	upsert(
		input: TUpsertFields &
			SchemaModelResultSelection<TCompleteValues, undefined>,
		options?: QueryTerminalOptions,
	): Promise<
		PersistedSchemaModel<
			TClassName,
			TCompleteValues,
			TUpdateInput,
			TRelations,
			TCompleteValues
		>
	>
}

/** Exposes only object-targeted commands valid for trusted persisted instances. */
export interface SchemaResultCommands<
	TClassName extends string,
	TCompleteValues extends object,
	TUpdateInput extends object,
	TRelations extends object,
> {
	/**
	 * Updates this protected object identity and returns selected model fields.
	 *
	 * @example `const updated = await post.update({ data: { title: "Updated" }, select: { id: true } })`
	 */
	update<const TSelection extends SchemaModelSelection<TCompleteValues>>(
		input: SchemaModelUpdateCommandInput<
			TCompleteValues,
			TUpdateInput,
			TSelection
		>,
		options?: QueryTerminalOptions,
	): Promise<SelectedPersistedSchemaModel<
		TClassName,
		TCompleteValues,
		TUpdateInput,
		TRelations,
		TSelection
	> | null>
	/**
	 * Updates this protected object identity and returns the complete model.
	 *
	 * @example `const updated = await post.update({ data: { title: "Updated" } })`
	 */
	update(
		input: SchemaModelUpdateCommandInput<TCompleteValues, TUpdateInput>,
		options?: QueryTerminalOptions,
	): Promise<PersistedSchemaModel<
		TClassName,
		TCompleteValues,
		TUpdateInput,
		TRelations,
		TCompleteValues
	> | null>
	/**
	 * Deletes this protected object identity and returns selected pre-delete fields.
	 *
	 * @example `const deleted = await post.delete({ select: { id: true } })`
	 */
	delete<const TSelection extends SchemaModelSelection<TCompleteValues>>(
		input: SchemaModelDeleteInput<TCompleteValues, TSelection>,
		options?: QueryTerminalOptions,
	): Promise<SelectedPersistedSchemaModel<
		TClassName,
		TCompleteValues,
		TUpdateInput,
		TRelations,
		TSelection
	> | null>
	/**
	 * Deletes this protected object identity and returns the complete model.
	 *
	 * @example `const deleted = await post.delete({})`
	 */
	delete(
		input: SchemaModelDeleteInput<TCompleteValues>,
		options?: QueryTerminalOptions,
	): Promise<PersistedSchemaModel<
		TClassName,
		TCompleteValues,
		TUpdateInput,
		TRelations,
		TCompleteValues
	> | null>
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
	SchemaResultCommands<TClassName, TCompleteValues, TUpdateInput, TRelations> &
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
			TSchema['className'],
			InferObject<TSchema>,
			CompactSchemaModelUpdateInput<
				Simplify<UpdateSetInput<TSchema>>,
				Simplify<NumericUpdateInput<TSchema>>
			>,
			SchemaResultRelations<TSchema> & SchemaResultCapabilitiesOf<TSchema>,
			SchemaDraftUpsertFields<TSchema>
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
	readonly select?: QuerySelection<SchemaDefinition>
	readonly update: UpdateExpressionInput<SchemaDefinition> & {}
	readonly where: SchemaWhereFactory<SchemaDefinition>
}

interface NormalizedSchemaModelSelectionInput {
	readonly select?: QuerySelection<SchemaDefinition>
}

interface NormalizedSchemaModelUpdateInput extends NormalizedSchemaModelSelectionInput {
	readonly data: UpdateExpressionInput<SchemaDefinition> & {}
}

/** Erases schema variance only inside the private model-to-Query delegation. */
interface SchemaModelQuery {
	where(input: WhereInput<SchemaDefinition>): SchemaModelQuery
	readonly ast: Query<SchemaDefinition>['ast']
	readonly schema: SchemaDefinition
}

const createSchemaModelQuery = (schema: SchemaDefinition): SchemaModelQuery =>
	// Public model types validate exact fields before this private variance boundary.
	new Query(schema)

const readSchemaModelSelectionInput = (
	input: unknown,
	command: 'create' | 'delete',
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
		where: input.where as SchemaWhereFactory<SchemaDefinition>,
	})
}

/** Restores the exact protected target without deriving identity from visible values. */
const createPersistedModelQuery = (
	record: SchemaModelRecord & { readonly objectId: unknown },
	selection?: QuerySelection<SchemaDefinition>,
): SchemaModelQuery => {
	// Mutation results intentionally ignore the receiver's read projection.
	const query = createSchemaModelQuery(record.schema).where({
		id: { eq: record.objectId },
	} as WhereInput<typeof record.schema>)

	if (selection === undefined) {
		return query
	}

	return hydrateQueryFromAst<SchemaDefinition, never>(
		immutableRecord({
			...query.ast,
			selection: normalizeQuerySelection(record.schema, selection),
		}),
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

	/** Creates one handle only from trusted persisted state and protected identity. */
	relation(fieldName: string): Relation {
		const record = readPersistedSchemaModelRecord(this, 'relation')

		return createRelationHandle(record.schema, fieldName, record.objectId)
	}

	/** Persists only trusted draft state through Query's ordinary create terminal. */
	create(input: unknown, options?: QueryTerminalOptions): Promise<object> {
		const record = readSchemaModelRecord(this)

		assertSchemaModelState(record, 'draft', 'create')
		const normalized = readSchemaModelSelectionInput(input, 'create')

		return createSchemaRecord(
			record.schema,
			{ data: record.values, ...normalized },
			options,
		)
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
				...(normalized.select === undefined
					? {}
					: { select: normalized.select }),
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
		const normalized = readSchemaModelUpdateInput(input)

		return executeQueryUpdateOne(
			createPersistedModelQuery(
				record,
				normalized.select,
			) as Query<SchemaDefinition>,
			normalized.data,
			options,
		)
	}

	/** Deletes only Runtime-issued object identity through Query's singular alias. */
	async delete(
		input: unknown,
		options?: QueryTerminalOptions,
	): Promise<object | null> {
		const record = readPersistedSchemaModelRecord(this, 'delete')
		const normalized = readSchemaModelSelectionInput(input, 'delete')

		return executeQueryDeleteOne(
			createPersistedModelQuery(
				record,
				normalized.select,
			) as Query<SchemaDefinition>,
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
		static createOne(
			input: SchemaCreateOneExecutionInput<SchemaDefinition>,
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
			input: SchemaCreateManyExecutionInput<SchemaDefinition>,
			options?: QueryBulkTerminalOptions,
		): Promise<unknown> {
			return createSchemaRecords(
				DefinedSchemaModel as unknown as SchemaDefinition,
				input,
				options,
			)
		}

		/** Updates one exact unique target. */
		static updateOne(
			input: SchemaUpdateOneExecutionInput<SchemaDefinition>,
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
			input: SchemaUpdateManyExecutionInput<SchemaDefinition>,
			options?: QueryTerminalOptions,
		): Promise<readonly object[]> {
			return updateSchemaRecords(
				DefinedSchemaModel as unknown as SchemaDefinition,
				input,
				options,
			)
		}

		/** Creates or updates one exact unique target. */
		static upsertOne(
			input: SchemaUpsertOneExecutionInput<SchemaDefinition>,
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
			input: SchemaUpsertManyExecutionInput<SchemaDefinition>,
			options?: QueryBulkTerminalOptions,
		): Promise<unknown> {
			return upsertSchemaRecords(
				DefinedSchemaModel as unknown as SchemaDefinition,
				input,
				options,
			)
		}

		/** Deletes one exact unique target. */
		static deleteOne(
			input: SchemaDeleteOneExecutionInput<SchemaDefinition>,
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
			input: SchemaDeleteManyExecutionInput<SchemaDefinition>,
			options?: QueryTerminalOptions,
		): Promise<readonly object[]> {
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
