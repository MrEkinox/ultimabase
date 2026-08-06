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
import type {
	QueryBulkTerminalOptions,
	QueryBulkTerminalResult,
	QueryTerminalOptions,
} from '../../query/operations/execution.js'
import type {
	SchemaCreateOneInput,
	SchemaDeleteManyInput,
	SchemaDeleteOneInput,
	SchemaUpdateManyInput,
	SchemaUpdateOneInput,
	SchemaUpsertInput,
	SchemaUpsertManyItemInput,
} from '../../query/operations/schema-commands.js'
import type { Query } from '../../query/query/query.js'
import type { InferQueryResult } from '../../query/query/result.js'
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

/**
 * Collects named field definitions without erasing their concrete literals.
 */
export type SchemaFields = Readonly<Record<string, GenericField>>

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
	 * Maps developer field names to reusable UltimaBase field definitions.
	 * Framework-owned `id`, `createdAt`, and `updatedAt` fields are added automatically.
	 *
	 * @example `fields: { title: stringField(), published: booleanField() }`
	 */
	readonly fields: TFields
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
	 * Declares native operation, row-filter, and prepared-item access policies.
	 * Rules stay private to Runtime and never alter physical schema metadata.
	 *
	 * @example `access: { operation: { delete: ({ context }) => context.access.mode === "master" } }`
	 */
	readonly access?: SchemaAccess<
		SchemaClass<NoInfer<TClassName>, NoInfer<TFields>, NoInfer<TExtensions>>
	>
	/**
	 * Declares immutable schema lifecycle behavior without requiring a plugin.
	 * Hook functions stay outside physical schema metadata and migration plans.
	 *
	 * @example `hooks: { beforeRead: ({ query }) => query.limit(100) }`
	 */
	readonly hooks?: SchemaHooks<
		SchemaClass<NoInfer<TClassName>, NoInfer<TFields>, NoInfer<TExtensions>>
	>
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
	/** Starts one fresh immutable Query without retaining execution state. */
	query(): Query<this>
	/**
	 * Creates one row and returns its selected model fields.
	 *
	 * @example `await Post.create({ data: { title: 'Hello' }, select: { id: true, title: true } })`
	 */
	create<const TSelection extends QuerySelection<this>>(
		input: SchemaCreateOneInput<this, TSelection>,
		options?: QueryTerminalOptions,
	): Promise<InferQueryResult<this, QuerySelectedField<this, TSelection>>>
	/**
	 * Creates one row and returns its complete persisted model.
	 *
	 * @example `await Post.create({ data: { title: 'Hello' } })`
	 */
	create(
		input: SchemaCreateOneInput<this>,
		options?: QueryTerminalOptions,
	): Promise<InferQueryResult<this>>
	/**
	 * Creates input rows in order and keeps them atomic by default.
	 * Passing `{ atomic: false }` returns a discriminated result with either every
	 * model or the successful prefix and first failed input index.
	 *
	 * @example `await Post.createMany(inputs, { atomic: false })`
	 */
	createMany<
		const TOptions extends QueryBulkTerminalOptions | undefined = undefined,
	>(
		inputs: readonly InferCreateInput<this>[],
		options?: TOptions & QueryBulkTerminalOptions,
	): Promise<QueryBulkTerminalResult<InferQueryResult<this>, TOptions>>
	/**
	 * Updates one unique target and returns its selected model fields.
	 *
	 * @example `await Post.updateOne({ where: { id: { eq: id } }, data, select: { id: true, title: true } })`
	 */
	updateOne<const TSelection extends QuerySelection<this>>(
		input: SchemaUpdateOneInput<this, TSelection>,
		options?: QueryTerminalOptions,
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
		options?: QueryTerminalOptions,
	): Promise<InferQueryResult<this> | null>
	/**
	 * Updates every selected row and returns its requested post-update fields.
	 *
	 * @example `await Post.updateMany({ where: { draft: { eq: true } }, data, select: { id: true, title: true } })`
	 */
	updateMany<const TSelection extends QuerySelection<this>>(
		input: SchemaUpdateManyInput<this, TSelection>,
		options?: QueryTerminalOptions,
	): Promise<
		readonly InferQueryResult<this, QuerySelectedField<this, TSelection>>[]
	>
	/**
	 * Updates every selected row and returns only its identifier by default.
	 *
	 * @example `await Post.updateMany({ where: { draft: { eq: true } }, data })`
	 */
	updateMany(
		input: SchemaUpdateManyInput<this>,
		options?: QueryTerminalOptions,
	): Promise<
		readonly InferQueryResult<
			this,
			Extract<'id', QuerySelectedField<this, { readonly id: true }>>
		>[]
	>
	/**
	 * Creates or updates one row selected by an exact unique target.
	 *
	 * @example `await Post.upsert({ where: { id: { eq: id } }, create, update })`
	 */
	upsert(
		input: SchemaUpsertInput<this>,
		options?: QueryTerminalOptions,
	): Promise<InferQueryResult<this>>
	/**
	 * Upserts independently targeted inputs in declaration order.
	 *
	 * @example `await Post.upsertMany(items)`
	 */
	upsertMany<
		const TOptions extends QueryBulkTerminalOptions | undefined = undefined,
	>(
		inputs: readonly SchemaUpsertManyItemInput<this>[],
		options?: TOptions & QueryBulkTerminalOptions,
	): Promise<QueryBulkTerminalResult<InferQueryResult<this>, TOptions>>
	/**
	 * Deletes one unique target and returns its selected removed model fields.
	 *
	 * @example `await Post.deleteOne({ where: { id: { eq: id } }, select: { id: true, title: true } })`
	 */
	deleteOne<const TSelection extends QuerySelection<this>>(
		input: SchemaDeleteOneInput<this, TSelection>,
		options?: QueryTerminalOptions,
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
		options?: QueryTerminalOptions,
	): Promise<InferQueryResult<this> | null>
	/**
	 * Deletes every selected row and returns its requested pre-delete fields.
	 *
	 * @example `await Post.deleteMany({ where: { archived: { eq: true } }, select: { id: true, title: true } })`
	 */
	deleteMany<const TSelection extends QuerySelection<this>>(
		input: SchemaDeleteManyInput<this, TSelection>,
		options?: QueryTerminalOptions,
	): Promise<
		readonly InferQueryResult<this, QuerySelectedField<this, TSelection>>[]
	>
	/**
	 * Deletes every selected row and returns only its identifier by default.
	 *
	 * @example `await Post.deleteMany({ where: 'all' })`
	 */
	deleteMany(
		input: SchemaDeleteManyInput<this>,
		options?: QueryTerminalOptions,
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

	if (!isPlainRecord(options.fields)) {
		throw new TypeError('fields must be an object')
	}

	assertNoReservedFieldCollision(options.fields)

	for (const [name, field] of Object.entries(options.fields)) {
		assertNonEmptyString(name, 'schema field name')
		assertFieldDefinition(field, `fields.${name}`)
	}

	const declaredExtensions =
		typeof options.extensions === 'function'
			? options.extensions(
					createSchemaExtensionBindingContext<SchemaExtensionData<TFields>>(),
				)
			: options.extensions
	const extensions = (
		declaredExtensions === undefined
			? emptySchemaExtensions
			: defineExtensions(declaredExtensions)
	) as readonly [...TExtensions]
	const extensionFields = collectSchemaExtensionFields(
		options.fields,
		extensions,
	)
	const declaredFields = immutableRecord({
		...options.fields,
		...extensionFields,
	}) as ResolvedSchemaFields<TFields, TExtensions>
	const fields = immutableRecord({
		...declaredFields,
		...systemFields,
	}) as ResolvedSchemaFields<TFields, TExtensions> & Readonly<SystemFields>
	const indexes = normalizeSchemaIndexes(
		declaredFields,
		options.indexes,
	) as readonly SchemaIndexDefinition<
		SchemaFieldName<ResolvedSchemaFields<TFields, TExtensions>>
	>[]
	const definition: SchemaMetadata<TClassName, TFields, TExtensions> =
		immutableRecord({
			className: options.className,
			fields,
			indexes,
			extensions,
		})
	const schema = createSchemaModelClass(definition, options.fields)

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

const assertNoReservedFieldCollision = (fields: SchemaFields): void => {
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
 * const query = Post.query().select({ id: true, title: true })
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
	 * Defines one final schema-specific class with typed drafts and Query access.
	 *
	 * @example
	 * ```ts
	 * const Post = Schema.define({
	 *   className: "Post",
	 *   fields: { title: stringField() },
	 * })
	 * ```
	 */
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
	 * persisted identity at runtime. Packages retain ordinary Query and relation
	 * execution rather than receiving an adapter or application escape hatch.
	 */
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
