import type {
	TypegenFieldSnapshot,
	TypegenSchemaSnapshot,
} from '../snapshot.js'
import { collectObjectPathTypes, renderWhere } from './filters/field-filters.js'
import {
	nullProperties,
	renderEqualityProperties,
	renderNamedFilter,
	renderStructuralProperties,
} from './filters/operators.js'
import { renderNestedWriteInputs } from './nested-writes.js'
import {
	propertyName,
	quote,
	renderDocumentation,
	renderUnion,
} from './syntax.js'
import type { NamedDescriptor, RenderContext } from './types.js'
import { renderProperties } from './values.js'

const renderObject = (
	descriptor: NamedDescriptor,
	context: RenderContext,
): string => {
	if (descriptor.field.value.kind !== 'object') {
		throw new TypeError(
			`Generated object ${descriptor.ownerPath} is not an object`,
		)
	}

	const { alias } = descriptor
	const fields = descriptor.field.value.fields
	const output = `export type ${alias} = ${renderProperties(fields, 'object', context)}`

	if (descriptor.field.outputOnly === true) {
		return output
	}

	const structural = renderStructuralProperties(
		`${alias}UpdateInput | null`,
		`Extract<keyof ${alias}, string>`,
	)

	return [
		output,
		`export type ${alias}CreateInput = ${renderProperties(fields, 'create', context)}`,
		`export type ${alias}UpdateInput = ${renderProperties(fields, 'update', context)}`,
		`export type ${alias}PathFilter = ${renderUnion(collectObjectPathTypes(fields, [], context))}`,
		renderNamedFilter(`${alias}PathValueFilter`, [nullProperties, structural]),
		renderNamedFilter(`${alias}Filter`, [
			nullProperties,
			structural,
			`\treadonly at?: ReadonlyArray<${alias}PathFilter>`,
		]),
	].join('\n\n')
}

const renderEnum = (descriptor: NamedDescriptor): string => {
	if (descriptor.field.value.kind !== 'enum') {
		throw new TypeError(`Generated enum ${descriptor.ownerPath} is not an enum`)
	}

	const { alias } = descriptor
	const values = `export type ${alias} = ${renderUnion(
		descriptor.field.value.values.map(quote),
	)}`

	return descriptor.field.outputOnly === true
		? values
		: `${values}\n\n${renderNamedFilter(`${alias}Filter`, [
				renderEqualityProperties(`${alias} | null`),
				nullProperties,
			])}`
}

export const hasRelationships = (schema: TypegenSchemaSnapshot): boolean =>
	schema.fields.some(
		({ value }) => value.kind === 'pointer' || value.kind === 'relation',
	)

const includeType = (
	schema: TypegenSchemaSnapshot,
	context: RenderContext,
): string =>
	hasRelationships(schema)
		? `${context.identifiers.schema(schema)}Include`
		: 'never'

const renderInclude = (
	schema: TypegenSchemaSnapshot,
	context: RenderContext,
): string => {
	const properties = schema.fields.flatMap((field) => {
		if (field.value.kind !== 'pointer' && field.value.kind !== 'relation') {
			return []
		}

		const target = context.schemasByName.get(field.value.target)

		if (target === undefined) {
			throw new TypeError(
				`Unknown generated include target ${field.value.target}`,
			)
		}

		const targetAlias = context.identifiers.schema(target)
		const include =
			field.value.kind === 'pointer'
				? `{ readonly include?: ${includeType(target, context)}; readonly select?: ${targetAlias}Select }`
				: `{ readonly include?: ${includeType(target, context)}; readonly limit?: number; readonly offset?: number; readonly orderBy?: ${targetAlias}OrderByInput; readonly select?: ${targetAlias}Select; readonly where?: ${targetAlias}WhereInput }`

		return [`\treadonly ${propertyName(field.name)}?: ${include}`]
	})

	return properties.length === 0 ? 'never' : `{\n${properties.join('\n')}\n}`
}

/** Renders a selection map; `id` can only be selected, never deselected. */
const renderSelection = (fields: readonly TypegenFieldSnapshot[]): string =>
	`{\n${fields
		.map(
			(field) =>
				`${renderDocumentation(field.description)}\treadonly ${propertyName(field.name)}?: ${field.name === 'id' ? 'true' : 'boolean'}`,
		)
		.join('\n')}\n}`

const renderOrderBy = (schema: TypegenSchemaSnapshot): string => {
	const properties = schema.fields.map(
		(field) => `\treadonly ${propertyName(field.name)}?: OrderDirection | null`,
	)

	return `{\n${properties.join('\n')}\n}`
}

export const renderSchemaPublic = (
	schema: TypegenSchemaSnapshot,
	context: RenderContext,
): string => {
	const alias = context.identifiers.schema(schema)
	const outputFields = [...schema.fields, ...schema.virtualFields]
	const sections = [
		...context.identifiers.enumDefinitionsFor(schema).map(renderEnum),
		...context.identifiers
			.objectDefinitionsFor(schema)
			.map((descriptor) => renderObject(descriptor, context)),
		`export type ${alias}Item = ${renderProperties(schema.fields, 'object', context)}`,
		`export type ${alias}Output = ${renderProperties(outputFields, 'object', context)}`,
		`export type ${alias}CreateInput = ${renderProperties(schema.fields, 'create', context)}`,
		`export type ${alias}UpdateInput = ${renderProperties(schema.fields, 'update', context)}`,
		...renderNestedWriteInputs(schema, context),
		renderWhere(schema, alias, context),
		`export type ${alias}Select = ${renderSelection(
			outputFields.filter((field) => field.typegen.object !== 'forbidden'),
		)}`,
		`export type ${alias}DependencySelect = ${renderSelection(
			schema.fields.filter((field) => field.value.kind !== 'relation'),
		)}`,
		`export type ${alias}OrderByInput = ${renderOrderBy(schema)}`,
	]

	if (hasRelationships(schema)) {
		sections.push(
			`export type ${alias}Include = ${renderInclude(schema, context)}`,
		)
	}

	return sections.join('\n\n')
}
