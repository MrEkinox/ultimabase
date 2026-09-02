import type { StandardSchemaV1 } from '@standard-schema/spec'

/** Accepts Standard Schema implementations represented by objects or callables. */
export interface FieldStandardSchema {
	readonly '~standard': Pick<
		StandardSchemaV1['~standard'],
		'validate' | 'vendor' | 'version'
	>
}

type IsAny<TValue> = 0 extends 1 & TValue ? true : false

type StandardSchemaInput<TSchema extends FieldStandardSchema> =
	StandardSchemaV1.InferInput<TSchema>

type StandardSchemaOutput<TSchema extends FieldStandardSchema> =
	StandardSchemaV1.InferOutput<TSchema>

/** Rejects validators that cannot read and return one exact canonical value. */
export type CompatibleFieldStandardSchema<
	TSchema extends FieldStandardSchema,
	TCanonical,
	TAcceptedInput = TCanonical,
> =
	IsAny<StandardSchemaInput<TSchema>> extends true
		? never
		: IsAny<StandardSchemaOutput<TSchema>> extends true
			? never
			: TAcceptedInput extends StandardSchemaInput<TSchema>
				? StandardSchemaOutput<TSchema> extends TCanonical
					? TSchema
					: never
				: never

/** Relaxes readonly only for framework-owned array and plain-record containers. */
export type MutableFieldContainer<TValue> =
	TValue extends readonly (infer TItem)[]
		? MutableFieldContainer<TItem>[]
		: TValue extends Readonly<Record<string, unknown>>
			? {
					-readonly [TKey in keyof TValue]: MutableFieldContainer<TValue[TKey]>
				}
			: TValue

const isObjectOrFunction = (value: unknown): value is object =>
	(typeof value === 'object' && value !== null) || typeof value === 'function'

/** Validates the protocol shape without invoking, cloning, or freezing the validator. */
export function assertFieldStandardSchema(
	value: unknown,
): asserts value is FieldStandardSchema {
	if (!isObjectOrFunction(value)) {
		throw new TypeError('validation must be a Standard Schema V1 validator')
	}

	const protocol: unknown = Reflect.get(value, '~standard')

	if (!isObjectOrFunction(protocol)) {
		throw new TypeError('validation must be a Standard Schema V1 validator')
	}

	if (Reflect.get(protocol, 'version') !== 1) {
		throw new TypeError('validation must use Standard Schema version 1')
	}

	if (typeof Reflect.get(protocol, 'vendor') !== 'string') {
		throw new TypeError('validation.~standard.vendor must be a string')
	}

	if (typeof Reflect.get(protocol, 'validate') !== 'function') {
		throw new TypeError('validation.~standard.validate must be a function')
	}
}
