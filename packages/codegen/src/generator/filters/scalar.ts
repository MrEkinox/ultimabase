import type { TypegenFieldSnapshot } from '../../snapshot.js'
import { listDepth } from '../values.js'
import {
	nullProperties,
	orderedKinds,
	renderEqualityProperties,
	renderNamedFilter,
	renderOrderedProperties,
} from './operators.js'

/** Renders scalar filter declarations in their stable public output order. */
export const renderScalarFilters = (
	rootFields: readonly TypegenFieldSnapshot[],
	nestedFields: readonly TypegenFieldSnapshot[],
): readonly string[] => {
	const definitions: string[] = []
	const hasRootKind = (kind: string): boolean =>
		rootFields.some((field) => field.kind === kind && listDepth(field) === 0)
	const hasNestedKind = (kind: string): boolean =>
		nestedFields.some((field) => field.kind === kind && listDepth(field) === 0)
	const scalarFilters = [
		{ kind: 'bigint', name: 'BigIntFilter', value: 'bigint | null' },
		{ kind: 'binary', name: 'BinaryFilter', value: 'Uint8Array | null' },
		{ kind: 'decimal', name: 'DecimalFilter', value: 'string | null' },
		{ kind: 'float', name: 'FloatFilter', value: 'number | null' },
		{ kind: 'int', name: 'IntFilter', value: 'number | null' },
	] as const

	for (const { kind, name, value } of scalarFilters) {
		if (hasRootKind(kind)) {
			definitions.push(
				renderNamedFilter(name, [
					renderEqualityProperties(value),
					...(orderedKinds.has(kind) ? [renderOrderedProperties(value)] : []),
					nullProperties,
				]),
			)
		}

		if (hasNestedKind(kind)) {
			definitions.push(
				renderNamedFilter(name.replace('Filter', 'PathFilter'), [
					renderEqualityProperties(value),
					nullProperties,
				]),
			)
		}
	}

	const equalityPathFilters = [
		{ kind: 'boolean', name: 'BooleanPathFilter', value: 'boolean | null' },
		{ kind: 'date', name: 'DateTimePathFilter', value: 'string | null' },
		{ kind: 'dateTime', name: 'DateTimePathFilter', value: 'string | null' },
		{ kind: 'time', name: 'DateTimePathFilter', value: 'string | null' },
		{ kind: 'uuid', name: 'IDPathFilter', value: 'string | null' },
	] as const
	const emittedPathFilters = new Set<string>()

	for (const { kind, name, value } of equalityPathFilters) {
		if (hasNestedKind(kind) && !emittedPathFilters.has(name)) {
			emittedPathFilters.add(name)
			definitions.push(
				renderNamedFilter(name, [
					renderEqualityProperties(value),
					nullProperties,
				]),
			)
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
				'\treadonly contains?: string | null',
				'\treadonly endsWith?: string | null',
				'\treadonly matches?: RegexPattern',
				'\treadonly startsWith?: string | null',
				nullProperties,
			]),
		)
	}

	if (hasRootKind('string')) {
		definitions.push(
			renderNamedFilter('StringFilter', [
				renderEqualityProperties('string | null'),
				renderOrderedProperties('string | null'),
				'\treadonly contains?: string | null',
				'\treadonly endsWith?: string | null',
				'\treadonly matches?: RegexPattern',
				'\treadonly startsWith?: string | null',
				nullProperties,
			]),
		)
	}

	if (hasRootKind('boolean')) {
		definitions.push(
			renderNamedFilter('BooleanFilter', [
				renderEqualityProperties('boolean | null'),
				nullProperties,
			]),
		)
	}

	if (hasRootKind('uuid')) {
		definitions.push(
			renderNamedFilter('IDFilter', [
				renderEqualityProperties('string | null'),
				nullProperties,
			]),
		)
	}

	if (hasRootKind('date') || hasRootKind('dateTime') || hasRootKind('time')) {
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
