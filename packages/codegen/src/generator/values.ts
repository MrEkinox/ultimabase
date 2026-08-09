import type { TypegenFieldSnapshot } from '../snapshot.js'
import { propertyName, quote, renderDocumentation } from './syntax.js'
import type { RenderContext } from './types.js'

export type FieldValueMode = 'create' | 'object' | 'update'

const renderScalarValue = (
	field: TypegenFieldSnapshot,
	mode: FieldValueMode,
	context: RenderContext,
): string => {
	const value = field.value

	switch (value.kind) {
		case 'bigint':
			return 'bigint'
		case 'boolean':
			return 'boolean'
		case 'bytes':
			return 'Uint8Array'
		case 'enum':
			return context.identifiers.enum(field).alias
		case 'json':
			return 'JsonDocument'
		case 'number':
			return 'number'
		case 'plugin':
			return context.imports.alias(value.reference)
		case 'pointer':
			return mode === 'object'
				? `Core.GeneratedPointerHandle<${quote(value.target)}>`
				: 'Core.PointerValue'
		case 'relation':
			return 'never'
		case 'string':
			return 'string'
		case 'object': {
			const descriptor = context.identifiers.object(field)
			const objectMode =
				mode === 'update' && field.inference.list ? 'create' : mode
			const suffix =
				objectMode === 'object'
					? ''
					: objectMode === 'create'
						? 'CreateInput'
						: 'UpdateInput'

			return `${descriptor.alias}${suffix}`
		}
	}
}

export const isListField = (field: TypegenFieldSnapshot): boolean =>
	field.inference.list

export const renderFieldValue = (
	field: TypegenFieldSnapshot,
	mode: FieldValueMode,
	context: RenderContext,
): string => {
	const scalar = renderScalarValue(field, mode, context)
	const rendered = isListField(field) ? `ReadonlyArray<${scalar}>` : scalar

	return field.inference.nullable ? `${rendered} | null` : rendered
}

export const renderProperties = (
	fields: readonly TypegenFieldSnapshot[],
	mode: FieldValueMode,
	context: RenderContext,
): string => {
	const properties = fields.flatMap((field) => {
		const presence = field.inference[mode]

		if (presence === 'forbidden') {
			return []
		}

		const optional = mode === 'object' || presence === 'required' ? '' : '?'

		return [
			`${renderDocumentation(field.description)}\treadonly ${propertyName(field.name)}${optional}: ${renderFieldValue(field, mode, context)}`,
		]
	})

	return properties.length === 0
		? 'Record<never, never>'
		: `{\n${properties.join('\n')}\n}`
}
