import { assertNonEmptyString, immutableRecord } from '@ultimabase/shared'

import {
	assertFieldDefinition,
	createFieldDefinition,
	snapshotDeclaredFieldValue,
} from '../base/definition.js'
import {
	assertFieldOptions,
	assertValidTypeName,
	fieldOptionKeys,
	isRequiredOnCreate,
	normalizeFieldOptions,
	type BuiltInFieldOptionsContract,
} from '../base/options.js'
import type {
	CompatibleFieldOptionsExtension,
	FieldDefinition,
	FieldTypegenState,
	FieldListOption,
	FieldListValue,
	FieldOptions,
	FieldOptionsBase,
	GenericField,
	ScalarFieldTypegenState,
} from '../base/contract.js'
import type { FieldDefault } from '../base/defaults.js'
import type { FieldValueMap } from '../base/value-map.js'
import { assertPlainObject } from '../../../exact-object-validation.js'

/**
 * Names the child fields of one object definition.
 */
export type ObjectFields = Readonly<Record<string, GenericField>>

/** Keeps only fields whose behavior can execute inside one embedded value. */
type EmbeddableObjectField<TField extends GenericField> = TField extends {
	readonly kind: 'pointer' | 'relation'
}
	? never
	: TField extends { readonly options: { readonly indexed: unknown } }
		? never
		: TField extends {
					readonly kind: 'int' | 'bigint'
					readonly options: { readonly autoIncrement: unknown }
			  }
			? never
			: TField extends { readonly options: { readonly generatedOn: unknown } }
				? never
				: TField

type EmbeddableObjectFields<TFields extends ObjectFields> = {
	readonly [TName in keyof TFields]: EmbeddableObjectField<TFields[TName]>
}

/**
 * Builds the logical value represented by a structured field tree.
 */
export type ObjectFieldValue<TFields extends ObjectFields> =
	ObjectFields extends TFields
		? Readonly<Record<string, unknown>>
		: FieldValueMap<TFields, 'object'>

type ObjectFieldCreateValue<TFields extends ObjectFields> = FieldValueMap<
	TFields,
	'create'
>

/**
 * Keeps object structure inside neutral schema metadata.
 */
export interface ObjectFieldOptions<
	TFields extends ObjectFields = ObjectFields,
> extends FieldOptionsBase<FieldListOption, ObjectFieldValue<TFields>> {
	/**
	 * Provides a static structured value or a factory using the nested create-input shape.
	 *
	 * @example `default: { name: "Anonymous" }`
	 */
	readonly default?: FieldOptions<ObjectFieldCreateValue<TFields>>['default']
	/**
	 * Maps each object property to an existing UltimaBase field declaration.
	 *
	 * Pointer and relation fields are schema relationships, so they must be declared
	 * as top-level schema fields rather than embedded inside this stored value.
	 * Database-generated integer sequences also require their own top-level column.
	 *
	 * @example `fields: { name: stringField(), active: booleanField() }`
	 */
	readonly fields: EmbeddableObjectFields<TFields>
	/**
	 * Overrides the stable generated type name used by schema generators.
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
	TTypegen extends FieldTypegenState = FieldTypegenState,
> = FieldDefinition<
	'object',
	ObjectFieldValue<TFields>,
	ObjectFieldOptions<TFields>,
	TTypegen
>

const objectFieldOptionsContract: BuiltInFieldOptionsContract = {
	kind: 'object',
	optionKeys: [...fieldOptionKeys, 'fields', 'typeName'],
}

/** Keeps nested fields exact while widening runtime-only object metadata. */
type CompactObjectFieldOptions<
	TFields extends ObjectFields,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = Omit<ObjectFieldOptions<TFields>, 'immutable' | 'list' | 'required'> & {
	/**
	 * Requires a non-null persisted object and requires create input unless a default supplies it.
	 * @example `required: true`
	 */
	readonly required?: TRequired
	/**
	 * Wraps the complete embedded object in one homogeneous list.
	 * @example `list: true`
	 */
	readonly list?: TList
	/**
	 * Prevents replacement of the object after creation.
	 * @example `immutable: true`
	 */
	readonly immutable?: TImmutable
}

export type DefaultedObjectFieldOptions<
	TFields extends ObjectFields,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = CompactObjectFieldOptions<TFields, TRequired, TList, TImmutable> & {
	readonly default: FieldDefault<
		FieldListValue<ObjectFieldCreateValue<NoInfer<TFields>>, TList>
	>
}

export type NonDefaultedObjectFieldOptions<
	TFields extends ObjectFields,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = CompactObjectFieldOptions<TFields, TRequired, TList, TImmutable> & {
	readonly default?: never
}

type ResolvedObjectField<
	TFields extends ObjectFields,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
> = FieldDefinition<
	'object',
	ObjectFieldValue<TFields>,
	ObjectFieldOptions<TFields>,
	ScalarFieldTypegenState<TRequired, TList, TImmutable, THasDefault>
>

export type DefaultedObjectField<
	TFields extends ObjectFields,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedObjectField<TFields, TRequired, TList, TImmutable, true>

export type NonDefaultedObjectField<
	TFields extends ObjectFields,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedObjectField<TFields, TRequired, TList, TImmutable, false>

function snapshotObjectValue(
	value: unknown,
	fields: ObjectFields,
	path: string,
): Readonly<Record<string, unknown>> {
	assertPlainObject(value, `${path} must be a plain object`)

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
 *     displayName: stringField({ required: true }),
 *     active: booleanField({ default: true }),
 *   },
 * })
 * ```
 */
export function objectField<
	const TFields extends ObjectFields,
	const TRequired extends boolean = false,
	const TList extends FieldListOption = false,
	const TImmutable extends boolean = false,
	const TExtensionOptions extends object = object,
>(
	options: CompatibleFieldOptionsExtension<
		DefaultedObjectFieldOptions<TFields, TRequired, TList, TImmutable>,
		TExtensionOptions,
		ObjectFieldValue<TFields>
	>,
): DefaultedObjectField<TFields, TRequired, TList, TImmutable>

export function objectField<
	const TFields extends ObjectFields,
	const TRequired extends boolean = false,
	const TList extends FieldListOption = false,
	const TImmutable extends boolean = false,
	const TExtensionOptions extends object = object,
>(
	options: CompatibleFieldOptionsExtension<
		NonDefaultedObjectFieldOptions<TFields, TRequired, TList, TImmutable>,
		TExtensionOptions,
		ObjectFieldValue<TFields>
	>,
): NonDefaultedObjectField<TFields, TRequired, TList, TImmutable>

export function objectField(
	options: ObjectFieldOptions,
	...invalidOptions: readonly never[]
): ObjectField {
	// The rest parameter exists only to keep invalid generic calls uncallable.
	void invalidOptions
	assertFieldOptions(options)

	assertPlainObject(options.fields, 'fields must be a field map')

	assertValidTypeName(options.typeName)
	assertEmbeddedFieldMap(options.fields, '')

	const normalized = normalizeFieldOptions(
		options,
		(value, path) => snapshotObjectValue(value, options.fields, path),
		objectFieldOptionsContract,
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

/** Protects low-level and transformed object fields with the embedded contract. */
export const assertEmbeddedFieldDefinition: (
	field: unknown,
	path: string,
) => asserts field is GenericField = (field, path) => {
	assertFieldDefinition(field, path)

	if (field.kind === 'pointer' || field.kind === 'relation') {
		throw new TypeError(
			`${path} cannot be a pointer or relation inside objectField`,
		)
	}

	if (Object.hasOwn(field.options, 'indexed')) {
		throw new TypeError(`${path} cannot use indexed inside objectField`)
	}

	if (
		(field.kind === 'int' || field.kind === 'bigint') &&
		Object.hasOwn(field.options, 'autoIncrement')
	) {
		throw new TypeError(`${path} cannot use autoIncrement inside objectField`)
	}

	if (Object.hasOwn(field.options, 'generatedOn')) {
		throw new TypeError(`${path} cannot use generatedOn inside objectField`)
	}

	if (field.kind === 'object') {
		assertEmbeddedFieldMap(Reflect.get(field.options, 'fields'), `${path}.`)
	}
}

/** Validates every child of one embedded field map with the embedded contract. */
function assertEmbeddedFieldMap(
	fields: unknown,
	pathPrefix: string,
): asserts fields is ObjectFields {
	assertPlainObject(fields, `${pathPrefix}fields must be a field map`)

	for (const [name, field] of Object.entries(fields)) {
		assertNonEmptyString(name, 'object field name')
		assertEmbeddedFieldDefinition(field, `${pathPrefix}fields.${name}`)
	}
}
