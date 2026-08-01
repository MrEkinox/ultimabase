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

/**
 * Collects named field definitions without erasing their concrete literals.
 */
export type SchemaFields = Readonly<Record<string, GenericField>>

/**
 * Collects schema-scoped plugin metadata in deterministic declaration order.
 */
export type SchemaExtensions = readonly SchemaExtension<string, object>[]

/**
 * Describes the developer input accepted by defineSchema.
 */
export type SchemaOptions<
	TClassName extends string = string,
	TFields extends SchemaFields = SchemaFields,
	TExtensions extends SchemaExtensions = readonly [],
> = {
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
} & (TExtensions extends readonly []
	? {
			/**
			 * Attaches immutable schema metadata interpreted by installed plugins.
			 * Extension order is preserved and duplicate identities are rejected.
			 *
			 * @example `extensions: [permissionsExtension]`
			 */
			readonly extensions?: TExtensions
		}
	: {
			/**
			 * Attaches immutable schema metadata interpreted by installed plugins.
			 * Extension order is preserved and duplicate identities are rejected.
			 *
			 * @example `extensions: [permissionsExtension]`
			 */
			readonly extensions: TExtensions
		})

/**
 * Carries immutable schema metadata while retaining every declaration literal.
 */
export interface SchemaDefinition<
	TClassName extends string = string,
	TFields extends SchemaFields = SchemaFields,
	TExtensions extends SchemaExtensions = SchemaExtensions,
> {
	/** The exact logical class name supplied to `defineSchema`. */
	readonly className: TClassName
	/** The immutable developer and framework-owned field map. */
	readonly fields: Readonly<TFields> & Readonly<SystemFields>
	/** The immutable normalized field-level and composite index declarations. */
	readonly indexes: readonly SchemaIndexDefinition<SchemaFieldName<TFields>>[]
	/** The immutable ordered schema-extension tuple. */
	readonly extensions: readonly [...TExtensions]
}

type ReservedFieldCollision<TFields extends SchemaFields> =
	Extract<keyof TFields, ReservedSystemFieldName> extends never
		? unknown
		: never

const emptySchemaExtensions: readonly [] = immutableArray([])

const assertNoReservedFieldCollision = (fields: SchemaFields): void => {
	for (const name of reservedSystemFieldNames) {
		if (Object.hasOwn(fields, name)) {
			throw new TypeError(`Reserved schema field: ${name}`)
		}
	}
}

/**
 * Declares an immutable schema that becomes UltimaBase's source of truth.
 * The exact class name and field map remain available to query and input inference.
 *
 * @example
 * ```ts
 * const PostSchema = defineSchema({
 *   className: "Post",
 *   fields: {
 *     title: stringField({ validation: { required: true } }),
 *     published: booleanField({ default: false }),
 *   },
 * })
 * ```
 */
export function defineSchema<
	const TClassName extends string,
	const TFields extends SchemaFields,
>(
	options: SchemaOptions<TClassName, TFields> &
		ReservedFieldCollision<NoInfer<TFields>>,
): SchemaDefinition<TClassName, TFields, readonly []>

/**
 * Declares an immutable schema while preserving its ordered plugin metadata.
 *
 * @example
 * ```ts
 * const PostSchema = defineSchema({
 *   className: "Post",
 *   fields: { title: stringField() },
 *   extensions: [permissionsExtension],
 * })
 * ```
 */
export function defineSchema<
	const TClassName extends string,
	const TFields extends SchemaFields,
	const TExtensions extends SchemaExtensions,
>(
	options: SchemaOptions<TClassName, TFields, TExtensions> &
		ReservedFieldCollision<NoInfer<TFields>>,
): SchemaDefinition<TClassName, TFields, TExtensions>

export function defineSchema(options: {
	readonly className: string
	readonly fields: SchemaFields
	readonly indexes?: readonly SchemaIndexOptions[]
	readonly extensions?: SchemaExtensions
}): SchemaDefinition {
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

	const extensions =
		options.extensions === undefined
			? emptySchemaExtensions
			: defineExtensions(options.extensions)

	// Field definitions are already immutable, so only the caller-owned map needs copying.
	return immutableRecord({
		className: options.className,
		fields: immutableRecord({
			...options.fields,
			...systemFields,
		}),
		indexes: normalizeSchemaIndexes(options.fields, options.indexes),
		extensions,
	})
}
