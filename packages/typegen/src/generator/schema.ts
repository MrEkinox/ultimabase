import type { TypegenSchemaSnapshot } from '../snapshot.js'
import {
	nullProperties,
	renderEqualityProperties,
	renderNamedFilter,
	renderStructuralProperties,
} from './filters/operators.js'
import { collectObjectPathTypes } from './filters/structural.js'
import { renderWhere } from './filters/where.js'
import {
	propertyName,
	quote,
	renderDocumentation,
	renderUnion,
} from './syntax.js'
import type {
	EnumDescriptor,
	ObjectDescriptor,
	RenderContext,
} from './types.js'
import { renderNestedWriteInputs } from './nested-writes.js'
import { renderProperties } from './values.js'

const renderObject = (
	descriptor: ObjectDescriptor,
	context: RenderContext,
): string => {
	if (descriptor.field.value.kind !== 'object') {
		throw new TypeError(
			`Generated object ${descriptor.ownerPath} is not an object`,
		)
	}
	if (descriptor.field.outputOnly === true) {
		return `export type ${descriptor.alias} = ${renderProperties(descriptor.field.value.fields, 'object', context)}`
	}

	const paths = collectObjectPathTypes(
		descriptor.field.value.fields,
		[],
		context,
	)

	return [
		`export type ${descriptor.alias} = ${renderProperties(descriptor.field.value.fields, 'object', context)}`,
		`export type ${descriptor.alias}CreateInput = ${renderProperties(descriptor.field.value.fields, 'create', context)}`,
		`export type ${descriptor.alias}UpdateInput = ${renderProperties(descriptor.field.value.fields, 'update', context)}`,
		`export type ${descriptor.alias}PathFilter = ${renderUnion(paths)}`,
		renderNamedFilter(`${descriptor.alias}PathValueFilter`, [
			nullProperties,
			renderStructuralProperties(
				`${descriptor.alias}UpdateInput | null`,
				`Extract<keyof ${descriptor.alias}, string>`,
			),
		]),
		renderNamedFilter(`${descriptor.alias}Filter`, [
			nullProperties,
			renderStructuralProperties(
				`${descriptor.alias}UpdateInput | null`,
				`Extract<keyof ${descriptor.alias}, string>`,
			),
			`\treadonly at?: ReadonlyArray<${descriptor.alias}PathFilter>`,
		]),
	].join('\n\n')
}

const renderEnum = (descriptor: EnumDescriptor): string => {
	if (descriptor.field.value.kind !== 'enum') {
		throw new TypeError(`Generated enum ${descriptor.ownerPath} is not an enum`)
	}
	if (descriptor.field.outputOnly === true) {
		return `export type ${descriptor.alias} = ${renderUnion(
			descriptor.field.value.values.map(quote),
		)}`
	}

	return `export type ${descriptor.alias} = ${renderUnion(
		descriptor.field.value.values.map(quote),
	)}\n\n${renderNamedFilter(`${descriptor.alias}Filter`, [
		renderEqualityProperties(`${descriptor.alias} | null`),
		nullProperties,
	])}`
}

export const hasRelationships = (schema: TypegenSchemaSnapshot): boolean =>
	schema.fields.some(
		({ value }) => value.kind === 'pointer' || value.kind === 'relation',
	)

export const includeType = (
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

const renderSelect = (schema: TypegenSchemaSnapshot): string => {
	const properties = [...schema.fields, ...schema.virtualFields].flatMap(
		(field) =>
			field.typegen.object === 'forbidden'
				? []
				: [
						`${renderDocumentation(field.description)}\treadonly ${propertyName(field.name)}?: ${field.name === 'id' ? 'true' : 'boolean'}`,
					],
	)

	return `{\n${properties.join('\n')}\n}`
}

const renderDependencySelect = (schema: TypegenSchemaSnapshot): string => {
	const properties = schema.fields.flatMap((field) =>
		field.value.kind === 'relation'
			? []
			: [
					`${renderDocumentation(field.description)}\treadonly ${propertyName(field.name)}?: ${field.name === 'id' ? 'true' : 'boolean'}`,
				],
	)

	return `{\n${properties.join('\n')}\n}`
}

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
	const sections = [
		...context.identifiers
			.enumDefinitionsFor(schema)
			.map((descriptor) => renderEnum(descriptor)),
		...context.identifiers
			.objectDefinitionsFor(schema)
			.map((descriptor) => renderObject(descriptor, context)),
	]

	sections.push(
		`export type ${alias}Item = ${renderProperties(schema.fields, 'object', context)}`,
		`export type ${alias}Output = ${renderProperties([...schema.fields, ...schema.virtualFields], 'object', context)}`,
		`export type ${alias}CreateInput = ${renderProperties(schema.fields, 'create', context)}`,
		`export type ${alias}UpdateInput = ${renderProperties(schema.fields, 'update', context)}`,
		...renderNestedWriteInputs(schema, context),
		renderWhere(schema, alias, context),
		`export type ${alias}Select = ${renderSelect(schema)}`,
		`export type ${alias}DependencySelect = ${renderDependencySelect(schema)}`,
		`export type ${alias}OrderByInput = ${renderOrderBy(schema)}`,
	)

	if (hasRelationships(schema)) {
		sections.push(
			`export type ${alias}Include = ${renderInclude(schema, context)}`,
		)
	}

	return sections.join('\n\n')
}
