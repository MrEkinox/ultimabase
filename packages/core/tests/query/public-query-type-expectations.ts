import { expect } from 'vitest'

interface PublicQueryTypeHoverCase {
	readonly marker: string
	readonly typeName: string
}

export const publicQueryTypeHoverCases: readonly PublicQueryTypeHoverCase[] = [
	{
		marker: 'query-included-field',
		typeName: 'QueryIncludedFieldFromInput',
	},
	{
		marker: 'operation-included-field',
		typeName: 'OperationIncludedField',
	},
	{
		marker: 'schema-where-input',
		typeName: 'SchemaWhereInput',
	},
]

/** Applies the canonical Query type hover contract to source and packed exports. */
export const expectCanonicalQueryTypeHovers = (
	readHover: (marker: string) => string,
): void => {
	for (const { marker, typeName } of publicQueryTypeHoverCases) {
		expect(readHover(marker)).toContain(typeName)
	}
}
