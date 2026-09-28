import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { GenericField } from '../fields/base/contract.js'
import type { GenericVirtualField } from './virtual-field.js'
import { OutputBuilderMethodUnavailableError } from '../output/builder.js'
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
	snapshotSchemaIndexOptions,
	type SchemaFieldName,
	type SchemaIndexDefinition,
	type SchemaIndexOptions,
} from './indexes.js'
import type { SystemFields } from './system-fields.js'
import {
	captureFieldBuilderCallback,
	FieldBuilderDeclarationExecutionError,
	FieldBuilderMethodUnavailableError,
	FieldBuilderTargetUnavailableError,
	type SchemaFieldBuilderDeclaration,
} from './field-builder.js'
import type {
	BaseSchemaTypeInfo,
	SchemaTypeInfo,
	SchemaTypeInfoByNameOrBase,
	UltimaBaseGeneratedSchemaClassSurface,
	UltimaBaseGeneratedSchemaOptions,
} from '../type-info.js'
import type { SchemaAPI } from './schema-api.js'
import type { ReservedSchemaFieldCollision } from './reserved-field-names.js'
import type { SchemaCompilationProvenance } from './provenance.js'
import type { SchemaConstraintDefinition } from './constraints.js'

import {
	prepareSchemaCompilation,
	snapshotUnresolvedSchemaOptions,
} from './definition-compilation.js'
import { SchemaCompilationError } from './definition-error.js'
import {
	storeCompiledSchemaRecord,
	readCompiledSchemaRecord,
	storeSchemaDeclaration,
	schemaDefinitionMarker,
	type NormalizedSchemaDeclaration,
} from './definition-state.js'

export {
	finalizeSchemaCompilation,
	prepareSchemaCompilation,
	validateSchemaCompilation,
} from './definition-compilation.js'
export { SchemaCompilationError } from './definition-error.js'
export type { SchemaCompilationFailureReason } from './definition-error.js'

export type { BaseItem } from '../type-info.js'
export type { SchemaAPI } from './schema-api.js'
export { areSchemaDeclarationValuesCompatible } from './declaration-compatibility.js'
/**
 * Collects named field definitions without erasing their concrete literals.
 */
export type SchemaFields = Readonly<Record<string, GenericField>>

/** Collects stored and output-only declarations in the canonical schema map. */
export type SchemaDeclaredFields = Readonly<
	Record<string, GenericField | GenericVirtualField>
>

/** Collects the output-only declarations compiled for one schema. */
export type SchemaVirtualFields = Readonly<Record<string, GenericVirtualField>>

/**
 * Collects schema-scoped plugin metadata in deterministic declaration order.
 */
/**
 * Describes the developer input accepted by `Schema.define()`.
 */
export interface SchemaOptions<
	TClassName extends string = string,
	TFields extends SchemaDeclaredFields = SchemaDeclaredFields,
> extends UltimaBaseGeneratedSchemaOptions {
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
	readonly fields: SchemaFieldBuilderDeclaration<TFields, TClassName>
	/**
	 * Declares adapter-neutral composite indexes containing at least two fields.
	 * Single-field indexes belong on the corresponding field through `indexed`.
	 *
	 * @example `indexes: [{ fields: ["authorId", "createdAt"] }]`
	 */
	readonly indexes?: readonly SchemaIndexOptions<
		SchemaFieldName<NoInfer<TFields>>
	>[]
}

/**
 * Carries immutable schema metadata while retaining every declaration literal.
 */
export interface SchemaMetadata<
	TClassName extends string = string,
	TFields extends SchemaDeclaredFields = SchemaDeclaredFields,
> {
	/** The exact logical class name supplied to `Schema.define()`. */
	readonly className: TClassName
	/** The ordered adapter-neutral constraints contributed during compilation. */
	readonly constraints: readonly SchemaConstraintDefinition[]
	/** The immutable developer and framework-owned field map. */
	readonly fields: Readonly<TFields> & Readonly<SystemFields>
	/** The immutable normalized field-level and composite index declarations. */
	readonly indexes: readonly SchemaIndexDefinition<SchemaFieldName<TFields>>[]
	/** Explains the exact owner of every logical compiled contribution. */
	readonly provenance: SchemaCompilationProvenance
	/** The immutable field map visible to persistence and mutation behavior. */
	readonly persistedFields: SchemaFields & Readonly<SystemFields>
	/** The immutable output-only field map hidden from persistence. */
	readonly virtualFields: SchemaVirtualFields
}
/** Carries trusted schema identity plus the neutral metadata used by Core. */
export interface SchemaDefinition<
	TClassName extends string = string,
	TFields extends SchemaDeclaredFields = SchemaDeclaredFields,
> extends SchemaMetadata<TClassName, TFields> {
	/** The immutable transport-neutral metadata consumed by infrastructure. */
	readonly definition: SchemaMetadata<TClassName, TFields>
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
> &
	UltimaBaseGeneratedSchemaClassSurface<TClassName>

/** Collects additional static capabilities owned by a schema specialization. */
export type SchemaStaticCapabilities = object

/** Creates static capabilities after the exact schema class exists. */
type SchemaStaticCapabilityFactory<
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

/** Describes the Core-owned portion of a package-composed schema declaration. */
interface SpecializedSchemaOptions {
	readonly className: string
	readonly fields: SchemaFieldBuilderDeclaration
	readonly indexes?: readonly SchemaIndexOptions[]
}

/** Creates specialized class capabilities after exact schema identity exists. */
export type SchemaClassCapabilityFactory<
	TSchema extends SchemaDefinition,
	TStatics extends SchemaStaticCapabilities,
	TResults extends object,
> = (
	context: SchemaModelCapabilityContext<TSchema>,
) => SchemaClassCapabilities<TStatics, TResults>

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

	for (const name of Reflect.ownKeys(capabilities)) {
		if (typeof name === 'string') {
			assertNonEmptyString(name, 'schema static capability name')
		}

		if (name in schema) {
			throw new TypeError(`Reserved schema static capability: ${String(name)}`)
		}

		// Static specialization methods follow native class-method visibility.
		Object.defineProperty(schema, name, {
			configurable: false,
			enumerable: false,
			value: Reflect.get(capabilities, name),
			writable: false,
		})
	}

	return schema as TSchema & TCapabilities
}

const defineSchemaModel = <
	const TClassName extends string,
	const TFields extends SchemaDeclaredFields,
>(
	options: SchemaOptions<TClassName, TFields>,
): SchemaReference<TClassName> => {
	if (!isPlainRecord(options)) {
		throw new TypeError('schema options must be an object')
	}

	assertNonEmptyString(options.className, 'className')

	if (typeof options.fields !== 'function') {
		throw new TypeError('fields must be a function')
	}

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
		fields,
		indexes: snapshotSchemaIndexOptions(options.indexes),
		options: snapshotUnresolvedSchemaOptions(options),
	})
	// Readers close over the final class, which is assigned only after construction.
	// eslint-disable-next-line prefer-const
	let schemaIdentity: SchemaReference<TClassName> | undefined
	const schema: SchemaReference<TClassName> = createSchemaModelClass<
		TClassName,
		SchemaFields
	>({
		className: options.className,
		readDefinition: () => {
			if (schemaIdentity === undefined) {
				throw new TypeError('Schema identity is not available')
			}

			return readCompiledSchemaRecord(schemaIdentity)
				.definition as SchemaMetadata<TClassName, SchemaFields>
		},
		readDeveloperFields: () => {
			if (schemaIdentity === undefined) {
				throw new TypeError('Schema identity is not available')
			}

			return readCompiledSchemaRecord(schemaIdentity).developerFields
		},
	})
	schemaIdentity = schema
	storeSchemaDeclaration(schema, declaration)

	// Keep provenance out of public enumeration while sharing it across package copies.
	Object.defineProperty(schema, schemaDefinitionMarker, {
		configurable: false,
		enumerable: false,
		value: true,
		writable: false,
	})
	try {
		const prepared = prepareSchemaCompilation(schema)

		storeCompiledSchemaRecord(
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
				error.cause instanceof FieldBuilderTargetUnavailableError ||
				error.cause instanceof OutputBuilderMethodUnavailableError)
		)) {
			throw error
		}
	}

	return schema
}

/**
 * Declares immutable schema model classes that become UltimaBase's source of truth.
 *
 * The exact class name, field map, and indexes remain available to
 * query and input inference. The returned class constructs immutable drafts,
 * while Runtime uses the same class for persisted results.
 *
 * @example
 * ```ts
 * const Post = Schema.define({
 *   className: "Post",
 *   fields: (field) => ({
 *     title: field.string({ required: true }),
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
	>(
		options: SchemaOptions<TClassName, TFields> &
			ReservedSchemaFieldCollision<NoInfer<TFields>>,
	): SchemaReference<NoInfer<TClassName>> {
		const schema = defineSchemaModel<TClassName, TFields>(options)
		finalizeSchemaModelClass(schema)
		Object.freeze(schema)

		// Field literals compile the runtime graph but generated contracts own the
		// application-facing class type after this declaration boundary.
		return schema
	}

	/**
	 * Defines one package-specialized schema with static helpers and persisted commands.
	 *
	 * Result commands are absent from drafts at the type level and validate trusted
	 * persisted identity at runtime. Packages retain ordinary QueryBuilder and relation
	 * execution rather than receiving an adapter or application escape hatch. Ordinary
	 * application schemas should continue to use `Schema.define()`.
	 *
	 * @example
	 * `Schema.defineSpecialized(options, ({ schema }) => ({ statics: { byId: schema.pointer }, results: {} }))`
	 */
	static defineSpecialized<
		const TOptions extends SpecializedSchemaOptions,
		const TStatics extends SchemaStaticCapabilities = SchemaStaticCapabilities,
		const TResults extends object = object,
	>(
		options: TOptions,
		createCapabilities: SchemaClassCapabilityFactory<
			SchemaReference<TOptions['className']>,
			TStatics,
			TResults
		>,
	): SchemaReference<TOptions['className']> &
		TStatics &
		SchemaResultCapabilityCarrier<TResults> {
		if (typeof createCapabilities !== 'function') {
			throw new TypeError('createCapabilities must be a function')
		}

		const schema = defineSchemaModel<TOptions['className'], SchemaFields>(
			options,
		)
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

		const specializedSchema = defineSchemaStaticCapabilities<
			typeof schema,
			TStatics
		>(schema, () => staticCapabilities as TStatics)
		defineSchemaModelResultCapabilities(schema, resultCapabilities)
		finalizeSchemaModelClass(specializedSchema)
		Object.freeze(specializedSchema)

		// The required marker is type-only; attached methods back it at runtime.
		return specializedSchema as typeof specializedSchema &
			SchemaResultCapabilityCarrier<TResults>
	}
}
