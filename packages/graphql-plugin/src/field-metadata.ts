import type {
	GenericField,
	GenericVirtualField,
	SchemaContributionOwner,
	SchemaDefinition,
	SchemaFields,
} from '@ultimabase/core'

const builtInFieldKinds: ReadonlySet<string> = new Set([
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
	'object',
	'pointer',
	'relation',
	'string',
	'time',
	'uuid',
])

export const isGraphqlBuiltInFieldKind = (kind: string): boolean =>
	builtInFieldKinds.has(kind)

export const readGraphqlEnumValues = (
	field: GenericField,
): readonly string[] => {
	const values = 'values' in field.options ? field.options.values : undefined
	if (Array.isArray(values)) {
		return values.filter((value): value is string => typeof value === 'string')
	}
	if (typeof values === 'object' && values !== null) {
		return Object.values(values).filter(
			(value): value is string => typeof value === 'string',
		)
	}
	return []
}

export const readGraphqlObjectFields = (field: GenericField): SchemaFields => {
	const fields = 'fields' in field.options ? field.options.fields : undefined
	if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
		throw new TypeError('Compiled object field must retain child fields')
	}
	return fields as SchemaFields
}

export const readGraphqlFieldDescription = (
	field: GenericField | GenericVirtualField,
): string | undefined =>
	'description' in field.options &&
	typeof field.options.description === 'string'
		? field.options.description
		: undefined

export const readGraphqlFieldOwner = (
	schema: SchemaDefinition,
	path: readonly string[],
): SchemaContributionOwner =>
	schema.definition.provenance.fields[path[0] ?? '']?.owner ??
	schema.definition.provenance.schema.owner
