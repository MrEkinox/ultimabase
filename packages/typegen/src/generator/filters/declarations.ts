import type {
	TypegenApplicationSnapshot,
	TypegenFieldSnapshot,
} from '../../snapshot.js'
import type { RenderContext } from '../types.js'
import { renderScalarValue } from '../values.js'
import { arrayFilterName } from './field-filters.js'
import {
	nullProperties,
	renderEqualityProperties,
	renderNamedFilter,
	renderOrderedProperties,
	renderStructuralProperties,
} from './operators.js'

/** Kinds whose root filter compares values rather than falling back to `NullFilter`. */
const equalityKinds: ReadonlySet<string> = new Set([
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
	'pointer',
	'string',
	'time',
	'uuid',
])

/** Numeric and binary kinds, in declaration order, with their nullable value. */
const comparableFilters = [
	{ kind: 'bigint', name: 'BigInt', ordered: true, value: 'bigint | null' },
	{
		kind: 'binary',
		name: 'Binary',
		ordered: false,
		value: 'Uint8Array | null',
	},
	{ kind: 'decimal', name: 'Decimal', ordered: true, value: 'string | null' },
	{ kind: 'float', name: 'Float', ordered: true, value: 'number | null' },
	{ kind: 'int', name: 'Int', ordered: true, value: 'number | null' },
] as const

/** Equality-only path filters; temporal kinds share one declaration. */
const equalityPathFilters = [
	{ kinds: ['boolean'], name: 'BooleanPathFilter', value: 'boolean | null' },
	{
		kinds: ['date', 'dateTime', 'time'],
		name: 'DateTimePathFilter',
		value: 'string | null',
	},
	{ kinds: ['uuid'], name: 'IDPathFilter', value: 'string | null' },
] as const

const stringOperators = [
	'\treadonly contains?: string | null',
	'\treadonly endsWith?: string | null',
	'\treadonly matches?: RegexPattern',
	'\treadonly startsWith?: string | null',
]

const equalityFilter = (name: string, value: string): string =>
	renderNamedFilter(name, [renderEqualityProperties(value), nullProperties])

const collectNestedFields = (
	fields: readonly TypegenFieldSnapshot[],
): readonly TypegenFieldSnapshot[] =>
	fields.flatMap((field) => [
		field,
		...(field.value.kind === 'object'
			? collectNestedFields(field.value.fields)
			: []),
	])

/** Emits each concrete array filter once while retaining exact element types. */
const renderArrayFilters = (
	fields: readonly TypegenFieldSnapshot[],
	context: RenderContext,
): readonly string[] => {
	const definitions = new Map<string, string>()

	for (const field of fields) {
		if (!field.typegen.list) {
			continue
		}

		// The name is resolved first: it rejects relationship lists, whose
		// element has no array filter.
		const name = arrayFilterName(field, context)
		const item = renderScalarValue(field, 'object', context)
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

/** Renders scalar filter declarations in their stable public output order. */
const renderScalarFilters = (
	rootFields: readonly TypegenFieldSnapshot[],
	nestedFields: readonly TypegenFieldSnapshot[],
): readonly string[] => {
	const definitions: string[] = []
	const allFields = [...rootFields, ...nestedFields]
	const hasKind = (
		fields: readonly TypegenFieldSnapshot[],
		kinds: readonly string[],
	): boolean =>
		fields.some((field) => kinds.includes(field.kind) && !field.typegen.list)
	const hasRootKind = (...kinds: string[]): boolean =>
		hasKind(rootFields, kinds)
	const hasNestedKind = (...kinds: string[]): boolean =>
		hasKind(nestedFields, kinds)

	if (
		allFields.some((field) => field.portableEquality && !field.typegen.list)
	) {
		definitions.push(equalityFilter('PortableEqualityFilter<TValue>', 'TValue'))
	}

	if (allFields.some((field) => field.structuralContains !== undefined)) {
		definitions.push(
			renderNamedFilter('PortableContainmentFilter<TValue, TOperand>', [
				renderEqualityProperties('TValue'),
				'\treadonly contains?: TOperand',
				nullProperties,
			]),
		)
	}

	for (const { kind, name, ordered, value } of comparableFilters) {
		if (hasRootKind(kind)) {
			definitions.push(
				renderNamedFilter(`${name}Filter`, [
					renderEqualityProperties(value),
					...(ordered ? [renderOrderedProperties(value)] : []),
					nullProperties,
				]),
			)
		}

		if (hasNestedKind(kind)) {
			definitions.push(equalityFilter(`${name}PathFilter`, value))
		}
	}

	for (const { kinds, name, value } of equalityPathFilters) {
		if (hasNestedKind(...kinds)) {
			definitions.push(equalityFilter(name, value))
		}
	}

	if (hasRootKind('string') || hasNestedKind('string')) {
		definitions.push(
			`export type RegexFlag = "case-insensitive" | "dot-matches-newline" | "multiline"`,
			renderNamedFilter('RegexPattern', [
				'\treadonly source: string',
				'\treadonly flags: ReadonlyArray<RegexFlag>',
			]),
		)
	}

	if (hasNestedKind('string')) {
		definitions.push(
			renderNamedFilter('StringPathFilter', [
				renderEqualityProperties('string | null'),
				...stringOperators,
				nullProperties,
			]),
		)
	}

	if (hasRootKind('string')) {
		definitions.push(
			renderNamedFilter('StringFilter', [
				renderEqualityProperties('string | null'),
				renderOrderedProperties('string | null'),
				...stringOperators,
				nullProperties,
			]),
		)
	}

	if (hasRootKind('boolean')) {
		definitions.push(equalityFilter('BooleanFilter', 'boolean | null'))
	}

	if (hasRootKind('uuid')) {
		definitions.push(equalityFilter('IDFilter', 'string | null'))
	}

	if (hasRootKind('date', 'dateTime', 'time')) {
		definitions.push(
			renderNamedFilter('DateTimeFilter', [
				renderEqualityProperties('string | null'),
				renderOrderedProperties('string | null'),
				nullProperties,
			]),
		)
	}

	return definitions
}

/** Renders JSON and embedded-object support shared by structural filters. */
const renderStructuralFilters = (
	rootFields: readonly TypegenFieldSnapshot[],
	nestedFields: readonly TypegenFieldSnapshot[],
): readonly string[] => {
	const definitions: string[] = []
	const isJson = ({ value }: TypegenFieldSnapshot): boolean =>
		value.kind === 'json'
	const hasJsonField = rootFields.some(isJson) || nestedFields.some(isJson)
	const hasObjectField = [...rootFields, ...nestedFields].some(
		({ value }) => value.kind === 'object',
	)

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

	const jsonDocumentFilter = (name: string, extra: readonly string[]): string =>
		renderNamedFilter(name, [
			renderEqualityProperties('JsonDocument | null'),
			renderStructuralProperties('JsonDocument | null', 'string'),
			nullProperties,
			...extra,
		])

	if (rootFields.some(isJson)) {
		definitions.push(
			jsonDocumentFilter('JsonFilter', [
				'\treadonly at?: ReadonlyArray<JsonPathFilter>',
			]),
		)
	}

	if (nestedFields.some(isJson)) {
		definitions.push(jsonDocumentFilter('JsonPathValueFilter', []))
	}

	return definitions
}

/** Renders pointer and relation filter declarations when a root field uses them. */
const renderRelationshipFilters = (
	rootFields: readonly TypegenFieldSnapshot[],
): readonly string[] => {
	const definitions: string[] = []

	if (rootFields.some(({ value }) => value.kind === 'pointer')) {
		definitions.push(
			renderNamedFilter('PointerFilter<TWhere>', [
				renderEqualityProperties('string | null'),
				'\treadonly is?: TWhere',
				'\treadonly isNot?: TWhere',
				nullProperties,
			]),
		)
	}

	if (rootFields.some(({ value }) => value.kind === 'relation')) {
		definitions.push(
			renderNamedFilter('RelationFilter<TWhere>', [
				`\treadonly count?: {
${renderEqualityProperties('number | null').replaceAll('\t', '\t\t')}
${renderOrderedProperties('number | null').replaceAll('\t', '\t\t')}
\t\treadonly where?: TWhere
\t}`,
				'\treadonly every?: TWhere',
				'\treadonly isEmpty?: true',
				'\treadonly isNotEmpty?: true',
				'\treadonly none?: TWhere',
				'\treadonly some?: TWhere',
			]),
		)
	}

	return definitions
}

/** Coordinates shared declarations while preserving their deterministic order. */
export const renderSharedTypes = (
	snapshot: TypegenApplicationSnapshot,
	context: RenderContext,
): string => {
	const rootFields = snapshot.schemas.flatMap(({ fields }) => fields)
	const nestedFields = rootFields.flatMap((field) =>
		field.value.kind === 'object'
			? collectNestedFields(field.value.fields)
			: [],
	)
	const allFields = [...rootFields, ...nestedFields]
	const definitions: string[] = [`export type OrderDirection = "asc" | "desc"`]

	if (
		allFields.some(
			(field) =>
				!field.typegen.list &&
				!equalityKinds.has(field.kind) &&
				!field.portableEquality &&
				field.value.kind !== 'object' &&
				field.value.kind !== 'relation',
		)
	) {
		definitions.push(renderNamedFilter('NullFilter', [nullProperties]))
	}

	definitions.push(
		...renderArrayFilters(allFields, context),
		...renderScalarFilters(rootFields, nestedFields),
		...renderStructuralFilters(rootFields, nestedFields),
		...renderRelationshipFilters(rootFields),
	)

	return definitions.join('\n\n')
}
