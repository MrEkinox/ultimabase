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
	captureFieldBuilderCallback,
	FieldBuilderDeclarationExecutionError,
	FieldBuilderMethodUnavailableError,
	FieldBuilderTargetUnavailableError,
	resolveCapturedFieldMap,
	type FieldBuilderTargetResolver,
	type SchemaFieldBuilderDeclaration,
} from './field-builder.js'
import type { FieldBuilderMethodResolver } from './field-builder-methods.js'
import type {
	BaseSchemaTypeInfo,
	SchemaTypeInfo,
	SchemaTypeInfoByNameOrBase,
	RequireGeneratedSchemaEntry,
} from '../type-info.js'
import type { SchemaAPI } from './schema-api.js'
import type { SchemaItem } from './values.js'
import {
	isReservedQueryLogicalFieldName,
	isReservedSchemaModelFieldName,
	type ReservedSchemaFieldCollision,
} from './reserved-field-names.js'

export type { BaseItem } from '../type-info.js'
export type { SchemaAPI } from './schema-api.js'

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

/** Reads developer-owned persisted values supplied to contextual extensions. */
export type SchemaExtensionData<TClassName extends string> = Omit<
	SchemaItem<SchemaReference<TClassName>>,
	ReservedSystemFieldName
>

/** Supports ordinary extension tuples and sibling-field-aware declarations. */
export type SchemaExtensionDeclaration<
	TExtensions extends SchemaExtensions,
	TData extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, unknown>
	>,
> =
	TExtensions | ((context: SchemaExtensionBindingContext<TData>) => TExtensions)

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
	 * Declares fields by returning one exact map from the canonical factory builder.
	 * Framework-owned `id`, `createdAt`, and `updatedAt` fields are added automatically.
	 *
	 * @example `fields: (field) => ({ title: field.string(), published: field.boolean() })`
	 */
	readonly fields: SchemaFieldBuilderDeclaration<TFields>
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
		TExtensions,
		SchemaExtensionData<NoInfer<TClassName>>
	>
	/**
	 * Groups native allow, row, and prepared-item policies by operation.
	 * Rules stay private to Runtime and never alter physical schema metadata.
	 *
	 * @example `access: { delete: ({ context }) => context.access.mode === "master" }`
	 */
	readonly access?: SchemaAccess<SchemaReference<NoInfer<TClassName>>>
	/**
	 * Declares immutable schema lifecycle behavior without requiring a plugin.
	 * Hook functions stay outside physical schema metadata and migration plans.
	 *
	 * @example `hooks: { beforeOperation: { update: ({ item }) => audit(item) } }`
	 */
	readonly hooks?: SchemaHooks<SchemaReference<NoInfer<TClassName>>>
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

/** Represents one public schema class driven by its complete generated contract. */
export interface SchemaClass<
	TContract extends SchemaTypeInfo = BaseSchemaTypeInfo<string>,
> extends SchemaAPI<TContract> {
	/** Creates one immutable draft from the generated create input. */
	new (input: TContract['inputs']['create']): SchemaDraft<this>
	/** Creates one immutable pointer to this schema. */
	pointer(id: string): Pointer<this>
}

/** Resolves one public schema class by its generated logical contract. */
export type SchemaReference<TClassName extends string> = SchemaClass<
	SchemaTypeInfoByNameOrBase<TClassName>
>

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

// A versioned global symbol preserves constructor provenance across package copies.
const schemaDefinitionMarker = Symbol.for(
	'@ultimabase/core/schema-definition/v1',
)
const emptySchemaExtensions: readonly [] = immutableArray([])

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
	readonly fields: Readonly<Record<string, unknown>>
	readonly indexes: readonly SchemaIndexOptions[] | undefined
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
	options: Pick<SchemaOptions<TClassName, TFields, TExtensions>, 'extensions'>,
): readonly [...TExtensions] => {
	const declaredExtensions =
		typeof options.extensions === 'function'
			? options.extensions(
					createSchemaExtensionBindingContext<
						SchemaExtensionData<TClassName>
					>(),
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
) => asserts fields is SchemaFields = (fields, className) => {
	if (!isPlainRecord(fields)) {
		throw new SchemaCompilationError(
			'invalid-result',
			className,
			`Schema ${className} fields declaration must return a plain object`,
		)
	}

	assertNoReservedFieldCollision(fields)

	for (const [name, field] of Object.entries(fields)) {
		assertNonEmptyString(name, `${className} schema field name`)
		assertFieldDefinition(field, `${className}.fields.${name}`)
	}
}

const compileSchemaRecord = (
	declaration: NormalizedSchemaDeclaration,
	developerFieldsInput: unknown,
): CompiledSchemaRecord => {
	assertSchemaFields(developerFieldsInput, declaration.className)
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
	resolveTarget?: FieldBuilderTargetResolver,
): unknown => {
	try {
		return resolveCapturedFieldMap(
			declaration.fields,
			`${declaration.className}.fields`,
			false,
			fieldMethods,
			resolveTarget,
		)
	} catch (cause: unknown) {
		throw new SchemaCompilationError(
			'callback-threw',
			declaration.className,
			`Schema ${declaration.className} fields declaration could not be resolved`,
			{
				cause:
					cause instanceof FieldBuilderDeclarationExecutionError
						? cause.cause
						: cause,
			},
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
	resolveTarget?: FieldBuilderTargetResolver,
): PreparedSchemaCompilation => {
	const declaration = schemaDeclarations.get(schema)

	if (declaration === undefined) {
		throw new TypeError('schema must be a class created by Schema.define')
	}

	const existingRecord = compiledSchemaRecords.get(schema)
	const candidate = compileSchemaRecord(
		declaration,
		executeSchemaFieldDeclaration(declaration, fieldMethods, resolveTarget),
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
): SchemaReference<TClassName> => {
	if (!isPlainRecord(options)) {
		throw new TypeError('schema options must be an object')
	}

	assertNonEmptyString(options.className, 'className')

	if (typeof options.fields !== 'function') {
		throw new TypeError('fields must be a function')
	}

	const extensions = normalizeSchemaExtensions(options)
	let fields: Readonly<Record<string, unknown>>

	try {
		fields = captureFieldBuilderCallback(
			options.fields,
			`${options.className}.fields`,
		)
	} catch (cause: unknown) {
		if (!(cause instanceof FieldBuilderDeclarationExecutionError)) {
			throw cause
		}

		throw new SchemaCompilationError(
			'callback-threw',
			options.className,
			`Schema ${options.className} fields declaration threw`,
			{ cause: cause.cause },
		)
	}

	const declaration: NormalizedSchemaDeclaration = immutableRecord({
		className: options.className,
		extensions,
		fields,
		indexes: snapshotSchemaIndexOptions(options.indexes),
	})
	// Readers close over the final class, which is assigned only after construction.
	// eslint-disable-next-line prefer-const
	let schemaIdentity: SchemaReference<TClassName> | undefined
	const schema: SchemaReference<TClassName> = createSchemaModelClass<
		TClassName,
		TFields,
		TExtensions
	>({
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

	try {
		const prepared = prepareSchemaCompilation(schema)

		compiledSchemaRecords.set(
			schema,
			immutableRecord({
				definition: prepared.definition,
				developerFields: prepared.developerFields,
				targets: undefined,
			}),
		)
	} catch (error: unknown) {
		if (!(
			error instanceof SchemaCompilationError &&
			(error.cause instanceof FieldBuilderMethodUnavailableError ||
				error.cause instanceof FieldBuilderTargetUnavailableError)
		)) {
			throw error
		}
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
				isReservedQueryLogicalFieldName(name) ||
				isReservedSchemaModelFieldName(name)
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
		if (isReservedQueryLogicalFieldName(name)) {
			throw new TypeError(`Reserved schema field: ${name}`)
		}

		if (isReservedSchemaModelFieldName(name)) {
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
 *   fields: (field) => ({
 *     title: field.string({ validation: { required: true } }),
 *     published: field.boolean({ default: false }),
 *   }),
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
	 *   fields: (field) => ({ title: field.string() }),
	 * })
	 * ```
	 */
	static define<
		const TClassName extends string,
		const TFields extends SchemaFields,
		const TExtensions extends SchemaExtensions = readonly [],
	>(
		options: SchemaOptions<TClassName, TFields, TExtensions> &
			RequireGeneratedSchemaEntry<TClassName> &
			ReservedSchemaFieldCollision<NoInfer<TFields>>,
	): SchemaReference<NoInfer<TClassName>> {
		const schema = defineSchemaModel<TClassName, TFields, TExtensions>(options)
		finalizeSchemaModelClass(schema)
		Object.freeze(schema)

		// Field literals compile the runtime graph but generated contracts own the
		// application-facing class type after this declaration boundary.
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
			SchemaReference<TClassName>,
			TCapabilities
		>,
	): SchemaReference<TClassName> & TCapabilities {
		const schema = defineSchemaModel<TClassName, TFields, TExtensions>(options)
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
		options: SchemaOptions<TClassName, TFields, TExtensions>,
		createCapabilities: SchemaClassCapabilityFactory<
			SchemaReference<TClassName>,
			TStatics,
			TResults
		>,
	): SchemaReference<TClassName> &
		TStatics &
		SchemaResultCapabilityCarrier<TResults> {
		if (typeof createCapabilities !== 'function') {
			throw new TypeError('createCapabilities must be a function')
		}

		const schema = defineSchemaModel<TClassName, TFields, TExtensions>(options)
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
