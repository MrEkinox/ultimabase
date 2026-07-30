import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { defineExtensions, type SchemaExtension } from './extension.js'
import type { GenericField } from './field.js'
import {
	reservedSystemFieldNames,
	systemFields,
	type ReservedSystemFieldName,
	type SystemFields,
} from './system-field.js'

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
	readonly className: TClassName
	readonly fields: TFields
} & (TExtensions extends readonly []
	? { readonly extensions?: TExtensions }
	: { readonly extensions: TExtensions })

/**
 * Carries immutable schema metadata while retaining every declaration literal.
 */
export interface SchemaDefinition<
	TClassName extends string = string,
	TFields extends SchemaFields = SchemaFields,
	TExtensions extends SchemaExtensions = SchemaExtensions,
> {
	readonly className: TClassName
	readonly fields: Readonly<TFields> & Readonly<SystemFields>
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
 * Creates an immutable schema definition without interpreting plugin metadata.
 */
export function defineSchema<
	const TClassName extends string,
	const TFields extends SchemaFields,
>(
	options: SchemaOptions<TClassName, TFields> &
		ReservedFieldCollision<NoInfer<TFields>>,
): SchemaDefinition<TClassName, TFields, readonly []>

/**
 * Preserves the exact ordered extension tuple when plugins contribute metadata.
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
	readonly extensions?: SchemaExtensions
}): SchemaDefinition {
	assertNoReservedFieldCollision(options.fields)

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
		extensions,
	})
}
