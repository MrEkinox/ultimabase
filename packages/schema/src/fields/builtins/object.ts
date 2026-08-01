import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	assertFieldDefinition,
	createFieldDefinition,
	snapshotDeclaredFieldValue,
} from '../base/definition.js'
import {
	assertFieldOptions,
	assertValidTypeName,
	normalizeFieldOptions,
	normalizeFlatValidation,
} from '../base/options.js'
import { isRequiredOnCreate } from '../base/options.js'
import type {
	FieldDefinition,
	FieldOptions,
	FieldOptionsBase,
	GenericField,
	InvalidOptionsArguments,
	ValidatedFieldOptions,
} from '../base/contract.js'
import type { InferFields } from '../../inference/types.js'

/**
 * Names the child fields of one object definition.
 */
export type ObjectFields = Readonly<Record<string, GenericField>>

/**
 * Builds the logical value represented by a structured field tree.
 */
export type ObjectFieldValue<TFields extends ObjectFields> =
	ObjectFields extends TFields
		? Readonly<Record<string, unknown>>
		: InferFields<TFields, 'object'>

type ObjectFieldCreateValue<TFields extends ObjectFields> = InferFields<
	TFields,
	'create'
>

/**
 * Keeps object structure inside neutral schema metadata.
 */
export interface ObjectFieldOptions<
	TFields extends ObjectFields = ObjectFields,
> extends FieldOptionsBase {
	/**
	 * Provides a static structured value or a factory using the nested create-input shape.
	 *
	 * @example `default: { name: "Anonymous" }`
	 */
	readonly default?: FieldOptions<ObjectFieldCreateValue<TFields>>['default']
	/**
	 * Maps each object property to an existing UltimaBase field declaration.
	 *
	 * @example `fields: { name: stringField(), active: booleanField() }`
	 */
	readonly fields: TFields
	/**
	 * Overrides the stable generated type name used by GraphQL and other schema generators.
	 *
	 * @example `typeName: "Profile"`
	 */
	readonly typeName?: string
}

/**
 * Carries a structured object value while leaving physical storage to adapters.
 */
export type ObjectField<
	TFields extends ObjectFields = ObjectFields,
	TOptions extends object = ObjectFieldOptions<TFields>,
> = FieldDefinition<'object', ObjectFieldValue<TFields>, TOptions>

type ValidatedObjectOptions<TOptions extends { readonly fields: object }> =
	TOptions extends {
		readonly fields: infer TFields extends ObjectFields
	}
		? Omit<TOptions, 'default'> extends Omit<
				ObjectFieldOptions<TFields>,
				'default'
			>
			? ValidatedFieldOptions<
					TOptions,
					ObjectFieldCreateValue<TFields>
				> extends never
				? never
				: TOptions
			: never
		: never

function snapshotObjectValue(
	value: unknown,
	fields: ObjectFields,
	path: string,
): Readonly<Record<string, unknown>> {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	for (const key of Object.keys(value)) {
		if (!Object.hasOwn(fields, key)) {
			throw new TypeError(`${path}.${key} is not a declared field`)
		}
	}

	for (const [key, field] of Object.entries(fields)) {
		if (!Object.hasOwn(value, key) && isRequiredOnCreate(field)) {
			throw new TypeError(`${path}.${key} is required in an object default`)
		}
	}

	const entries: [string, unknown][] = Object.entries(fields)
		.filter(([key]) => Object.hasOwn(value, key))
		.map(([key, field]) => [
			key,
			snapshotDeclaredFieldValue(field, value[key], `${path}.${key}`),
		])

	return immutableRecord(Object.fromEntries(entries))
}

/**
 * Declares a typed structured value by composing existing field definitions.
 *
 * @example
 * ```ts
 * objectField({
 *   typeName: "Profile",
 *   fields: {
 *     displayName: stringField({ validation: { required: true } }),
 *     active: booleanField({ default: true }),
 *   },
 * })
 * ```
 */
export function objectField<
	const TFields extends ObjectFields,
	const TOptions extends ObjectFieldOptions<TFields>,
>(
	options: ObjectFieldOptions<TFields> & TOptions,
	...invalidOptions: InvalidOptionsArguments<
		ValidatedObjectOptions<NoInfer<TOptions>>
	>
): ObjectField<TFields, TOptions>

export function objectField(
	options: ObjectFieldOptions,
	...invalidOptions: readonly never[]
): ObjectField<ObjectFields, ObjectFieldOptions> {
	// The rest parameter exists only to keep invalid generic calls uncallable.
	void invalidOptions
	assertFieldOptions(options)

	if (!isPlainRecord(options.fields)) {
		throw new TypeError('fields must be a field map')
	}

	assertValidTypeName(options.typeName)

	for (const [name, field] of Object.entries(options.fields)) {
		assertNonEmptyString(name, 'object field name')
		assertFieldDefinition(field, `fields.${name}`)
	}

	const normalized = normalizeFieldOptions(
		options,
		normalizeFlatValidation,
		(value, path) => snapshotObjectValue(value, options.fields, path),
	)

	// The field map is detached while reusable immutable child definitions keep identity.
	const fieldOptions = immutableRecord({
		...normalized,
		fields: immutableRecord(options.fields),
	})

	return createFieldDefinition('object', fieldOptions, (value, path) =>
		snapshotObjectValue(value, fieldOptions.fields, path),
	)
}
