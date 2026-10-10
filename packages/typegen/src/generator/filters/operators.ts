/** Renders the operator members shared by generated filter declarations. */

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
	`\treadonly contains?: ${value}
\treadonly hasAllKeys?: ReadonlyArray<${key}>
\treadonly hasAnyKeys?: ReadonlyArray<${key}>
\treadonly hasKey?: ${key}`

export const renderNamedFilter = (
	name: string,
	properties: readonly string[],
): string => `export type ${name} = {\n${properties.join('\n')}\n}`

/**
 * Names the filter family of each built-in scalar kind: `<Name>Filter` at the
 * root, `<Name>PathFilter` inside embedded objects and `Array<Name>Filter` for
 * lists. `json` only names its array filter; its other filters follow the
 * value kind.
 */
export const scalarFilterNames: ReadonlyMap<string, string> = new Map([
	['bigint', 'BigInt'],
	['binary', 'Binary'],
	['boolean', 'Boolean'],
	['date', 'DateTime'],
	['dateTime', 'DateTime'],
	['decimal', 'Decimal'],
	['float', 'Float'],
	['int', 'Int'],
	['json', 'Json'],
	['string', 'String'],
	['time', 'DateTime'],
	['uuid', 'ID'],
])
