/** Mirrors the built-in field kinds accepted by Core equality normalization. */
export const graphqlEqualityFieldKinds: ReadonlySet<string> = new Set([
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
])

/** Mirrors the built-in field kinds accepted by Core ordering comparisons. */
export const graphqlOrderedFieldKinds: ReadonlySet<string> = new Set([
	'bigint',
	'date',
	'dateTime',
	'decimal',
	'float',
	'int',
	'string',
	'time',
])
