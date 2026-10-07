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

/** Finds the target pointer that owns an inverse relation, if there is one. */
const owningPointer = (
	field: TypegenFieldSnapshot,
	target: TypegenSchemaSnapshot,
): TypegenFieldSnapshot | undefined => {
	if (field.value.kind !== 'relation' || field.value.mappedBy === undefined) {
		return undefined
	}

	const { mappedBy } = field.value

	return target.fields.find(
		(candidate) =>
			candidate.name === mappedBy && candidate.value.kind === 'pointer',
	)
}

/** A nested inverse create omits the owning pointer, which the parent sets. */
const targetNestedCreate = (
	field: TypegenFieldSnapshot,
	context: RenderContext,
): string => {
	const target = requireTarget(field, context)
	const targetType = `${context.identifiers.schema(target)}NestedCreateInput`
	const pointer = owningPointer(field, target)

	return pointer === undefined
		? targetType
		: `Omit<${targetType}, ${quote(pointer.name)}>`
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
	const property = `${documentation}\treadonly ${propertyName(field.name)}?`

	if (field.value.kind === 'relation') {
		const target = requireTarget(field, context)
		const targetUpdate = `${context.identifiers.schema(target)}NestedUpdateInput`
		// A required owning pointer cannot be cleared by disconnecting its item.
		const pointer = owningPointer(field, target)
		const canDisconnect = pointer === undefined || pointer.typegen.nullable

		return `${property}: Core.NestedRelationUpdateInput<${targetNestedCreate(field, context)}, ${targetUpdate}, ${String(canDisconnect)}>`
	}

	if (field.typegen.update === 'forbidden') return undefined

	if (field.value.kind === 'pointer') {
		const alias = context.identifiers.schema(requireTarget(field, context))

		return `${property}: Core.NestedPointerUpdateInput<${alias}NestedCreateInput, ${alias}NestedUpdateInput, ${String(field.typegen.nullable)}>`
	}

	return `${property}: ${renderFieldValue(field, 'update', context)}`
}

const renderFields = (
	fields: readonly TypegenFieldSnapshot[],
	render: (
		field: TypegenFieldSnapshot,
		context: RenderContext,
	) => string | undefined,
	context: RenderContext,
): string => {
	const properties = fields.flatMap((field) => render(field, context) ?? [])

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
