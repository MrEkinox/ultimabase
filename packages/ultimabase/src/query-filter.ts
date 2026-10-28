// A scalar's and a list's filter operators (D-20, D-140, D-149): a decimal
// (D-145) is a string compared by value, without `contains`.
import type { JsonValue } from './fields.ts'

export type ScalarFilter<V, Decimal = false> = {
	readonly equals?: V | null | undefined
	readonly not?: V | null | undefined
	readonly in?: readonly V[] | undefined
	readonly notIn?: readonly V[] | undefined
} & ([V, Decimal] extends [number | Date, unknown] | [unknown, true]
	? {
			readonly lt?: V | undefined
			readonly lte?: V | undefined
			readonly gt?: V | undefined
			readonly gte?: V | undefined
		}
	: [V] extends [string]
		? {
				readonly contains?: string | undefined
				readonly startsWith?: string | undefined
				readonly endsWith?: string | undefined
			} & (string extends V
				? { readonly mode?: 'insensitive' | undefined }
				: unknown)
		: unknown)

/** A list has no shorthand; `NOT` gives the opposite (D-120, D-127, D-149). */
export type ListFilter<E> = {
	readonly has?: E | undefined
	readonly hasSome?: readonly E[] | undefined
	readonly hasEvery?: readonly E[] | undefined
	readonly isEmpty?: boolean | undefined
}

/**
 * A json field's filter at a path into its value (D-149): the operands are
 * any JSON, whatever the field's schema, and the path is not checked.
 */
export type JsonPathFilter = {
	readonly path: readonly string[]
	readonly equals?: JsonValue | undefined
	readonly not?: JsonValue | undefined
	readonly lt?: number | string | undefined
	readonly lte?: number | string | undefined
	readonly gt?: number | string | undefined
	readonly gte?: number | string | undefined
	readonly stringContains?: string | undefined
	readonly stringStartsWith?: string | undefined
	readonly stringEndsWith?: string | undefined
	readonly mode?: 'insensitive' | undefined
	readonly arrayContains?: JsonValue | undefined
	readonly arrayStartsWith?: JsonValue | undefined
	readonly arrayEndsWith?: JsonValue | undefined
}
