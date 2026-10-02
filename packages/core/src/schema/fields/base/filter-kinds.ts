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
