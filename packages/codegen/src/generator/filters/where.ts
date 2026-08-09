import type {
	TypegenFieldSnapshot,
	TypegenSchemaSnapshot,
} from '../../snapshot.js'
import { propertyName } from '../syntax.js'
import type { RenderContext } from '../types.js'
import { isListField } from '../values.js'
import { arrayFilterName } from './arrays.js'

const renderRootWhere = (
	field: TypegenFieldSnapshot,
	context: RenderContext,
): string => {
	if (field.value.kind === 'relation') {
		const target = context.schemasByName.get(field.value.target)

		if (target === undefined) {
			throw new TypeError(
				`Unknown generated relation target ${field.value.target}`,
			)
		}

		return `RelationFilter<${context.identifiers.schema(target)}WhereInput>`
	}

	if (field.value.kind === 'pointer') {
		const target = context.schemasByName.get(field.value.target)

		if (target === undefined) {
			throw new TypeError(
				`Unknown generated pointer target ${field.value.target}`,
			)
		}

		return `PointerFilter<${context.identifiers.schema(target)}WhereInput>`
	}

	if (isListField(field)) {
		return arrayFilterName(field, context)
	}

	if (field.kind === 'string') {
		return 'StringFilter'
	}

	if (field.kind === 'boolean') {
		return 'BooleanFilter'
	}

	if (field.kind === 'uuid') {
		return 'IDFilter'
	}

	if (
		field.kind === 'date' ||
		field.kind === 'dateTime' ||
		field.kind === 'time'
	) {
		return 'DateTimeFilter'
	}

	if (field.value.kind === 'enum') {
		return `${context.identifiers.enum(field).alias}Filter`
	}

	if (field.value.kind === 'json') {
		return 'JsonFilter'
	}

	if (field.value.kind === 'object') {
		const descriptor = context.identifiers.object(field)

		return `${descriptor.alias}Filter`
	}

	return (
		new Map([
			['bigint', 'BigIntFilter'],
			['binary', 'BinaryFilter'],
			['decimal', 'DecimalFilter'],
			['float', 'FloatFilter'],
			['int', 'IntFilter'],
		]).get(field.kind) ?? 'NullFilter'
	)
}

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
