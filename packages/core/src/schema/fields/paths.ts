import {
	assertNonEmptyString,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { GenericField } from './base/contract.js'
import { assertFieldDefinition } from './base/definition.js'
import type { SchemaDefinition } from '../schema/definition.js'

type FieldMap = Readonly<Record<string, GenericField>>
type StringFieldName<TFields> = Extract<keyof TFields, string>
// A finite editor budget prevents widened generic schemas from recursing forever.
type MaximumFieldPathDepth = 15

/** Reads child declarations only from the framework-owned object field kind. */
type ChildFields<TField> = TField extends {
	readonly kind: 'object'
	readonly options: {
		readonly fields: infer TFields extends FieldMap
	}
}
	? TFields
	: never

type ExactFieldPath<
	TFields extends FieldMap,
	TDepth extends readonly unknown[] = readonly [],
> = {
	readonly [TName in StringFieldName<TFields>]:
		| readonly [TName]
		| ([ChildFields<TFields[TName]>] extends [never]
				? never
				: TDepth['length'] extends MaximumFieldPathDepth
					? never
					: readonly [
							TName,
							...ExactFieldPath<
								ChildFields<TFields[TName]>,
								readonly [...TDepth, unknown]
							>,
						])
}[StringFieldName<TFields>]

/**
 * Lists every non-empty field path accepted by one schema declaration.
 *
 * Exact schemas suggest top-level and nested object-field names, including
 * framework system fields. A deliberately widened schema retains only the
 * honest guarantee that a path contains one or more string segments.
 *
 * @example `const path: SchemaFieldPath<typeof UserSchema> = ['profile', 'email']`
 */
export type SchemaFieldPath<TSchema extends SchemaDefinition> =
	string extends keyof TSchema['fields']
		? readonly [string, ...string[]]
		: ExactFieldPath<TSchema['fields']>

type ResolveFieldAtPath<
	TFields extends FieldMap,
	TPath extends readonly string[],
> = [TPath] extends [
	readonly [
		infer TName extends StringFieldName<TFields>,
		...infer TRest extends readonly string[],
	],
]
	? TRest extends readonly []
		? TFields[TName]
		: [ChildFields<TFields[TName]>] extends [never]
			? never
			: ResolveFieldAtPath<ChildFields<TFields[TName]>, TRest>
	: never

/**
 * Resolves the exact field definition stored at one typed schema path.
 *
 * The terminal definition retains its logical value, list, nullability, and
 * plugin-owned kind. Widened schemas return `GenericField` rather than claiming
 * metadata that their public type no longer contains.
 */
export type FieldAtPath<
	TSchema extends SchemaDefinition,
	TPath extends readonly string[],
> = string extends keyof TSchema['fields']
	? GenericField
	: ResolveFieldAtPath<TSchema['fields'], TPath>

interface RuntimeObjectField extends GenericField {
	readonly kind: 'object'
	readonly options: Readonly<{
		readonly fields: FieldMap
	}>
}

const hasChildFields = (field: GenericField): field is RuntimeObjectField =>
	field.kind === 'object' &&
	'fields' in field.options &&
	isPlainRecord(field.options.fields)

/** Resolves one immutable declaration path without parsing or joining segments. */
export const resolveSchemaFieldPath = (
	schema: SchemaDefinition,
	path: readonly string[],
): GenericField => {
	const runtimePath: unknown = path

	if (!isUnknownArray(runtimePath) || runtimePath.length === 0) {
		throw new TypeError('field path must be a non-empty segment list')
	}

	let fields: FieldMap = schema.persistedFields

	for (const [index, segment] of runtimePath.entries()) {
		assertNonEmptyString(segment, `field path[${String(index)}]`)

		if (!Object.hasOwn(fields, segment)) {
			throw new TypeError(
				`Unknown field path segment ${JSON.stringify(segment)} at index ${String(index)} in schema ${JSON.stringify(schema.className)}`,
			)
		}

		const field: unknown = fields[segment]
		assertFieldDefinition(field, `field path[${String(index)}]`)

		if (index === runtimePath.length - 1) {
			return field
		}

		if (!hasChildFields(field)) {
			throw new TypeError(
				`Field path segment ${JSON.stringify(segment)} at index ${String(index)} is not an object field`,
			)
		}

		fields = field.options.fields
	}

	// Runtime length validation makes this fallback unreachable.
	throw new TypeError('field path must contain a terminal segment')
}
