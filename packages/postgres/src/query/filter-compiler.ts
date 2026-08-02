import type {
	QueryComparisonFilterNode,
	QueryEqualityFilterNode,
	QueryExistenceFilterNode,
	QueryFilterExpression,
	QueryFilterNode,
	QueryMembershipFilterNode,
	QueryRegexFilterNode,
	QueryRegexFlag,
	QueryStringFilterNode,
} from '@ultimabase/core'
import type { SchemaDefinition } from '@ultimabase/core'
import {
	and,
	eq,
	gt,
	gte,
	inArray,
	isNotNull,
	isNull,
	lt,
	lte,
	ne,
	not as notExpression,
	notInArray,
	or,
	sql,
	type SQL,
} from 'drizzle-orm'

import type {
	CompiledPostgresField,
	CompiledPostgresSchema,
} from '../schema/contracts.js'
import { resolveCompiledPostgresField } from '../schema/field.js'

type RuntimePrimitiveFilter =
	| QueryComparisonFilterNode
	| QueryEqualityFilterNode
	| QueryExistenceFilterNode
	| QueryMembershipFilterNode
	| QueryRegexFilterNode
	| QueryStringFilterNode

type RuntimeFilter = QueryFilterExpression<RuntimePrimitiveFilter>

const trueExpression = sql<boolean>`true`
const falseExpression = sql<boolean>`false`

const encodeValue = (field: CompiledPostgresField, value: unknown): unknown =>
	value === null ? null : field.codec.encode(value)

const compileEquality = (
	filter: QueryEqualityFilterNode,
	field: CompiledPostgresField,
): SQL => {
	if (filter.value === null) {
		return filter.kind === 'equal'
			? isNull(field.column)
			: isNotNull(field.column)
	}

	const encoded = encodeValue(field, filter.value)

	return filter.kind === 'equal'
		? eq(field.column, encoded)
		: ne(field.column, encoded)
}

const compileMembership = (
	filter: QueryMembershipFilterNode,
	field: CompiledPostgresField,
): SQL => {
	const includesNull = filter.values.some((value) => value === null)
	const values = filter.values
		.filter((value) => value !== null)
		.map((value) => encodeValue(field, value))

	if (values.length === 0) {
		if (includesNull) {
			return filter.kind === 'in'
				? isNull(field.column)
				: isNotNull(field.column)
		}

		return filter.kind === 'in' ? falseExpression : trueExpression
	}

	const membership =
		filter.kind === 'in'
			? inArray(field.column, values)
			: notInArray(field.column, values)

	if (!includesNull) return membership

	const combined =
		filter.kind === 'in'
			? or(membership, isNull(field.column))
			: and(membership, isNotNull(field.column))

	if (combined === undefined) {
		throw new TypeError('PostgreSQL membership filter could not be combined')
	}

	return combined
}

const escapeLikeValue = (value: string): string =>
	value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')

const readStringValue = (value: unknown): string => {
	if (typeof value !== 'string') {
		throw new TypeError('PostgreSQL string filter value must be a string')
	}

	return value
}

const compileString = (
	filter: QueryStringFilterNode,
	field: CompiledPostgresField,
): SQL => {
	const escaped = escapeLikeValue(readStringValue(filter.value))
	const pattern =
		filter.kind === 'contains'
			? `%${escaped}%`
			: filter.kind === 'starts-with'
				? `${escaped}%`
				: `%${escaped}`

	// Both the developer value and the fixed escape character remain parameters.
	return sql`${field.column} LIKE ${pattern} ESCAPE ${'\\'}`
}

const hasRegexFlag = (
	flags: readonly QueryRegexFlag[],
	flag: QueryRegexFlag,
): boolean => flags.some((candidate) => candidate === flag)

const compileRegex = (
	filter: QueryRegexFilterNode,
	field: CompiledPostgresField,
): SQL => {
	const caseInsensitive = hasRegexFlag(filter.pattern.flags, 'case-insensitive')
	const dotMatchesNewline = hasRegexFlag(
		filter.pattern.flags,
		'dot-matches-newline',
	)
	const multiline = hasRegexFlag(filter.pattern.flags, 'multiline')
	const newlineMode = dotMatchesNewline
		? multiline
			? 'w'
			: 's'
		: multiline
			? 'n'
			: 'p'
	const source = `(?${newlineMode})${filter.pattern.source}`

	return caseInsensitive
		? sql`${field.column} ~* ${source}`
		: sql`${field.column} ~ ${source}`
}

const compilePrimitive = (
	filter: RuntimePrimitiveFilter,
	schema: CompiledPostgresSchema,
): SQL => {
	const field = resolveCompiledPostgresField(schema, filter.field)

	switch (filter.kind) {
		case 'equal':
		case 'not-equal':
			return compileEquality(filter, field)
		case 'greater-than':
			return gt(field.column, encodeValue(field, filter.value))
		case 'greater-than-or-equal':
			return gte(field.column, encodeValue(field, filter.value))
		case 'less-than':
			return lt(field.column, encodeValue(field, filter.value))
		case 'less-than-or-equal':
			return lte(field.column, encodeValue(field, filter.value))
		case 'in':
		case 'not-in':
			return compileMembership(filter, field)
		case 'contains':
		case 'starts-with':
		case 'ends-with':
			return compileString(filter, field)
		case 'regex':
			return compileRegex(filter, field)
		case 'exists':
			return filter.exists ? isNotNull(field.column) : isNull(field.column)
	}
}

const compileRuntimeFilter = (
	filter: RuntimeFilter,
	schema: CompiledPostgresSchema,
): SQL => {
	switch (filter.kind) {
		case 'constant':
			return filter.value ? trueExpression : falseExpression
		case 'not':
			return notExpression(compileRuntimeFilter(filter.expression, schema))
		case 'and':
		case 'or': {
			const expressions = filter.expressions.map((expression) =>
				compileRuntimeFilter(expression, schema),
			)
			const compiled =
				filter.kind === 'and' ? and(...expressions) : or(...expressions)

			if (compiled === undefined) {
				return filter.kind === 'and' ? trueExpression : falseExpression
			}

			return compiled
		}
		default:
			return compilePrimitive(filter, schema)
	}
}

/** Compiles one normalized logical tree into a parameterized Drizzle expression. */
export const compilePostgresFilter = <TSchema extends SchemaDefinition>(
	filter: QueryFilterNode<TSchema>,
	schema: CompiledPostgresSchema,
): SQL => compileRuntimeFilter(filter, schema)
