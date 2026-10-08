import type {
	TypegenFieldSnapshot,
	TypegenSchemaSnapshot,
} from '../../snapshot.js'
import { propertyName, quote, typeIdentifier } from '../syntax.js'
import type { RenderContext } from '../types.js'
import { renderFieldValue } from '../values.js'
import { scalarFilterNames } from './operators.js'

/** Built-in kinds whose root filter takes precedence over plugin capabilities. */
const rootFirstKinds = new Set([
	'boolean',
	'date',
	'dateTime',
	'string',
	'time',
	'uuid',
])

/** Resolves the concrete public filter name for one one-dimensional field list. */
export const arrayFilterName = (
	field: TypegenFieldSnapshot,
	context: RenderContext,
): string => {
	if (!field.typegen.list) {
		throw new TypeError(`Field ${field.path.join('.')} is not a list`)
	}

	if (field.value.kind === 'enum') {
		return `Array${context.identifiers.enum(field).alias}Filter`
	}

	if (field.value.kind === 'object') {
		return `Array${context.identifiers.object(field).alias}Filter`
	}

	if (field.value.kind === 'plugin') {
		return `Array${typeIdentifier(context.imports.alias(field.value.reference))}Filter`
	}

	const name = scalarFilterNames.get(field.kind)

	if (name === undefined) {
		throw new TypeError(`Field ${field.path.join('.')} has no array filter`)
	}

	return `Array${name}Filter`
}

/**
 * Resolves the filters selected by a value kind or plugin capability, which
 * only differ between the root and embedded paths for JSON and objects.
 */
const valueFilter = (
	field: TypegenFieldSnapshot,
	context: RenderContext,
	jsonFilter: string,
	objectSuffix: string,
): string | undefined => {
	switch (field.value.kind) {
		case 'enum':
			return `${context.identifiers.enum(field).alias}Filter`
		case 'json':
			return jsonFilter
		case 'object':
			return `${context.identifiers.object(field).alias}${objectSuffix}`
	}

	if (field.structuralContains !== undefined) {
		return `PortableContainmentFilter<${renderFieldValue(field, 'object', context)}, ${context.imports.alias(field.structuralContains)}>`
	}

	if (field.portableEquality) {
		return `PortableEqualityFilter<${renderFieldValue(field, 'object', context)}>`
	}

	return undefined
}

const relationshipTarget = (
	target: string,
	label: string,
	context: RenderContext,
): string => {
	const schema = context.schemasByName.get(target)

	if (schema === undefined) {
		throw new TypeError(`Unknown generated ${label} target ${target}`)
	}

	return `${context.identifiers.schema(schema)}WhereInput`
}

const renderRootWhere = (
	field: TypegenFieldSnapshot,
	context: RenderContext,
): string => {
	if (field.value.kind === 'relation') {
		return `RelationFilter<${relationshipTarget(field.value.target, 'relation', context)}>`
	}

	if (field.value.kind === 'pointer') {
		return `PointerFilter<${relationshipTarget(field.value.target, 'pointer', context)}>`
	}

	if (field.typegen.list) {
		return arrayFilterName(field, context)
	}

	const scalar = scalarFilterNames.get(field.kind)

	if (scalar !== undefined && rootFirstKinds.has(field.kind)) {
		return `${scalar}Filter`
	}

	// A `json` kind always has a `json` value, so `scalar` only names numeric
	// and binary filters below.
	return (
		valueFilter(field, context, 'JsonFilter', 'Filter') ??
		(scalar === undefined ? 'NullFilter' : `${scalar}Filter`)
	)
}

/** Resolves the filter applied to one embedded-object path. */
const renderPathOperators = (
	field: TypegenFieldSnapshot,
	context: RenderContext,
): string => {
	if (field.typegen.list) {
		return arrayFilterName(field, context)
	}

	if (field.kind === 'string') {
		return 'StringPathFilter'
	}

	const scalar = scalarFilterNames.get(field.kind)

	return (
		valueFilter(field, context, 'JsonPathValueFilter', 'PathValueFilter') ??
		(scalar === undefined ? 'NullFilter' : `${scalar}PathFilter`)
	)
}

const pathTuple = (path: readonly string[]): string =>
	`readonly [${path.map(quote).join(', ')}]`

/** Lists the path filters of an embedded object, recursing into child objects. */
export const collectObjectPathTypes = (
	fields: readonly TypegenFieldSnapshot[],
	parentPath: readonly string[],
	context: RenderContext,
): readonly string[] =>
	fields.flatMap((field) => {
		const path = [...parentPath, field.name]
		const own = `Readonly<{ readonly path: ${pathTuple(path)} } & ${renderPathOperators(field, context)}>`

		if (field.typegen.list) {
			return [own]
		}

		if (field.value.kind === 'object') {
			return [own, ...collectObjectPathTypes(field.value.fields, path, context)]
		}

		if (field.value.kind === 'json') {
			return [
				own,
				`JsonPathFilter<readonly [${path.map(quote).join(', ')}, string, ...string[]]>`,
			]
		}

		return [own]
	})

export const renderWhere = (
	schema: TypegenSchemaSnapshot,
	alias: string,
	context: RenderContext,
): string => {
	const properties = schema.fields.map(
		(field) =>
			`\treadonly ${propertyName(field.name)}?: ${renderRootWhere(field, context)}`,
	)

	return `export type ${alias}WhereInput = {\n\treadonly AND?: ReadonlyArray<${alias}WhereInput>\n\treadonly OR?: ReadonlyArray<${alias}WhereInput>\n\treadonly NOT?: ${alias}WhereInput\n${properties.join('\n')}\n}`
}
