import type { TypegenFieldSnapshot } from '../../snapshot.js'
import { quote } from '../syntax.js'
import type { RenderContext } from '../types.js'
import { isListField } from '../values.js'
import {
	nullProperties,
	renderEqualityProperties,
	renderNamedFilter,
	renderStructuralProperties,
} from './operators.js'
import { arrayFilterName } from './arrays.js'

export const renderPathOperators = (
	field: TypegenFieldSnapshot,
	context: RenderContext,
): string => {
	if (isListField(field)) {
		return arrayFilterName(field, context)
	}

	if (field.kind === 'string') {
		return 'StringPathFilter'
	}

	if (field.value.kind === 'json') {
		return 'JsonPathValueFilter'
	}

	if (field.value.kind === 'object') {
		const item = context.identifiers.object(field).alias

		return `${item}PathValueFilter`
	}

	if (field.value.kind === 'enum') {
		return `${context.identifiers.enum(field).alias}Filter`
	}

	const pathFilter = new Map([
		['bigint', 'BigIntPathFilter'],
		['binary', 'BinaryPathFilter'],
		['boolean', 'BooleanPathFilter'],
		['date', 'DateTimePathFilter'],
		['dateTime', 'DateTimePathFilter'],
		['decimal', 'DecimalPathFilter'],
		['float', 'FloatPathFilter'],
		['int', 'IntPathFilter'],
		['time', 'DateTimePathFilter'],
		['uuid', 'IDPathFilter'],
	]).get(field.kind)

	return pathFilter ?? 'NullFilter'
}

const pathTuple = (path: readonly string[]): string =>
	`readonly [${path.map(quote).join(', ')}]`

export const collectObjectPathTypes = (
	fields: readonly TypegenFieldSnapshot[],
	parentPath: readonly string[],
	context: RenderContext,
): readonly string[] =>
	fields.flatMap((field) => {
		const path = [...parentPath, field.name]
		const own = `Readonly<{ readonly path: ${pathTuple(path)} } & ${renderPathOperators(field, context)}>`

		if (isListField(field)) {
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

/** Renders JSON and embedded-object support shared by structural filters. */
export const renderStructuralFilters = (
	rootFields: readonly TypegenFieldSnapshot[],
	nestedFields: readonly TypegenFieldSnapshot[],
	allFields: readonly TypegenFieldSnapshot[],
): readonly string[] => {
	const definitions: string[] = []
	const hasJsonField = allFields.some(({ value }) => value.kind === 'json')
	const hasObjectField = allFields.some(({ value }) => value.kind === 'object')

	if (hasJsonField || hasObjectField) {
		definitions.push(
			`export type JsonValue = boolean | number | string | null | JsonObject | ReadonlyArray<JsonValue>`,
			`export type JsonObject = { readonly [key: string]: JsonValue }`,
			renderNamedFilter('JsonPathExpression', [
				'\treadonly source: string',
				'\treadonly variables?: JsonObject',
			]),
		)
	}

	if (hasJsonField) {
		definitions.push(
			`export type JsonDocument = JsonObject`,
			renderNamedFilter(
				'JsonPathFilter<TPath extends readonly [string, ...string[]] = readonly [string, ...string[]]>',
				[
					'\treadonly path: TPath',
					renderEqualityProperties('JsonValue'),
					renderStructuralProperties('JsonValue', 'string'),
					nullProperties,
				],
			),
		)
	}

	if (rootFields.some(({ value }) => value.kind === 'json')) {
		definitions.push(
			renderNamedFilter('JsonFilter', [
				renderEqualityProperties('JsonDocument | null'),
				renderStructuralProperties('JsonDocument | null', 'string'),
				nullProperties,
				'\treadonly at?: ReadonlyArray<JsonPathFilter>',
			]),
		)
	}

	if (nestedFields.some(({ value }) => value.kind === 'json')) {
		definitions.push(
			renderNamedFilter('JsonPathValueFilter', [
				renderEqualityProperties('JsonDocument | null'),
				renderStructuralProperties('JsonDocument | null', 'string'),
				nullProperties,
			]),
		)
	}

	return definitions
}
