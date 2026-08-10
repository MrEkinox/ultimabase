import type { TypegenFieldSnapshot } from '../../snapshot.js'
import { typeIdentifier } from '../syntax.js'
import type { RenderContext } from '../types.js'
import { isListField } from '../values.js'
import { nullProperties, renderNamedFilter } from './operators.js'

const arrayItemType = (
	field: TypegenFieldSnapshot,
	context: RenderContext,
): string => {
	switch (field.value.kind) {
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
		case 'object':
			return context.identifiers.object(field).alias
		case 'plugin':
			return context.imports.alias(field.value.reference)
		case 'string':
			return 'string'
		case 'pointer':
		case 'relation':
			throw new TypeError(
				`Relationship field ${field.path.join('.')} cannot be a list`,
			)
	}
}

/** Resolves the concrete public filter name for one one-dimensional field list. */
export const arrayFilterName = (
	field: TypegenFieldSnapshot,
	context: RenderContext,
): string => {
	if (!isListField(field)) {
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

	const name = new Map([
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
	]).get(field.kind)

	if (name === undefined) {
		throw new TypeError(`Field ${field.path.join('.')} has no array filter`)
	}

	return `Array${name}Filter`
}

/** Emits each concrete array filter once while retaining exact element types. */
export const renderArrayFilters = (
	fields: readonly TypegenFieldSnapshot[],
	context: RenderContext,
): readonly string[] => {
	const definitions = new Map<string, string>()

	for (const field of fields) {
		if (!isListField(field)) {
			continue
		}

		const name = arrayFilterName(field, context)
		const item = arrayItemType(field, context)
		const definition = renderNamedFilter(name, [
			`\treadonly eq?: ReadonlyArray<${item}> | null`,
			`\treadonly ne?: ReadonlyArray<${item}> | null`,
			`\treadonly has?: ${item}`,
			`\treadonly hasEvery?: ReadonlyArray<${item}>`,
			`\treadonly hasSome?: ReadonlyArray<${item}>`,
			'\treadonly isEmpty?: true',
			nullProperties,
		])
		const existing = definitions.get(name)

		if (existing !== undefined && existing !== definition) {
			throw new TypeError(
				`Generated array filter ${name} has conflicting values`,
			)
		}

		definitions.set(name, definition)
	}

	return [...definitions.values()]
}
