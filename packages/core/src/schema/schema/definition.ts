import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	createSchemaExtensionBindingContext,
	defineExtensions,
	type SchemaExtensionBindingContext,
	type SchemaExtension,
} from '../extensions/definition.js'
import type { GenericField } from '../fields/base/contract.js'
import { assertFieldDefinition } from '../fields/base/definition.js'
import type { OperationOptions } from '../../query/operations/options.js'
import type {
	SchemaCreateManyInput,
	SchemaCreateOneInput,
	SchemaDeleteManyInput,
	SchemaDeleteOneInput,
	SchemaUpdateManyInput,
	SchemaUpdateOneInput,
	SchemaUpsertOneInput,
	SchemaUpsertManyInput,
} from '../../query/operations/schema-commands.js'
import type { InferQueryResult } from '../../query/query/result.js'
import type {
	CountInput,
	ExactReadInput,
	ExistsInput,
	FindManyInput,
	FindOneInput,
	GetInput,
	QueryIncludedFieldFromInput,
	QuerySelectedFieldFromInput,
} from '../../query/query/input.js'
import type {
	QuerySelectedField,
	QuerySelection,
} from '../../query/clauses/selection.js'
import type { InferCreateInput, InferFields } from '../inference/types.js'
import type { Pointer } from '../relations/pointer.js'
import {
	createSchemaModelCapabilityContext,
	createSchemaModelClass,
	defineSchemaModelResultCapabilities,
	finalizeSchemaModelClass,
	type SchemaDraft,
	type SchemaModelCapabilityContext,
	type SchemaResultCapabilityCarrier,
} from './model.js'
import {
	normalizeSchemaIndexes,
	snapshotSchemaIndexOptions,
	type SchemaFieldName,
	type SchemaIndexDefinition,
	type SchemaIndexOptions,
} from './indexes.js'
import {
	reservedSystemFieldNames,
	systemFields,
	type ReservedSystemFieldName,
	type SystemFields,
} from './system-fields.js'
import type { SchemaHooks } from '../hooks/contracts.js'
import { declareSchemaHooks } from '../hooks/declarations.js'
import type { SchemaAccess } from '../access/contracts.js'
import { declareSchemaAccess } from '../access/declarations.js'
import {
	executeSchemaFieldsCallback,
	type SchemaFieldBuilderDeclaration,
} from './field-builder.js'
import type { FieldBuilderMethodResolver } from './field-builder-methods.js'

/**
 * Collects named field definitions without erasing their concrete literals.
 */
export type SchemaFields = Readonly<Record<string, GenericField>>

/** Defers field factory execution until one application compiles its schemas. */
export type SchemaFieldDeclaration<
	TFields extends SchemaFields = SchemaFields,
> = () => TFields

/**
 * Collects schema-scoped plugin metadata in deterministic declaration order.
 */
export type SchemaExtensions = readonly SchemaExtension<string, object>[]

type UnionToIntersection<TValue> = (
	TValue extends unknown ? (value: TValue) => void : never
) extends (value: infer TIntersection) => void
	? TIntersection
	: never

/** Resolves every extension-owned field into the ordinary schema field map. */
export type SchemaExtensionFields<TExtensions extends SchemaExtensions> = [
	TExtensions[number],
] extends [never]
	? Readonly<Record<never, never>>
	: UnionToIntersection<TExtensions[number]['fields']>

/** Combines developer fields with fields reserved by installed schema extensions. */
export type ResolvedSchemaFields<
	TFields extends SchemaFields,
	TExtensions extends SchemaExtensions,
> = Readonly<TFields> & Readonly<SchemaExtensionFields<TExtensions>>

/** Infers the developer-field snapshot supplied to contextual schema extensions. */
export type SchemaExtensionData<TFields extends SchemaFields> = InferFields<
	TFields,
	'object'
>

/** Supports ordinary extension tuples and sibling-field-aware declarations. */
export type SchemaExtensionDeclaration<
	TFields extends SchemaFields,
	TExtensions extends SchemaExtensions,
> =
	| TExtensions
	| ((
			context: SchemaExtensionBindingContext<SchemaExtensionData<TFields>>,
	  ) => TExtensions)

/**
 * Describes the developer input accepted by `Schema.define()`.
 */
export interface SchemaOptions<
	TClassName extends string = string,
	TFields extends SchemaFields = SchemaFields,
	TExtensions extends SchemaExtensions = readonly [],
> {
	/**
	 * Declares the stable logical name used by queries, transports, and adapters.
	 *
	 * @example `className: "Post"`
	 */
	readonly className: TClassName
	/**
	 * Declares fields through the canonical name-first builder or a migration field map.
	 * Framework-owned `id`, `createdAt`, and `updatedAt` fields are added automatically.
	 *
	 * @example `fields(field) { field.string('title'); field.boolean('published') }`
	 */
	readonly fields:
		TFields | SchemaFieldDeclaration<TFields> | SchemaFieldBuilderDeclaration
	/**
	 * Declares adapter-neutral composite indexes containing at least two fields.
	 * Single-field indexes belong on the corresponding field through `indexed`.
	 *
	 * @example `indexes: [{ fields: ["authorId", "createdAt"] }]`
	 */
	readonly indexes?: readonly SchemaIndexOptions<
		SchemaFieldName<NoInfer<TFields>>
	>[]
	/**
	 * Attaches immutable schema metadata interpreted by installed plugins.
	 * A callback may bind extension options to the exact sibling-field values.
	 * Extension order is preserved and duplicate identities are rejected.
	 *
	 * @example `extensions: [permissionsExtension]`
	 */
	readonly extensions?: SchemaExtensionDeclaration<
		NoInfer<TFields>,
		TExtensions
	>
	/**
	 * Groups native allow, row, and prepared-item policies by operation.
	 * Rules stay private to Runtime and never alter physical schema metadata.
	 *
	 * @example `access: { delete: ({ context }) => context.access.mode === "master" }`
	 */
	readonly access?: SchemaAccess<
		SchemaClass<NoInfer<TClassName>, NoInfer<TFields>, NoInfer<TExtensions>>
	>
	/**
	 * Declares immutable schema lifecycle behavior without requiring a plugin.
	 * Hook functions stay outside physical schema metadata and migration plans.
	 *
	 * @example `hooks: { beforeOperation: { update: ({ item }) => audit(item) } }`
	 */
	readonly hooks?: SchemaHooks<
		SchemaClass<NoInfer<TClassName>, NoInfer<TFields>, NoInfer<TExtensions>>
	>
}

/** Preserves the existing map declaration during the milestone migration. */
export type ImmediateSchemaOptions<
	TClassName extends string,
	TFields extends SchemaFields,
	TExtensions extends SchemaExtensions,
> = Omit<SchemaOptions<TClassName, TFields, TExtensions>, 'fields'> & {
	/**
	 * Maps developer field names to reusable UltimaBase field definitions.
	 * @example `fields: { title: stringField() }`
	 */
	readonly fields: TFields
}

/** Declares a field map that resolves during application static compilation. */
export type DeferredSchemaOptions<
	TClassName extends string,
	TFields extends SchemaFields,
	TExtensions extends SchemaExtensions,
> = Omit<SchemaOptions<TClassName, TFields, TExtensions>, 'fields'> & {
	/**
	 * Defers the field map until application static compilation.
	 * @example `fields: () => ({ title: stringField() })`
	 */
	readonly fields: SchemaFieldDeclaration<TFields>
}

/** Declares fields imperatively through the canonical name-first builder. */
export type BuilderSchemaOptions<
	TClassName extends string,
	TExtensions extends SchemaExtensions,
> = Omit<SchemaOptions<TClassName, SchemaFields, TExtensions>, 'fields'> & {
	/**
	 * Collects fields during application static compilation.
	 * @example `fields(field) { field.string('title') }`
	 */
	readonly fields: SchemaFieldBuilderDeclaration
}

type SchemaFieldSource =
	SchemaFields | SchemaFieldDeclaration | SchemaFieldBuilderDeclaration

type SchemaFieldsFromSource<TSource extends SchemaFieldSource> =
	TSource extends SchemaFieldDeclaration<infer TFields>
		? TFields
		: TSource extends SchemaFieldBuilderDeclaration
			? SchemaFields
			: Extract<TSource, SchemaFields>

type SchemaDeclarationOptions<
	TClassName extends string,
	TSource extends SchemaFieldSource,
	TExtensions extends SchemaExtensions,
> = Omit<
	SchemaOptions<TClassName, SchemaFieldsFromSource<TSource>, TExtensions>,
	'fields'
> & {
	/**
	 * Declares developer fields immediately or defers them until static compilation.
	 * @example `fields: () => ({ title: stringField() })`
	 */
	readonly fields: TSource
}

/**
 * Carries immutable schema metadata while retaining every declaration literal.
 */
export interface SchemaMetadata<
	TClassName extends string = string,
	TFields extends SchemaFields = SchemaFields,
	TExtensions extends SchemaExtensions = SchemaExtensions,
> {
	/** The exact logical class name supplied to `Schema.define()`. */
	readonly className: TClassName
	/** The immutable developer and framework-owned field map. */
	readonly fields: ResolvedSchemaFields<TFields, TExtensions> &
		Readonly<SystemFields>
	/** The immutable normalized field-level and composite index declarations. */
	readonly indexes: readonly SchemaIndexDefinition<
		SchemaFieldName<ResolvedSchemaFields<TFields, TExtensions>>
	>[]
	/** The immutable ordered schema-extension tuple. */
	readonly extensions: readonly [...TExtensions]
}

/** Carries trusted schema identity plus the neutral metadata used by Core. */
export interface SchemaDefinition<
	TClassName extends string = string,
	TFields extends SchemaFields = SchemaFields,
	TExtensions extends SchemaExtensions = SchemaExtensions,
> extends SchemaMetadata<TClassName, TFields, TExtensions> {
	/** The immutable transport-neutral metadata consumed by infrastructure. */
	readonly definition: SchemaMetadata<TClassName, TFields, TExtensions>
}

/** Represents the constructible schema class registered by UltimaBase. */
export interface SchemaClass<
	TClassName extends string = string,
	TFields extends SchemaFields = SchemaFields,
	TExtensions extends SchemaExtensions = SchemaExtensions,
> extends SchemaDefinition<TClassName, TFields, TExtensions> {
	/** Creates one immutable typed draft without performing database I/O. */
	new (
		input: InferCreateInput<SchemaDefinition<TClassName, TFields, TExtensions>>,
	): SchemaDraft<this>
	/**
	 * Reads matching rows from one canonical object input.
	 *
	 * The command inherits the active request or accepts explicit root options.
	 *
	 * @example `await Post.findMany({ where: { published: { eq: true } } }, { ultimabase })`
	 */
	findMany<const TInput extends FindManyInput<this>>(
		input: ExactReadInput<this, TInput, FindManyInput<this>>,
		options?: OperationOptions,
	): Promise<
		readonly InferQueryResult<
			this,
			QuerySelectedFieldFromInput<this, TInput>,
			QueryIncludedFieldFromInput<this, TInput>
		>[]
	>
	/** Reads every visible row when no clauses are supplied. */
	findMany(
		input?: undefined,
		options?: OperationOptions,
	): Promise<readonly InferQueryResult<this>[]>
	/**
	 * Reads the first matching row or `null` from one canonical object input.
	 *
	 * @example `await Post.findOne({ orderBy: [{ createdAt: 'desc' }] })`
	 */
	findOne<const TInput extends FindOneInput<this>>(
		input: ExactReadInput<this, TInput, FindOneInput<this>>,
		options?: OperationOptions,
	): Promise<InferQueryResult<
		this,
		QuerySelectedFieldFromInput<this, TInput>,
		QueryIncludedFieldFromInput<this, TInput>
	> | null>
	/** Reads the first visible row when no clauses are supplied. */
	findOne(
		input?: undefined,
		options?: OperationOptions,
	): Promise<InferQueryResult<this> | null>
	/**
	 * Reads one exact identifier with its requested projection.
	 *
	 * @example `await Post.get({ id: postId, select: { title: true } })`
	 * @throws `FrameworkError` with code `NOT_FOUND` when the object is absent.
	 */
	get<const TInput extends GetInput<this>>(
		input: ExactReadInput<this, TInput, GetInput<this>>,
		options?: OperationOptions,
	): Promise<
		InferQueryResult<
			this,
			QuerySelectedFieldFromInput<this, TInput>,
			QueryIncludedFieldFromInput<this, TInput>
		>
	>
	/**
	 * Counts rows matching the canonical object filter.
	 *
	 * @example `await Post.count({ where: { published: { eq: true } } })`
	 */
	count(input?: CountInput<this>, options?: OperationOptions): Promise<number>
	/**
	 * Tests whether one row matches the canonical object filter.
	 *
	 * @example `await Post.exists({ where: { slug: { eq: 'release' } } })`
	 */
	exists(
		input?: ExistsInput<this>,
		options?: OperationOptions,
	): Promise<boolean>
	/**
	 * Creates one row and returns its selected model fields.
	 *
	 * @example `await Post.createOne({ data: { title: 'Hello' }, select: { id: true, title: true } })`
	 */
	createOne<const TSelection extends QuerySelection<this>>(
		input: SchemaCreateOneInput<this, TSelection>,
		options?: OperationOptions,
	): Promise<InferQueryResult<this, QuerySelectedField<this, TSelection>>>
	/**
	 * Creates one row and returns its complete persisted model.
	 *
	 * @example `await Post.createOne({ data: { title: 'Hello' } })`
	 */
	createOne(
		input: SchemaCreateOneInput<this>,
		options?: OperationOptions,
	): Promise<InferQueryResult<this>>
	/**
	 * Creates input rows in order through one all-or-nothing transaction.
	 *
	 * @example `await Post.createMany({ data: inputs, select: { id: true, title: true } })`
	 */
	createMany<const TSelection extends QuerySelection<this>>(
		input: SchemaCreateManyInput<this, TSelection>,
		options?: OperationOptions,
	): Promise<
		readonly InferQueryResult<this, QuerySelectedField<this, TSelection>>[]
	>
	/**
	 * Creates ordered rows in one all-or-nothing transaction and returns their complete persisted models.
	 *
	 * @example `await Post.createMany({ data: inputs })`
	 */
	createMany(
		input: SchemaCreateManyInput<this>,
		options?: OperationOptions,
	): Promise<readonly InferQueryResult<this>[]>
	/**
	 * Updates one unique target, or returns `null` when its where clause matches none.
	 *
	 * @example `await Post.updateOne({ where: { id: { eq: id } }, data, select: { id: true, title: true } })`
	 */
	updateOne<const TSelection extends QuerySelection<this>>(
		input: SchemaUpdateOneInput<this, TSelection>,
		options?: OperationOptions,
	): Promise<InferQueryResult<
		this,
		QuerySelectedField<this, TSelection>
	> | null>
	/**
	 * Updates one unique target and returns its complete model.
	 *
	 * @example `await Post.updateOne({ where: { id: { eq: id } }, data })`
	 */
	updateOne(
		input: SchemaUpdateOneInput<this>,
		options?: OperationOptions,
	): Promise<InferQueryResult<this> | null>
	/**
	 * Updates every selected row and returns its requested post-update fields.
	 *
	 * @example `await Post.updateMany({ data: [{ where: { id: { eq: postId } }, data }], select: { id: true, title: true } })`
	 */
	updateMany<const TSelection extends QuerySelection<this>>(
		input: SchemaUpdateManyInput<this, TSelection>,
		options?: OperationOptions,
	): Promise<
		readonly InferQueryResult<this, QuerySelectedField<this, TSelection>>[]
	>
	/**
	 * Updates every selected row and returns only its identifier by default.
	 *
	 * @example `await Post.updateMany({ data: [{ where: { id: { eq: postId } }, data }] })`
	 */
	updateMany(
		input: SchemaUpdateManyInput<this>,
		options?: OperationOptions,
	): Promise<
		readonly InferQueryResult<
			this,
			Extract<'id', QuerySelectedField<this, { readonly id: true }>>
		>[]
	>
	/**
	 * Creates or updates one row selected by an exact unique target.
	 *
	 * @example `await Post.upsertOne({ where: { id: { eq: id } }, create, update, select: { id: true, title: true } })`
	 */
	upsertOne<const TSelection extends QuerySelection<this>>(
		input: SchemaUpsertOneInput<this, TSelection>,
		options?: OperationOptions,
	): Promise<InferQueryResult<this, QuerySelectedField<this, TSelection>>>
	/** Creates or updates one unique target and returns its complete model. */
	upsertOne(
		input: SchemaUpsertOneInput<this>,
		options?: OperationOptions,
	): Promise<InferQueryResult<this>>
	/**
	 * Upserts independently targeted inputs in declaration order.
	 *
	 * @example `await Post.upsertMany({ data: items, select: { id: true, title: true } })`
	 */
	upsertMany<const TSelection extends QuerySelection<this>>(
		input: SchemaUpsertManyInput<this, TSelection>,
		options?: OperationOptions,
	): Promise<
		readonly InferQueryResult<this, QuerySelectedField<this, TSelection>>[]
	>
	/**
	 * Upserts ordered items atomically and returns their complete persisted models.
	 *
	 * @example `await Post.upsertMany({ data: items })`
	 */
	upsertMany(
		input: SchemaUpsertManyInput<this>,
		options?: OperationOptions,
	): Promise<readonly InferQueryResult<this>[]>
	/**
	 * Deletes one unique target, or returns `null` when its where clause matches none.
	 *
	 * @example `await Post.deleteOne({ where: { id: { eq: id } }, select: { id: true, title: true } })`
	 */
	deleteOne<const TSelection extends QuerySelection<this>>(
		input: SchemaDeleteOneInput<this, TSelection>,
		options?: OperationOptions,
	): Promise<InferQueryResult<
		this,
		QuerySelectedField<this, TSelection>
	> | null>
	/**
	 * Deletes one uniquely identified row and returns its complete model.
	 *
	 * @example `await Post.deleteOne({ where: { id: { eq: id } } })`
	 */
	deleteOne(
		input: SchemaDeleteOneInput<this>,
		options?: OperationOptions,
	): Promise<InferQueryResult<this> | null>
	/**
	 * Deletes every selected row and returns its requested pre-delete fields.
	 *
	 * @example `await Post.deleteMany({ where: [{ id: { eq: postId } }], select: { id: true, title: true } })`
	 */
	deleteMany<const TSelection extends QuerySelection<this>>(
		input: SchemaDeleteManyInput<this, TSelection>,
		options?: OperationOptions,
	): Promise<
		readonly InferQueryResult<this, QuerySelectedField<this, TSelection>>[]
	>
	/**
	 * Deletes every selected row and returns only its identifier by default.
	 *
	 * @example `await Post.deleteMany({ where: [{ id: { eq: postId } }] })`
	 */
	deleteMany(
		input: SchemaDeleteManyInput<this>,
		options?: OperationOptions,
	): Promise<
		readonly InferQueryResult<
			this,
			Extract<'id', QuerySelectedField<this, { readonly id: true }>>
		>[]
	>
	/** Creates one immutable pointer to an object of this exact schema. */
	pointer(id: string): Pointer<this>
}

/** Collects additional static capabilities owned by a schema specialization. */
export type SchemaStaticCapabilities = object

/** Creates static capabilities after the exact schema class exists. */
export type SchemaStaticCapabilityFactory<
	TSchema extends object,
	TCapabilities extends SchemaStaticCapabilities,
> = (schema: TSchema) => TCapabilities

/** Groups static helpers and persisted commands contributed by one specialization. */
export interface SchemaClassCapabilities<
	TStatics extends SchemaStaticCapabilities,
	TResults extends object,
> {
	readonly statics: TStatics
	readonly results: TResults
}

/** Creates specialized class capabilities after exact schema identity exists. */
export type SchemaClassCapabilityFactory<
	TSchema extends SchemaDefinition,
	TStatics extends SchemaStaticCapabilities,
	TResults extends object,
> = (
	context: SchemaModelCapabilityContext<TSchema>,
) => SchemaClassCapabilities<TStatics, TResults>

type ReservedWhereLogicalFieldName = 'AND' | 'NOT' | 'OR'

type ReservedFieldCollision<TFields extends SchemaFields> =
	string extends keyof TFields
		? unknown
		: Extract<
					keyof TFields,
					ReservedSystemFieldName | ReservedWhereLogicalFieldName
			  > extends never
			? unknown
			: never

// A versioned global symbol preserves constructor provenance across package copies.
const schemaDefinitionMarker = Symbol.for(
	'@ultimabase/core/schema-definition/v1',
)
const emptySchemaExtensions: readonly [] = immutableArray([])
const reservedWhereLogicalFieldNames = new Set(['AND', 'NOT', 'OR'])
const reservedModelFieldNames = new Set([
	'create',
	'delete',
	'get',
	'relation',
	'then',
	'toJSON',
	'update',
	'upsert',
])

/** Explains why a deferred schema cannot expose its final runtime definition. */
export type SchemaCompilationFailureReason =
	| 'callback-threw'
	| 'incompatible-definition'
	| 'invalid-result'
	| 'not-compiled'

/** Reports one deterministic static schema-compilation failure. */
export class SchemaCompilationError extends Error {
	readonly code = 'SCHEMA_COMPILATION_FAILED' as const
	readonly className: string
	readonly reason: SchemaCompilationFailureReason

	constructor(
		reason: SchemaCompilationFailureReason,
		className: string,
		message: string,
		options?: ErrorOptions,
	) {
		super(message, options)
		this.name = 'SchemaCompilationError'
		this.className = className
		this.reason = reason
		Object.freeze(this)
	}
}

interface NormalizedSchemaDeclaration {
	readonly className: string
	readonly extensions: SchemaExtensions
	readonly fields:
		SchemaFields | SchemaFieldDeclaration | SchemaFieldBuilderDeclaration
	readonly indexes: readonly SchemaIndexOptions[] | undefined
	readonly deferred: boolean
}

interface CompiledSchemaRecord {
	readonly definition: SchemaMetadata
	readonly developerFields: SchemaFields
	readonly targets: readonly SchemaCompiledTargetIdentity[] | undefined
}

/** Retains one resolved target without coupling compilation to the target graph implementation. */
export interface SchemaCompiledTargetIdentity {
	readonly fieldPath: readonly string[]
	readonly target: SchemaDefinition
}

/** Holds one application-local candidate until the complete graph validates. */
export interface PreparedSchemaCompilation {
	readonly definition: SchemaMetadata
	readonly developerFields: SchemaFields
	readonly schema: SchemaDefinition
}

const schemaDeclarations = new WeakMap<
	SchemaDefinition,
	NormalizedSchemaDeclaration
>()
const compiledSchemaRecords = new WeakMap<
	SchemaDefinition,
	CompiledSchemaRecord
>()

const readCompiledSchemaRecord = (
	schema: SchemaDefinition,
): CompiledSchemaRecord => {
	const record = compiledSchemaRecords.get(schema)

	if (record === undefined) {
		throw new SchemaCompilationError(
			'not-compiled',
			schema.className,
			`Schema ${schema.className} has not been compiled by an application`,
		)
	}

	return record
}

const defineSchemaStaticCapabilities = <
	const TSchema extends object,
	const TCapabilities extends SchemaStaticCapabilities,
>(
	schema: TSchema,
	createCapabilities: SchemaStaticCapabilityFactory<TSchema, TCapabilities>,
): TSchema & TCapabilities => {
	if (typeof createCapabilities !== 'function') {
		throw new TypeError('createCapabilities must be a function')
	}

	const capabilities: unknown = createCapabilities(schema)

	if (!isPlainRecord(capabilities)) {
		throw new TypeError('schema static capabilities must be a plain object')
	}

	for (const [name, capability] of Object.entries(capabilities)) {
		assertNonEmptyString(name, 'schema static capability name')

		if (name in schema) {
			throw new TypeError(`Reserved schema static capability: ${name}`)
		}

		// Static specialization methods follow native class-method visibility.
		Object.defineProperty(schema, name, {
			configurable: false,
			enumerable: false,
			value: capability,
			writable: false,
		})
	}

	return schema as TSchema & TCapabilities
}

const normalizeSchemaExtensions = <
	TClassName extends string,
	TFields extends SchemaFields,
	TExtensions extends SchemaExtensions,
>(
	options: SchemaOptions<TClassName, TFields, TExtensions>,
): readonly [...TExtensions] => {
	const declaredExtensions =
		typeof options.extensions === 'function'
			? options.extensions(
					createSchemaExtensionBindingContext<SchemaExtensionData<TFields>>(),
				)
			: options.extensions

	return (
		declaredExtensions === undefined
			? emptySchemaExtensions
			: defineExtensions(declaredExtensions)
	) as readonly [...TExtensions]
}

const assertSchemaFields: (
	fields: unknown,
	className: string,
	deferred: boolean,
) => asserts fields is SchemaFields = (fields, className, deferred) => {
	if (!isPlainRecord(fields)) {
		throw new SchemaCompilationError(
			'invalid-result',
			className,
			`Schema ${className} fields declaration must return a plain object`,
		)
	}

	assertNoReservedFieldCollision(fields)
	const fieldPath = deferred ? `${className}.fields` : 'fields'
	const fieldNamePath = deferred
		? `${className} schema field name`
		: 'schema field name'

	for (const [name, field] of Object.entries(fields)) {
		assertNonEmptyString(name, fieldNamePath)
		assertFieldDefinition(field, `${fieldPath}.${name}`)
	}
}

const compileSchemaRecord = (
	declaration: NormalizedSchemaDeclaration,
	developerFieldsInput: unknown,
): CompiledSchemaRecord => {
	assertSchemaFields(
		developerFieldsInput,
		declaration.className,
		declaration.deferred,
	)
	const developerFields = immutableRecord(developerFieldsInput)
	const extensionFields = collectSchemaExtensionFields(
		developerFields,
		declaration.extensions,
	)
	const declaredFields = immutableRecord({
		...developerFields,
		...extensionFields,
	})
	const fields = immutableRecord({
		...declaredFields,
		...systemFields,
	})
	const indexes = normalizeSchemaIndexes(declaredFields, declaration.indexes)
	const definition = immutableRecord({
		className: declaration.className,
		fields,
		indexes,
		extensions: declaration.extensions,
	})

	return immutableRecord({
		definition,
		developerFields,
		targets: undefined,
	})
}

const executeSchemaFieldDeclaration = (
	declaration: NormalizedSchemaDeclaration,
	fieldMethods?: FieldBuilderMethodResolver,
): unknown => {
	if (typeof declaration.fields !== 'function') {
		return declaration.fields
	}

	try {
		return executeSchemaFieldsCallback(
			declaration.fields,
			`${declaration.className}.fields`,
			fieldMethods,
		)
	} catch (cause: unknown) {
		throw new SchemaCompilationError(
			'callback-threw',
			declaration.className,
			`Schema ${declaration.className} fields declaration threw during compilation`,
			{ cause },
		)
	}
}

const areDeclarationValuesCompatible = (
	left: unknown,
	right: unknown,
	seen: WeakMap<object, WeakSet<object>> = new WeakMap(),
): boolean => {
	if (Object.is(left, right)) return true

	if (typeof left === 'function' || typeof right === 'function') {
		return typeof left === 'function' && typeof right === 'function'
	}

	if (
		typeof left !== 'object' ||
		left === null ||
		typeof right !== 'object' ||
		right === null
	) {
		return false
	}

	const seenRights = seen.get(left)

	if (seenRights?.has(right) === true) return true
	if (seenRights === undefined) {
		seen.set(left, new WeakSet([right]))
	} else {
		seenRights.add(right)
	}

	if (left instanceof Date || right instanceof Date) {
		return (
			left instanceof Date &&
			right instanceof Date &&
			left.getTime() === right.getTime()
		)
	}

	if (left instanceof RegExp || right instanceof RegExp) {
		return (
			left instanceof RegExp &&
			right instanceof RegExp &&
			left.source === right.source &&
			left.flags === right.flags
		)
	}

	if (ArrayBuffer.isView(left) || ArrayBuffer.isView(right)) {
		if (!ArrayBuffer.isView(left) || !ArrayBuffer.isView(right)) return false

		const leftBytes = new Uint8Array(
			left.buffer,
			left.byteOffset,
			left.byteLength,
		)
		const rightBytes = new Uint8Array(
			right.buffer,
			right.byteOffset,
			right.byteLength,
		)

		return (
			leftBytes.length === rightBytes.length &&
			leftBytes.every((value, index) => value === rightBytes[index])
		)
	}

	if (Array.isArray(left) || Array.isArray(right)) {
		return (
			Array.isArray(left) &&
			Array.isArray(right) &&
			left.length === right.length &&
			left.every((value: unknown, index: number) =>
				areDeclarationValuesCompatible(value, right[index], seen),
			)
		)
	}

	if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false

	const leftKeys = Reflect.ownKeys(left)
	const rightKeys = Reflect.ownKeys(right)

	return (
		leftKeys.length === rightKeys.length &&
		leftKeys.every(
			(key) =>
				Object.hasOwn(right, key) &&
				areDeclarationValuesCompatible(
					Reflect.get(left, key),
					Reflect.get(right, key),
					seen,
				),
		)
	)
}

const assertCompatibleTargets = (
	className: string,
	canonical: readonly SchemaCompiledTargetIdentity[],
	candidate: readonly SchemaCompiledTargetIdentity[],
): void => {
	const compatible =
		canonical.length === candidate.length &&
		canonical.every((target, index) => {
			const candidateTarget = candidate[index]

			if (candidateTarget === undefined) {
				return false
			}

			return (
				target.target === candidateTarget.target &&
				areDeclarationValuesCompatible(
					target.fieldPath,
					candidateTarget.fieldPath,
				)
			)
		})

	if (!compatible) {
		throw new SchemaCompilationError(
			'incompatible-definition',
			className,
			`Schema ${className} compiled differently in another application`,
		)
	}
}

/** Resolves one application-local candidate without publishing partial metadata. */
export const prepareSchemaCompilation = (
	schema: SchemaDefinition,
	fieldMethods?: FieldBuilderMethodResolver,
): PreparedSchemaCompilation => {
	const declaration = schemaDeclarations.get(schema)

	if (declaration === undefined) {
		throw new TypeError('schema must be a class created by Schema.define')
	}

	const existingRecord = compiledSchemaRecords.get(schema)
	const candidate =
		!declaration.deferred && existingRecord !== undefined
			? existingRecord
			: compileSchemaRecord(
					declaration,
					executeSchemaFieldDeclaration(declaration, fieldMethods),
				)

	if (
		existingRecord !== undefined &&
		!areDeclarationValuesCompatible(
			existingRecord.definition,
			candidate.definition,
		)
	) {
		throw new SchemaCompilationError(
			'incompatible-definition',
			schema.className,
			`Schema ${schema.className} compiled differently in another application`,
		)
	}

	return immutableRecord({
		definition: candidate.definition,
		developerFields: candidate.developerFields,
		schema,
	})
}

/** Publishes one candidate only after the complete application graph validates. */
export const validateSchemaCompilation = (
	prepared: PreparedSchemaCompilation,
	targets: readonly SchemaCompiledTargetIdentity[],
): void => {
	const existingRecord = compiledSchemaRecords.get(prepared.schema)

	if (existingRecord?.targets !== undefined) {
		assertCompatibleTargets(
			prepared.schema.className,
			existingRecord.targets,
			targets,
		)
	}
}

/** Publishes one candidate only after the complete application graph validates. */
export const finalizeSchemaCompilation = (
	prepared: PreparedSchemaCompilation,
	targets: readonly SchemaCompiledTargetIdentity[],
): void => {
	validateSchemaCompilation(prepared, targets)
	const existingRecord = compiledSchemaRecords.get(prepared.schema)
	const immutableTargets = immutableArray(
		targets.map((target) =>
			immutableRecord({
				fieldPath: immutableArray(target.fieldPath),
				target: target.target,
			}),
		),
	)

	if (existingRecord === undefined) {
		compiledSchemaRecords.set(
			prepared.schema,
			immutableRecord({
				definition: prepared.definition,
				developerFields: prepared.developerFields,
				targets: immutableTargets,
			}),
		)
		return
	}

	if (existingRecord.targets === undefined) {
		compiledSchemaRecords.set(
			prepared.schema,
			immutableRecord({ ...existingRecord, targets: immutableTargets }),
		)
	}
}

const defineSchemaModel = <
	const TClassName extends string,
	const TFields extends SchemaFields,
	const TExtensions extends SchemaExtensions,
>(
	options: SchemaOptions<TClassName, TFields, TExtensions>,
): SchemaClass<TClassName, TFields, TExtensions> => {
	if (!isPlainRecord(options)) {
		throw new TypeError('schema options must be an object')
	}

	assertNonEmptyString(options.className, 'className')

	if (typeof options.fields !== 'function' && !isPlainRecord(options.fields)) {
		throw new TypeError('fields must be an object')
	}

	const extensions = normalizeSchemaExtensions(options)
	const declaration: NormalizedSchemaDeclaration = immutableRecord({
		className: options.className,
		deferred: typeof options.fields === 'function',
		extensions,
		fields: options.fields,
		indexes: snapshotSchemaIndexOptions(options.indexes),
	})
	// Readers close over the final class, which is assigned only after construction.
	// eslint-disable-next-line prefer-const
	let schemaIdentity: SchemaClass<TClassName, TFields, TExtensions> | undefined
	const schema = createSchemaModelClass({
		className: options.className,
		readDefinition: () => {
			if (schemaIdentity === undefined) {
				throw new TypeError('Schema identity is not available')
			}

			return readCompiledSchemaRecord(schemaIdentity)
				.definition as SchemaMetadata<TClassName, TFields, TExtensions>
		},
		readDeveloperFields: () => {
			if (schemaIdentity === undefined) {
				throw new TypeError('Schema identity is not available')
			}

			return readCompiledSchemaRecord(schemaIdentity).developerFields as TFields
		},
	})
	schemaIdentity = schema
	schemaDeclarations.set(schema, declaration)

	// Keep provenance out of public enumeration while sharing it across package copies.
	Object.defineProperty(schema, schemaDefinitionMarker, {
		configurable: false,
		enumerable: false,
		value: true,
		writable: false,
	})
	// Behavioral capabilities follow Schema identity without entering metadata.
	declareSchemaAccess(schema, options.access)
	declareSchemaHooks(schema, options.hooks)

	if (!declaration.deferred) {
		const record = compileSchemaRecord(declaration, declaration.fields)
		compiledSchemaRecords.set(schema, record)
	}

	return schema
}

/** Validates extension-owned fields at the same trusted boundary as developer fields. */
const collectSchemaExtensionFields = (
	developerFields: SchemaFields,
	extensions: SchemaExtensions,
): SchemaFields => {
	const entries: [string, GenericField][] = []
	const names = new Set(Object.keys(developerFields))

	for (const extension of extensions) {
		for (const [name, field] of Object.entries(extension.fields)) {
			assertNonEmptyString(name, `extension ${extension.name} field name`)
			assertFieldDefinition(field, `extension ${extension.name} fields.${name}`)

			if (names.has(name)) {
				throw new TypeError(`Reserved schema extension field: ${name}`)
			}

			if (
				reservedSystemFieldNames.some(
					(reservedName) => reservedName === name,
				) ||
				reservedWhereLogicalFieldNames.has(name) ||
				reservedModelFieldNames.has(name)
			) {
				throw new TypeError(`Reserved schema extension field: ${name}`)
			}

			names.add(name)
			entries.push([name, field])
		}
	}

	return immutableRecord(Object.fromEntries(entries))
}

const assertNoReservedFieldCollision = (
	fields: Readonly<Record<string, unknown>>,
): void => {
	for (const name of reservedSystemFieldNames) {
		if (Object.hasOwn(fields, name)) {
			throw new TypeError(`Reserved schema field: ${name}`)
		}
	}

	for (const name of Object.keys(fields)) {
		if (reservedWhereLogicalFieldNames.has(name)) {
			throw new TypeError(`Reserved schema field: ${name}`)
		}

		if (reservedModelFieldNames.has(name)) {
			throw new TypeError(`Reserved schema model field: ${name}`)
		}
	}
}

/**
 * Declares immutable schema model classes that become UltimaBase's source of truth.
 *
 * The exact class name, field map, indexes, and extensions remain available to
 * query and input inference. The returned class constructs immutable drafts,
 * while Runtime uses the same class for persisted results.
 *
 * @example
 * ```ts
 * const Post = Schema.define({
 *   className: "Post",
 *   fields: {
 *     title: stringField({ validation: { required: true } }),
 *     published: booleanField({ default: false }),
 *   },
 * })
 *
 * const draft = new Post({ title: "Hello" })
 * const posts = await Post.findMany({ select: { id: true, title: true } })
 * ```
 */
// A static class deliberately provides the class-first `Schema.define()` namespace.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Schema {
	private constructor() {
		throw new TypeError('Use Schema.define() to declare a schema model class')
	}

	/**
	 * Checks whether an untrusted value was created through `Schema.define()`.
	 *
	 * @example `if (Schema.is(value)) console.log(value.className)`
	 */
	static is(value: unknown): value is SchemaClass {
		return (
			typeof value === 'function' &&
			Object.hasOwn(value, schemaDefinitionMarker) &&
			Reflect.get(value, schemaDefinitionMarker) === true
		)
	}

	/**
	 * Defines one final schema-specific class with typed drafts and QueryBuilder access.
	 *
	 * @example
	 * ```ts
	 * const Post = Schema.define({
	 *   className: "Post",
	 *   fields(field) { field.string("title") },
	 * })
	 * ```
	 */
	static define<
		const TClassName extends string,
		const TSource extends SchemaFieldSource,
		const TExtensions extends SchemaExtensions = readonly [],
	>(
		options: SchemaDeclarationOptions<TClassName, TSource, TExtensions> &
			ReservedFieldCollision<NoInfer<SchemaFieldsFromSource<TSource>>>,
	): SchemaClass<TClassName, SchemaFieldsFromSource<TSource>, TExtensions>

	static define<
		const TClassName extends string,
		const TFields extends SchemaFields,
		const TExtensions extends SchemaExtensions = readonly [],
	>(
		options: SchemaOptions<TClassName, TFields, TExtensions> &
			ReservedFieldCollision<NoInfer<TFields>>,
	): SchemaClass<TClassName, TFields, TExtensions> {
		const schema = defineSchemaModel(options)
		finalizeSchemaModelClass(schema)
		Object.freeze(schema)

		return schema
	}

	/**
	 * Defines a final schema class with package-owned static capabilities.
	 *
	 * This low-level composition point lets optional packages add concise static
	 * helpers without wrapping, subclassing, or weakening schema identity.
	 * Ordinary application schemas should use `Schema.define()`.
	 *
	 * @example `Schema.defineWithStatics(options, (schema) => ({ byId: (id) => schema.pointer(id) }))`
	 */
	static defineWithStatics<
		const TClassName extends string,
		const TFields extends SchemaFields,
		const TExtensions extends SchemaExtensions = readonly [],
		const TCapabilities extends SchemaStaticCapabilities =
			SchemaStaticCapabilities,
	>(
		options: ImmediateSchemaOptions<TClassName, TFields, TExtensions>,
		createCapabilities: SchemaStaticCapabilityFactory<
			SchemaClass<TClassName, TFields, TExtensions>,
			TCapabilities
		>,
	): SchemaClass<TClassName, TFields, TExtensions> & TCapabilities

	static defineWithStatics<
		const TClassName extends string,
		const TExtensions extends SchemaExtensions = readonly [],
		const TCapabilities extends SchemaStaticCapabilities =
			SchemaStaticCapabilities,
	>(
		options: BuilderSchemaOptions<TClassName, TExtensions>,
		createCapabilities: SchemaStaticCapabilityFactory<
			SchemaClass<TClassName, SchemaFields, TExtensions>,
			TCapabilities
		>,
	): SchemaClass<TClassName, SchemaFields, TExtensions> & TCapabilities

	// Separate overloads preserve exact generic field maps for package-owned schemas.
	static defineWithStatics<
		const TClassName extends string,
		const TFields extends SchemaFields,
		const TExtensions extends SchemaExtensions = readonly [],
		const TCapabilities extends SchemaStaticCapabilities =
			SchemaStaticCapabilities,
	>(
		// eslint-disable-next-line @typescript-eslint/unified-signatures
		options: DeferredSchemaOptions<TClassName, TFields, TExtensions>,
		createCapabilities: SchemaStaticCapabilityFactory<
			SchemaClass<TClassName, TFields, TExtensions>,
			TCapabilities
		>,
	): SchemaClass<TClassName, TFields, TExtensions> & TCapabilities

	static defineWithStatics<
		const TClassName extends string,
		const TFields extends SchemaFields,
		const TExtensions extends SchemaExtensions = readonly [],
		const TCapabilities extends SchemaStaticCapabilities =
			SchemaStaticCapabilities,
	>(
		options: SchemaOptions<TClassName, TFields, TExtensions>,
		createCapabilities: SchemaStaticCapabilityFactory<
			SchemaClass<TClassName, TFields, TExtensions>,
			TCapabilities
		>,
	): SchemaClass<TClassName, TFields, TExtensions> & TCapabilities {
		const schema = defineSchemaModel(options)
		const specializedSchema = defineSchemaStaticCapabilities(
			schema,
			createCapabilities,
		)
		finalizeSchemaModelClass(specializedSchema)
		Object.freeze(specializedSchema)

		return specializedSchema
	}

	/**
	 * Defines one package-specialized schema with static helpers and persisted commands.
	 *
	 * Result commands are absent from drafts at the type level and validate trusted
	 * persisted identity at runtime. Packages retain ordinary QueryBuilder and relation
	 * execution rather than receiving an adapter or application escape hatch.
	 */
	static defineWithCapabilities<
		const TClassName extends string,
		const TFields extends SchemaFields,
		const TExtensions extends SchemaExtensions = readonly [],
		const TStatics extends SchemaStaticCapabilities = SchemaStaticCapabilities,
		const TResults extends object = object,
	>(
		options: ImmediateSchemaOptions<TClassName, TFields, TExtensions>,
		createCapabilities: SchemaClassCapabilityFactory<
			SchemaClass<TClassName, TFields, TExtensions>,
			TStatics,
			TResults
		>,
	): SchemaClass<TClassName, TFields, TExtensions> &
		TStatics &
		SchemaResultCapabilityCarrier<TResults>

	static defineWithCapabilities<
		const TClassName extends string,
		const TExtensions extends SchemaExtensions = readonly [],
		const TStatics extends SchemaStaticCapabilities = SchemaStaticCapabilities,
		const TResults extends object = object,
	>(
		options: BuilderSchemaOptions<TClassName, TExtensions>,
		createCapabilities: SchemaClassCapabilityFactory<
			SchemaClass<TClassName, SchemaFields, TExtensions>,
			TStatics,
			TResults
		>,
	): SchemaClass<TClassName, SchemaFields, TExtensions> &
		TStatics &
		SchemaResultCapabilityCarrier<TResults>

	// Separate overloads preserve exact generic field maps for package-owned schemas.
	static defineWithCapabilities<
		const TClassName extends string,
		const TFields extends SchemaFields,
		const TExtensions extends SchemaExtensions = readonly [],
		const TStatics extends SchemaStaticCapabilities = SchemaStaticCapabilities,
		const TResults extends object = object,
	>(
		// eslint-disable-next-line @typescript-eslint/unified-signatures
		options: DeferredSchemaOptions<TClassName, TFields, TExtensions>,
		createCapabilities: SchemaClassCapabilityFactory<
			SchemaClass<TClassName, TFields, TExtensions>,
			TStatics,
			TResults
		>,
	): SchemaClass<TClassName, TFields, TExtensions> &
		TStatics &
		SchemaResultCapabilityCarrier<TResults>

	static defineWithCapabilities<
		const TClassName extends string,
		const TFields extends SchemaFields,
		const TExtensions extends SchemaExtensions = readonly [],
		const TStatics extends SchemaStaticCapabilities = SchemaStaticCapabilities,
		const TResults extends object = object,
	>(
		options: SchemaOptions<TClassName, TFields, TExtensions>,
		createCapabilities: SchemaClassCapabilityFactory<
			SchemaClass<TClassName, TFields, TExtensions>,
			TStatics,
			TResults
		>,
	): SchemaClass<TClassName, TFields, TExtensions> &
		TStatics &
		SchemaResultCapabilityCarrier<TResults> {
		if (typeof createCapabilities !== 'function') {
			throw new TypeError('createCapabilities must be a function')
		}

		const schema = defineSchemaModel(options)
		const capabilities: unknown = createCapabilities(
			createSchemaModelCapabilityContext(schema),
		)

		if (!isPlainRecord(capabilities)) {
			throw new TypeError('schema class capabilities must be a plain object')
		}
		const staticCapabilities = capabilities.statics
		const resultCapabilities = capabilities.results

		if (!isPlainRecord(staticCapabilities)) {
			throw new TypeError('schema static capabilities must be a plain object')
		}
		if (!isPlainRecord(resultCapabilities)) {
			throw new TypeError('schema result capabilities must be a plain object')
		}

		const specializedSchema = defineSchemaStaticCapabilities(
			schema,
			() => staticCapabilities as TStatics,
		)
		defineSchemaModelResultCapabilities(schema, resultCapabilities)
		finalizeSchemaModelClass(specializedSchema)
		Object.freeze(specializedSchema)

		// The required marker is type-only; attached methods back it at runtime.
		return specializedSchema as typeof specializedSchema &
			SchemaResultCapabilityCarrier<TResults>
	}
}
