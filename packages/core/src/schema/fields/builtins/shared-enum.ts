import {
	assertNonEmptyString,
	immutableArray,
	isUnknownArray,
} from '@ultimabase/shared'

// A class instance, not a plain record, so option snapshots keep its identity.
class SharedEnumValue {
	constructor(
		readonly name: string,
		readonly values: readonly [string, ...string[]],
	) {
		Object.freeze(this)
	}
}

// Only `defineEnum` creates shared enums: a look-alike record is refused at
// runtime, so the type is nominal too.
declare const sharedEnumBrand: unique symbol

const enumNamePattern = /^[A-Z_a-z][0-9A-Z_a-z]*$/u

/**
 * One named closed string domain shared by several enum fields, so that
 * generators emit one named type for all of them (ADR-0310).
 */
export interface SharedEnum<
	TName extends string = string,
	TValues extends readonly [string, ...string[]] = readonly [
		string,
		...string[],
	],
> {
	/** The shared type name, for example `TodoPriority`. */
	readonly name: TName
	/** The declared values, in order. */
	readonly values: TValues
	readonly [sharedEnumBrand]: true
}

/** Validates one non-empty, duplicate-free list of enum string values. */
export const snapshotEnumValueList = (
	values: unknown,
	path: string,
): readonly [string, ...string[]] => {
	if (!isUnknownArray(values) || values.length === 0) {
		throw new TypeError(`${path} must be a non-empty string array`)
	}
	const declared = values
	if (!declared.every((value) => typeof value === 'string')) {
		throw new TypeError(`${path} must contain only strings`)
	}
	const duplicate = declared.find(
		(value, index) => declared.indexOf(value) !== index,
	)
	if (duplicate !== undefined) {
		throw new TypeError(`Duplicate enum value: ${duplicate}`)
	}
	// Every entry was proven to be a string and the list to be non-empty.
	return immutableArray(declared) as readonly [string, ...string[]]
}

/**
 * Declares one shared enum, used only to share one named type between enum
 * fields: `field.enum({ values: TodoPriority })` (ADR-0310). Two different
 * shared enums with the same name fail when the application is constructed.
 *
 * @example `export const TodoPriority = defineEnum('TodoPriority', ['low', 'medium', 'high'])`
 */
export const defineEnum = <
	const TName extends string,
	const TValues extends readonly [string, ...string[]],
>(
	name: TName,
	values: TValues,
): SharedEnum<TName, TValues> => {
	assertNonEmptyString(name, 'defineEnum name')
	if (!enumNamePattern.test(name)) {
		throw new TypeError(`defineEnum name must be an identifier: ${name}`)
	}
	// The values were copied from `values` and keep their literal order.
	return new SharedEnumValue(
		name,
		snapshotEnumValueList(values, 'defineEnum values'),
	) as SharedEnum<TName, TValues>
}

/** Tells whether a value was created by `defineEnum`. */
export const isSharedEnum = (value: unknown): value is SharedEnum =>
	value instanceof SharedEnumValue
