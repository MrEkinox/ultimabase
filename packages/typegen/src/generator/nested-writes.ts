import type {
	TypegenFieldSnapshot,
	TypegenSchemaSnapshot,
} from '../snapshot.js'

import { propertyName, quote, renderDocumentation } from './syntax.js'
import type { RenderContext } from './types.js'
import { renderFieldValue } from './values.js'

const requireTarget = (
	field: TypegenFieldSnapshot,
	context: RenderContext,
): TypegenSchemaSnapshot => {
	if (field.value.kind !== 'pointer' && field.value.kind !== 'relation') {
		throw new TypeError(`Generated field ${field.name} is not a relationship`)
	}

	const target = context.schemasByName.get(field.value.target)
	if (target === undefined) {
		throw new TypeError(
			`Unknown generated nested-write target ${field.value.target}`,
		)
	}

	return target
}

const targetNestedCreate = (
	field: TypegenFieldSnapshot,
	context: RenderContext,
): string => {
	const target = requireTarget(field, context)
	const targetType = `${context.identifiers.schema(target)}NestedCreateInput`

	if (field.value.kind !== 'relation') {
		return targetType
	}
	const relation = field.value
	const mappedBy = relation.mappedBy
	if (mappedBy === undefined) return targetType

	const mappedField = target.fields.find(
		(candidate) => candidate.name === mappedBy,
	)

	return mappedField?.value.kind === 'pointer'
		? `Omit<${targetType}, ${quote(mappedBy)}>`
		: targetType
}

const relationCanDisconnect = (
	field: TypegenFieldSnapshot,
	context: RenderContext,
): boolean => {
	if (field.value.kind !== 'relation' || field.value.mappedBy === undefined) {
		return true
	}
	const relation = field.value

	const target = requireTarget(field, context)
	const mappedField = target.fields.find(
		(candidate) => candidate.name === relation.mappedBy,
	)

	return mappedField?.value.kind !== 'pointer' || mappedField.typegen.nullable
}

const renderCreateField = (
	field: TypegenFieldSnapshot,
	context: RenderContext,
): string | undefined => {
	const documentation = renderDocumentation(field.description)

	if (field.value.kind === 'relation') {
		return `${documentation}\treadonly ${propertyName(field.name)}?: Core.NestedRelationCreateInput<${targetNestedCreate(field, context)}>`
	}

	if (field.typegen.create === 'forbidden') return undefined
	const optional = field.typegen.create === 'required' ? '' : '?'
	const value =
		field.value.kind === 'pointer'
			? `Core.NestedPointerCreateInput<${targetNestedCreate(field, context)}>`
			: renderFieldValue(field, 'create', context)

	return `${documentation}\treadonly ${propertyName(field.name)}${optional}: ${value}`
}

const renderUpdateField = (
	field: TypegenFieldSnapshot,
	context: RenderContext,
): string | undefined => {
	const documentation = renderDocumentation(field.description)

	if (field.value.kind === 'relation') {
		const target = requireTarget(field, context)
		const targetUpdate = `${context.identifiers.schema(target)}NestedUpdateInput`
		return `${documentation}\treadonly ${propertyName(field.name)}?: Core.NestedRelationUpdateInput<${targetNestedCreate(field, context)}, ${targetUpdate}, ${String(relationCanDisconnect(field, context))}>`
	}

	if (field.typegen.update === 'forbidden') return undefined
	const value =
		field.value.kind === 'pointer'
			? (() => {
					const target = requireTarget(field, context)
					const alias = context.identifiers.schema(target)
					return `Core.NestedPointerUpdateInput<${alias}NestedCreateInput, ${alias}NestedUpdateInput, ${String(field.typegen.nullable)}>`
				})()
			: renderFieldValue(field, 'update', context)

	return `${documentation}\treadonly ${propertyName(field.name)}?: ${value}`
}

const renderFields = (
	fields: readonly TypegenFieldSnapshot[],
	render: (
		field: TypegenFieldSnapshot,
		context: RenderContext,
	) => string | undefined,
	context: RenderContext,
): string => {
	const properties = fields.flatMap((field) => {
		const property = render(field, context)
		return property === undefined ? [] : [property]
	})

	return properties.length === 0
		? 'Record<never, never>'
		: `{\n${properties.join('\n')}\n}`
}

/** Renders graph-aware singular input aliases without changing flat draft inputs. */
export const renderNestedWriteInputs = (
	schema: TypegenSchemaSnapshot,
	context: RenderContext,
): readonly string[] => {
	const alias = context.identifiers.schema(schema)

	return [
		`export type ${alias}NestedCreateInput = ${renderFields(schema.fields, renderCreateField, context)}`,
		`export type ${alias}NestedUpdateData = ${renderFields(schema.fields, renderUpdateField, context)}`,
		`export type ${alias}NestedUpdateInput = Core.NestedUpdateExpressionInput<Core.SchemaReference<${quote(schema.className)}>>`,
	]
}
