import { assertNonEmptyString, immutableRecord } from '@ultimabase/shared'

import type { GenericField } from '../fields/base/contract.js'
import type { GenericVirtualField } from './virtual-field.js'
import { OutputBuilderMethodUnavailableError } from '../output/builder.js'
import type { Pointer } from '../relations/pointer.js'
import {
	createSchemaModelCapabilityContext,
	finalizeSchemaModelClass,
} from './model-capabilities.js'
import { createSchemaModelClass } from './model-class.js'
import type {
	SchemaDraft,
	SchemaModelCapabilityContext,
	SchemaResultCapabilityCarrier,
} from './model-contracts.js'
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
	type SchemaFieldBuilderDeclaration,
} from './field-builder.js'
import {
	FieldBuilderMethodUnavailableError,
	FieldBuilderTargetUnavailableError,
} from './runtime-field-builder.js'
import type {
	BaseSchemaTypeInfo,
	SchemaTypeInfo,
	SchemaTypeInfoByName,
	SchemaTypeInfoByNameOrBase,
	UltimaBaseGeneratedSchemaClassSurface,
	UltimaBaseGeneratedSchemaOptions,
} from '../type-info.js'
import type { SchemaAPI } from './schema-api.js'
import type { ReservedSchemaFieldCollision } from './reserved-field-names.js'
import type { SchemaCompilationProvenance } from './provenance.js'
import type { SourceSchemaTypeInfo } from './source-type-info.js'
import {
	prepareSchemaCompilation,
	readCompiledSchemaRecord,
	schemaDefinitionMarker,
	SchemaCompilationError,
	snapshotUnresolvedSchemaOptions,
	storeProvisionalSchemaCompilation,
	storeSchemaDeclaration,
} from './definition-compilation.js'
import { assertPlainObject } from '../../exact-object-validation.js'

export type {
	ConfiguredFieldDeclaration,
	ConfiguredSchemaDeclarationOptions,
	ConfiguredSchemaNamespace,
	ConfiguredSchemaResult,
} from './configured-schema-namespace.js'

export type { BaseItem } from '../type-info.js'
export type { SchemaAPI } from './schema-api.js'
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
 * Describes the developer input accepted by `App.Schema.define()`.
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
	/** The exact logical class name supplied to `App.Schema.define()`. */
	readonly className: TClassName
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

/** Represents one public schema class driven by its resolved type contract. */
export interface SchemaClass<
	TContract extends SchemaTypeInfo = BaseSchemaTypeInfo<string>,
> extends SchemaAPI<TContract> {
	/** Creates one immutable draft from the resolved create input. */
	new (input: TContract['inputs']['create']): SchemaDraft<this>
	/** Creates one immutable pointer to this schema. */
	pointer(id: string): Pointer<this>
}

// Existing registries retain plugin-owned additions until issue 6313 reduces
// them to the name graph; otherwise the configured source map owns Core types.
type SchemaReferenceTypeInfo<
	TClassName extends string,
	TFields extends SchemaDeclaredFields | undefined,
> = TFields extends SchemaDeclaredFields
	? [SchemaTypeInfoByName<TClassName>] extends [never]
		? string extends keyof TFields
			? SchemaTypeInfoByNameOrBase<TClassName>
			: SourceSchemaTypeInfo<TClassName, TFields>
		: SchemaTypeInfoByName<TClassName>
	: SchemaTypeInfoByNameOrBase<TClassName>

/** Resolves one public schema class from source, Typegen, or the bootstrap contract. */
export type SchemaReference<
	TClassName extends string,
	TFields extends SchemaDeclaredFields | undefined = undefined,
> = SchemaClass<SchemaReferenceTypeInfo<TClassName, TFields>> &
	UltimaBaseGeneratedSchemaClassSurface<TClassName>

/** Collects additional static capabilities owned by a schema specialization. */
export type SchemaStaticCapabilities = object

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

const defineSchemaModel = <
	const TClassName extends string,
	const TFields extends SchemaDeclaredFields,
>(
	options: SchemaOptions<TClassName, TFields>,
): SchemaReference<TClassName, TFields> => {
	assertPlainObject(options, 'schema options must be an object')

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

	// Readers close over the final class; they run only after compilation.
	const schema: SchemaReference<TClassName, TFields> = createSchemaModelClass<
		TClassName,
		SchemaFields
	>({
		className: options.className,
		readDefinition: () =>
			readCompiledSchemaRecord(schema).definition as SchemaMetadata<
				TClassName,
				SchemaFields
			>,
		readDeveloperFields: () => readCompiledSchemaRecord(schema).developerFields,
	}) as SchemaReference<TClassName, TFields>

	storeSchemaDeclaration(
		schema,
		immutableRecord({
			className: options.className,
			fields,
			indexes: snapshotSchemaIndexOptions(options.indexes),
			options: snapshotUnresolvedSchemaOptions(options),
		}),
	)
	// Keep provenance out of public enumeration while sharing it across package copies.
	Object.defineProperty(schema, schemaDefinitionMarker, {
		configurable: false,
		enumerable: false,
		value: true,
		writable: false,
	})
	// Schemas without application-owned builder methods or targets compile eagerly.
	try {
		storeProvisionalSchemaCompilation(prepareSchemaCompilation(schema))
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
 * const Post = UltimaBase.Schema.define({
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
// The low-level class retains specialization and identity checks, not ordinary authoring.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Schema {
	private constructor() {
		throw new TypeError(
			'Use UltimaBase.Schema.define() to declare a schema model class',
		)
	}

	/**
	 * Checks whether an untrusted value is a declared schema model class.
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
	 * Defines one package-specialized schema with static helpers and persisted commands.
	 *
	 * Result commands are absent from drafts at the type level and validate trusted
	 * persisted identity at runtime. Packages retain ordinary QueryBuilder and relation
	 * execution rather than receiving an adapter or application escape hatch. Ordinary
	 * application schemas should use `App.Schema.define()`.
	 *
	 * @example
	 * `Schema.defineSpecialized(options, ({ schema }) => ({ statics: { byId: schema.pointer }, results: {} }))`
	 */
	static defineSpecialized<
		const TClassName extends string,
		const TFields extends SchemaDeclaredFields,
		const TStatics extends SchemaStaticCapabilities = SchemaStaticCapabilities,
		const TResults extends object = object,
	>(
		options: SchemaOptions<TClassName, TFields> &
			ReservedSchemaFieldCollision<NoInfer<TFields>>,
		createCapabilities: SchemaClassCapabilityFactory<
			SchemaReference<TClassName, TFields>,
			TStatics,
			TResults
		>,
	): SchemaReference<TClassName, TFields> &
		TStatics &
		SchemaResultCapabilityCarrier<TResults> {
		if (typeof createCapabilities !== 'function') {
			throw new TypeError('createCapabilities must be a function')
		}

		const schema = defineSchemaModel<TClassName, TFields>(options)
		const capabilities: unknown = createCapabilities(
			createSchemaModelCapabilityContext(schema),
		)

		assertPlainObject(
			capabilities,
			'schema class capabilities must be a plain object',
		)
		const staticCapabilities = capabilities.statics
		const resultCapabilities = capabilities.results

		assertPlainObject(
			staticCapabilities,
			'schema static capabilities must be a plain object',
		)
		assertPlainObject(
			resultCapabilities,
			'schema result capabilities must be a plain object',
		)

		for (const name of Reflect.ownKeys(staticCapabilities)) {
			if (typeof name === 'string') {
				assertNonEmptyString(name, 'schema static capability name')
			}

			if (name in schema) {
				throw new TypeError(
					`Reserved schema static capability: ${String(name)}`,
				)
			}

			// Static specialization methods follow native class-method visibility.
			Object.defineProperty(schema, name, {
				configurable: false,
				enumerable: false,
				value: Reflect.get(staticCapabilities, name),
				writable: false,
			})
		}
		finalizeSchemaModelClass(schema, resultCapabilities)
		Object.freeze(schema)

		// The required marker is type-only; attached methods back it at runtime.
		return schema as SchemaReference<TClassName, TFields> &
			TStatics &
			SchemaResultCapabilityCarrier<TResults>
	}
}

/** @internal Builds ordinary configured schemas through the same Core compiler. */
export const defineOrdinarySchemaModel = <
	const TClassName extends string,
	const TFields extends SchemaFields,
>(
	options: SchemaOptions<TClassName, TFields> &
		ReservedSchemaFieldCollision<NoInfer<TFields>>,
): SchemaReference<TClassName> => {
	const schema = defineSchemaModel<TClassName, TFields>(options)
	finalizeSchemaModelClass(schema)
	Object.freeze(schema)
	return schema as unknown as SchemaReference<TClassName>
}
