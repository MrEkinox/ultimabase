import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	defineExtensions,
	type SchemaExtension,
} from '../extensions/definition.js'
import type { GenericField } from '../fields/base/contract.js'
import { assertFieldDefinition } from '../fields/base/definition.js'
import type { Query } from '../../query/query/query.js'
import type { InferCreateInput } from '../inference/types.js'
import type { Pointer } from '../relations/pointer.js'
import { createSchemaModelClass, type SchemaDraft } from './model.js'
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
	 * Extension order is preserved and duplicate identities are rejected.
	 *
	 * @example `extensions: [permissionsExtension]`
	 */
	readonly extensions?: TExtensions
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
	 * @example `hooks: { beforeFind: ({ query }) => query.limit(100) }`
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
	readonly fields: Readonly<TFields> & Readonly<SystemFields>
	/** The immutable normalized field-level and composite index declarations. */
	readonly indexes: readonly SchemaIndexDefinition<SchemaFieldName<TFields>>[]
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
	): SchemaDraft<SchemaClass<TClassName, TFields, TExtensions>>
	/** Starts one fresh immutable Query without retaining execution state. */
	query(): Query<SchemaClass<TClassName, TFields, TExtensions>>
	/** Creates one immutable pointer to an object of this exact schema. */
	pointer(id: string): Pointer<SchemaClass<TClassName, TFields, TExtensions>>
}

type ReservedFieldCollision<TFields extends SchemaFields> =
	Extract<keyof TFields, ReservedSystemFieldName> extends never
		? unknown
		: never

// A versioned global symbol preserves constructor provenance across package copies.
const schemaDefinitionMarker = Symbol.for(
	'@ultimabase/core/schema-definition/v1',
)
const emptySchemaExtensions: readonly [] = immutableArray([])
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

const assertNoReservedFieldCollision = (fields: SchemaFields): void => {
	for (const name of reservedSystemFieldNames) {
		if (Object.hasOwn(fields, name)) {
			throw new TypeError(`Reserved schema field: ${name}`)
		}
	}

	for (const name of Object.keys(fields)) {
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
 * const query = Post.query().select("id", "title")
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

		const fields = immutableRecord({
			...options.fields,
			...systemFields,
		})
		const indexes = normalizeSchemaIndexes(
			options.fields,
			options.indexes,
		) as readonly SchemaIndexDefinition<SchemaFieldName<TFields>>[]
		const extensions = (
			options.extensions === undefined
				? emptySchemaExtensions
				: defineExtensions(options.extensions)
		) as readonly [...TExtensions]
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
		Object.freeze(schema)

		return schema
	}
}
