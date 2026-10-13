/** Canonical built-in scalar kinds supporting equality and membership. */
export const equalityFieldKinds = [
	'bigint',
	'binary',
	'boolean',
	'date',
	'dateTime',
	'decimal',
	'enum',
	'float',
	'int',
	'json',
	'pointer',
	'string',
	'time',
	'uuid',
] as const

/** Canonical built-in scalar kinds supporting root ordering and ranges. */
export const orderedFieldKinds = [
	'bigint',
	'date',
	'dateTime',
	'decimal',
	'float',
	'int',
	'string',
	'time',
] as const

export type EqualityFieldKind = (typeof equalityFieldKinds)[number]
export type OrderedFieldKind = (typeof orderedFieldKinds)[number]

/**
 * Built-in kinds Core orders and compares in a keyset predicate (ADR-0309),
 * when not lists: the keys `orderBy` accepts (ADR-0332). Pointers, relations,
 * JSON, objects and plugin fields have no total order shared by every adapter.
 */
export const orderableFieldKinds = [
	'bigint',
	'binary',
	'boolean',
	'date',
	'dateTime',
	'decimal',
	'enum',
	'float',
	'int',
	'string',
	'time',
	'uuid',
] as const

export type OrderableFieldKind = (typeof orderableFieldKinds)[number]
