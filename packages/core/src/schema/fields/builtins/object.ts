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
	FieldInferenceState,
	FieldListOption,
	FieldListValue,
	FieldOptions,
	FieldOptionsBase,
	GenericField,
	ScalarFieldInferenceState,
} from '../base/contract.js'
import type { FieldDefault } from '../base/defaults.js'
import type { InferFields } from '../../inference/types.js'
import type { FieldHookDeclaration } from '../../hooks/field-contracts.js'
import { splitFieldDeclarationOptions } from '../../hooks/field-declarations.js'
import type { FieldAccessDeclaration } from '../../access/contracts.js'

/**
 * Names the child fields of one object definition.
 */
export type ObjectFields = Readonly<Record<string, GenericField>>

/** Rejects relationship-capable fields from one embedded value boundary. */
type EmbeddableObjectFields<TFields extends ObjectFields> = {
	readonly [TName in keyof TFields]: TFields[TName] extends {
		readonly kind: 'pointer' | 'relation'
	}
		? never
		: TFields[TName]
}

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
	 * Pointer and relation fields are schema relationships, so they must be declared
	 * as top-level schema fields rather than embedded inside this stored value.
	 *
	 * @example `fields: { name: stringField(), active: booleanField() }`
	 */
	readonly fields: EmbeddableObjectFields<TFields>
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
	TInference extends FieldInferenceState = FieldInferenceState,
> = FieldDefinition<
	'object',
	ObjectFieldValue<TFields>,
	ObjectFieldOptions<TFields>,
	TInference
>

/** Keeps nested fields exact while widening runtime-only object metadata. */
type CompactObjectFieldOptions<
	TFields extends ObjectFields,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ObjectFieldOptions<TFields> & {
	readonly validation?: {
		readonly required?: TRequired
	}
} & {
	readonly list?: TList
	readonly immutable?: TImmutable
} & FieldHookDeclaration<
		ResolvedObjectField<
			NoInfer<TFields>,
			NoInfer<TRequired>,
			NoInfer<TList>,
			NoInfer<TImmutable>,
			false
		>
	> &
	FieldAccessDeclaration<
		ResolvedObjectField<
			NoInfer<TFields>,
			NoInfer<TRequired>,
			NoInfer<TList>,
			NoInfer<TImmutable>,
			false
		>
	>

type DefaultedObjectFieldOptions<
	TFields extends ObjectFields,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = CompactObjectFieldOptions<TFields, TRequired, TList, TImmutable> & {
	readonly default: FieldDefault<
		FieldListValue<ObjectFieldCreateValue<TFields>, TList>
	>
}

type NonDefaultedObjectFieldOptions<
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
	ScalarFieldInferenceState<TRequired, TList, TImmutable, THasDefault>
>

type DefaultedObjectField<
	TFields extends ObjectFields,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedObjectField<TFields, TRequired, TList, TImmutable, true>

type NonDefaultedObjectField<
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
	const TRequired extends boolean = false,
	const TList extends FieldListOption = false,
	const TImmutable extends boolean = false,
>(
	options: DefaultedObjectFieldOptions<TFields, TRequired, TList, TImmutable>,
): DefaultedObjectField<TFields, TRequired, TList, TImmutable>

export function objectField<
	const TFields extends ObjectFields,
	const TRequired extends boolean = false,
	const TList extends FieldListOption = false,
	const TImmutable extends boolean = false,
>(
	options: NonDefaultedObjectFieldOptions<
		TFields,
		TRequired,
		TList,
		TImmutable
	>,
): NonDefaultedObjectField<TFields, TRequired, TList, TImmutable>

export function objectField(
	options: ObjectFieldOptions,
	...invalidOptions: readonly never[]
): ObjectField {
	// The rest parameter exists only to keep invalid generic calls uncallable.
	void invalidOptions
	const { access, hooks, metadataOptions } =
		splitFieldDeclarationOptions(options)
	assertFieldOptions(metadataOptions)

	if (!isPlainRecord(metadataOptions.fields)) {
		throw new TypeError('fields must be a field map')
	}

	assertValidTypeName(metadataOptions.typeName)

	for (const [name, field] of Object.entries(metadataOptions.fields)) {
		assertNonEmptyString(name, 'object field name')
		assertFieldDefinition(field, `fields.${name}`)

		if (field.kind === 'pointer' || field.kind === 'relation') {
			throw new TypeError(
				`fields.${name} cannot be a pointer or relation inside objectField`,
			)
		}
	}

	const normalized = normalizeFieldOptions(
		metadataOptions,
		normalizeFlatValidation,
		(value, path) => snapshotObjectValue(value, metadataOptions.fields, path),
	)

	// The field map is detached while reusable immutable child definitions keep identity.
	const fieldOptions = immutableRecord({
		...normalized,
		fields: immutableRecord(metadataOptions.fields),
	})

	return createFieldDefinition(
		'object',
		fieldOptions,
		(value, path) => snapshotObjectValue(value, fieldOptions.fields, path),
		hooks,
		access,
	)
}
