export const equalityKinds: ReadonlySet<string> = new Set([
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

export const orderedKinds: ReadonlySet<string> = new Set([
	'bigint',
	'date',
	'dateTime',
	'decimal',
	'float',
	'int',
	'string',
	'time',
])

export const renderEqualityProperties = (value: string): string =>
	`\treadonly eq?: ${value}
\treadonly in?: ReadonlyArray<${value}>
\treadonly ne?: ${value}
\treadonly notIn?: ReadonlyArray<${value}>`

export const renderOrderedProperties = (value: string): string =>
	`\treadonly between?: { readonly lower: ${value}; readonly upper: ${value} }
\treadonly gt?: ${value}
\treadonly gte?: ${value}
\treadonly lt?: ${value}
\treadonly lte?: ${value}
\treadonly notBetween?: { readonly lower: ${value}; readonly upper: ${value} }`

export const nullProperties = `\treadonly isNotNull?: true
\treadonly isNull?: true`

export const renderStructuralProperties = (
	value: string,
	key: string,
): string =>
	`\treadonly containedBy?: ${value}
\treadonly contains?: ${value}
\treadonly hasAllKeys?: ReadonlyArray<${key}>
\treadonly hasAnyKeys?: ReadonlyArray<${key}>
\treadonly hasKey?: ${key}
\treadonly jsonPathExists?: JsonPathExpression
\treadonly jsonPathMatches?: JsonPathExpression`

export const renderNamedFilter = (
	name: string,
	properties: readonly string[],
): string => `export type ${name} = {\n${properties.join('\n')}\n}`
