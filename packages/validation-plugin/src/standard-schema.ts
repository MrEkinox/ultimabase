import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { MaybePromise } from '@ultimabase/shared'

/** Accepts Standard Schema implementations represented by objects or callables. */
export interface FieldStandardSchema {
	readonly '~standard': Pick<
		StandardSchemaV1['~standard'],
		'validate' | 'vendor' | 'version'
	>
}

/**
 * What a validation function returns: `true` when the value is valid,
 * otherwise a message, or a message with a stable `code` the client receives.
 *
 * @example `(title) => title.length <= 200 || 'At most 200 characters'`
 */
export type ValidationResult =
	| true
	| string
	| Readonly<{ message: string; code?: string }>

/** Validates one field value without a library (ADR-0319); it may be async. */
export type FieldValidationFunction<TValue> = (
	value: TValue,
) => MaybePromise<ValidationResult>

/**
 * A field validator: a Standard Schema validator (Zod, Valibot, ArkType…),
 * whose output is the stored value, or a function (ADR-0319).
 *
 * @example `validation: z.string().trim().max(200)`
 */
export type FieldValidator<TValue> =
	| FieldStandardSchema
	| FieldValidationFunction<TValue>

type IsAny<TValue> = 0 extends 1 & TValue ? true : false

type StandardSchemaInput<TSchema extends FieldStandardSchema> =
	StandardSchemaV1.InferInput<TSchema>

type StandardSchemaOutput<TSchema extends FieldStandardSchema> =
	StandardSchemaV1.InferOutput<TSchema>

/** Names one value type in a validator mismatch message. */
type TypeName<TValue> = [TValue] extends [string]
	? 'string'
	: [TValue] extends [number]
		? 'number'
		: [TValue] extends [boolean]
			? 'boolean'
			: [TValue] extends [bigint]
				? 'bigint'
				: [TValue] extends [Date]
					? 'Date'
					: [TValue] extends [readonly (infer TItem)[]]
						? `${TypeName<TItem>}[]`
						: [TValue] extends [never]
							? 'never'
							: 'an object'

/**
 * Checks that a Standard Schema validator accepts the field's value (its
 * input may also accept `null`) and returns a value the field can store;
 * otherwise names the mismatch (ADR-0319).
 */
export type FieldStandardSchemaCompatibility<
	TSchema extends FieldStandardSchema,
	TCanonical,
	TAcceptedInput = TCanonical,
> =
	IsAny<StandardSchemaInput<TSchema>> extends true
		? 'validation must not be typed any'
		: IsAny<StandardSchemaOutput<TSchema>> extends true
			? 'validation must not be typed any'
			: TAcceptedInput extends StandardSchemaInput<TSchema>
				? Exclude<StandardSchemaOutput<TSchema>, null> extends TCanonical
					? true
					: `validation must return ${TypeName<TCanonical>}, got ${TypeName<Exclude<StandardSchemaOutput<TSchema>, null>>}`
				: `validation must accept ${TypeName<TCanonical>}, got ${TypeName<Exclude<StandardSchemaInput<TSchema>, null>>}`

/** Relaxes readonly only for framework-owned array and plain-record containers. */
export type MutableFieldContainer<TValue> =
	TValue extends readonly (infer TItem)[]
		? MutableFieldContainer<TItem>[]
		: TValue extends Readonly<Record<string, unknown>>
			? {
					-readonly [TKey in keyof TValue]: MutableFieldContainer<TValue[TKey]>
				}
			: TValue

/** @internal Matches values that may carry the Standard Schema protocol. */
export const isObjectOrFunction = (value: unknown): value is object =>
	(typeof value === 'object' && value !== null) || typeof value === 'function'

/** Tells a Standard Schema validator (object or callable) from a plain function. */
export const isStandardSchema = (value: unknown): value is FieldStandardSchema =>
	isObjectOrFunction(value) && Reflect.has(value, '~standard')

/** Validates the protocol shape without invoking, cloning, or freezing the validator. */
export function assertStandardSchema(
	value: unknown,
	label: string,
): asserts value is FieldStandardSchema {
	const protocol: unknown = isObjectOrFunction(value)
		? Reflect.get(value, '~standard')
		: undefined

	if (!isObjectOrFunction(protocol)) {
		throw new TypeError(
			`${label} must be a Standard Schema V1 validator or a function`,
		)
	}
	if (Reflect.get(protocol, 'version') !== 1) {
		throw new TypeError(`${label} must use Standard Schema version 1`)
	}
	if (typeof Reflect.get(protocol, 'vendor') !== 'string') {
		throw new TypeError(`${label}.~standard.vendor must be a string`)
	}
	if (typeof Reflect.get(protocol, 'validate') !== 'function') {
		throw new TypeError(`${label}.~standard.validate must be a function`)
	}
}

/** Accepts a Standard Schema validator or a validation function. */
export const assertValidator = (value: unknown, label: string): void => {
	if (typeof value === 'function' && !Reflect.has(value, '~standard')) return
	assertStandardSchema(value, label)
}
