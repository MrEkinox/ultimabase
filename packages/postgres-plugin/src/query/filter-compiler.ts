import type {
	DatabaseRowFilterNode,
	QueryFilterExpression,
	QueryFilterNode,
	QueryRelationPredicateNode,
	QueryRegexFlag,
} from '@ultimabase/core'
import type { SchemaDefinition } from '@ultimabase/core'
import {
	and,
	between,
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
	notBetween,
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
import {
	createPostgresValueCodec,
	encodePostgresPartialValue,
} from '../schema/value-codec.js'
import type { FieldValidationPlan } from '@ultimabase/core'

interface RuntimeFilterTarget {
	readonly field: string
	readonly path?: readonly string[]
}

type RuntimeEqualityFilter = RuntimeFilterTarget &
	Readonly<{ kind: 'equal' | 'not-equal'; value: unknown }>

type RuntimeComparisonFilter = RuntimeFilterTarget &
	Readonly<{
		kind:
			| 'greater-than'
			| 'greater-than-or-equal'
			| 'less-than'
			| 'less-than-or-equal'
		value: unknown
	}>

type RuntimeRangeFilter = RuntimeFilterTarget &
	Readonly<{
		kind: 'between' | 'not-between'
		lower: unknown
		upper: unknown
	}>

type RuntimeMembershipFilter = RuntimeFilterTarget &
	Readonly<{ kind: 'in' | 'not-in'; values: readonly unknown[] }>

type RuntimeStringOrContainmentFilter = RuntimeFilterTarget &
	Readonly<{
		kind: 'contained-by' | 'contains' | 'ends-with' | 'starts-with'
		value: unknown
	}>

type RuntimeKeyFilter = RuntimeFilterTarget &
	Readonly<{ kind: 'has-key'; value: string }>

type RuntimeKeysFilter = RuntimeFilterTarget &
	Readonly<{
		kind: 'has-all-keys' | 'has-any-keys'
		keys: readonly string[]
	}>

type RuntimeJsonPathFilter = RuntimeFilterTarget &
	Readonly<{
		kind: 'json-path-exists' | 'json-path-matches'
		source: string
		variables?: Readonly<Record<string, unknown>>
	}>

type RuntimeRegexFilter = RuntimeFilterTarget &
	Readonly<{
		kind: 'regex'
		pattern: Readonly<{
			flags: readonly QueryRegexFlag[]
			source: string
		}>
	}>

type RuntimeNullFilter = RuntimeFilterTarget &
	Readonly<{ kind: 'null'; isNull: boolean }>

type RuntimePrimitiveFilter =
	| RuntimeComparisonFilter
	| RuntimeEqualityFilter
	| RuntimeJsonPathFilter
	| RuntimeKeyFilter
	| RuntimeKeysFilter
	| RuntimeMembershipFilter
	| RuntimeNullFilter
	| RuntimeRangeFilter
	| RuntimeRegexFilter
	| RuntimeStringOrContainmentFilter

type RuntimeFilter = QueryFilterExpression<
	RuntimePrimitiveFilter | QueryRelationPredicateNode
>

/** Compiles one correlated relation leaf against the current source alias. */
export type PostgresRelationPredicateCompiler = (
	predicate: QueryRelationPredicateNode,
	source: CompiledPostgresSchema,
) => SQL

const trueExpression = sql<boolean>`true`
const falseExpression = sql<boolean>`false`

const encodeValue = (field: CompiledPostgresField, value: unknown): unknown =>
	value === null ? null : field.codec.encode(value)

interface PostgresFilterTarget {
	readonly field: CompiledPostgresField
	readonly jsonb: SQL
	readonly path: readonly string[] | undefined
	readonly plan: FieldValidationPlan | undefined
	readonly text: SQL
}

const readFilterPath = (
	filter: RuntimePrimitiveFilter,
): readonly string[] | undefined =>
	'path' in filter && Array.isArray(filter.path) ? filter.path : undefined

const resolvePathPlan = (
	plan: FieldValidationPlan,
	path: readonly string[],
): FieldValidationPlan | undefined => {
	let current: FieldValidationPlan | undefined = plan

	for (const segment of path) {
		if (current.kind === 'object') {
			current = current.fields[segment]

			if (current === undefined) {
				throw new TypeError(
					`PostgreSQL filter path references unknown field: ${segment}`,
				)
			}

			continue
		}

		if (current.kind === 'scalar' && current.field.kind === 'json') {
			return undefined
		}

		throw new TypeError('PostgreSQL filter path cannot traverse this field')
	}

	return current
}

const resolveFilterTarget = (
	filter: RuntimePrimitiveFilter,
	schema: CompiledPostgresSchema,
): PostgresFilterTarget => {
	const field = resolveCompiledPostgresField(schema, filter.field)
	const path = readFilterPath(filter)

	if (path === undefined) {
		return {
			field,
			jsonb: sql`${field.column}`,
			path,
			plan: field.plan,
			text: sql`${field.column}`,
		}
	}

	if (field.storage !== 'jsonb') {
		throw new TypeError('PostgreSQL filter paths require JSONB storage')
	}

	return {
		field,
		jsonb: sql`${field.column} #> ${sql.param(path)}::text[]`,
		path,
		plan: resolvePathPlan(field.plan, path),
		text: sql`${field.column} #>> ${sql.param(path)}::text[]`,
	}
}

const stringifyJsonbParameter = (value: unknown): string => {
	const serialized: unknown = JSON.stringify(value)

	if (typeof serialized !== 'string') {
		throw new TypeError('PostgreSQL JSONB filter value must be serializable')
	}

	return serialized
}

const encodePathValue = (
	target: PostgresFilterTarget,
	value: unknown,
): string => {
	const encoded =
		target.plan === undefined
			? value
			: createPostgresValueCodec(target.plan, true).encode(value)

	return stringifyJsonbParameter(encoded)
}

const encodeStructuralValue = (
	target: PostgresFilterTarget,
	value: unknown,
): string => {
	const encoded =
		target.plan === undefined
			? value
			: target.plan.kind === 'object'
				? encodePostgresPartialValue(target.plan, value)
				: createPostgresValueCodec(target.plan, true).encode(value)

	return stringifyJsonbParameter(encoded)
}

const compileEquality = (
	filter: RuntimeEqualityFilter,
	target: PostgresFilterTarget,
): SQL => {
	if (target.path !== undefined) {
		const value = sql`${encodePathValue(target, filter.value)}::jsonb`

		return filter.kind === 'equal'
			? eq(target.jsonb, value)
			: ne(target.jsonb, value)
	}

	if (filter.value === null) {
		return filter.kind === 'equal'
			? isNull(target.field.column)
			: isNotNull(target.field.column)
	}

	const encoded = encodeValue(target.field, filter.value)

	return filter.kind === 'equal'
		? eq(target.field.column, encoded)
		: ne(target.field.column, encoded)
}

const compileMembership = (
	filter: RuntimeMembershipFilter,
	target: PostgresFilterTarget,
): SQL => {
	if (target.path !== undefined) {
		const expressions = filter.values.map((value) => {
			const encoded = sql`${encodePathValue(target, value)}::jsonb`

			return filter.kind === 'in'
				? eq(target.jsonb, encoded)
				: ne(target.jsonb, encoded)
		})
		const combined =
			filter.kind === 'in' ? or(...expressions) : and(...expressions)

		return combined ?? (filter.kind === 'in' ? falseExpression : trueExpression)
	}

	const includesNull = filter.values.some((value) => value === null)
	const values = filter.values
		.filter((value) => value !== null)
		.map((value) => encodeValue(target.field, value))

	if (values.length === 0) {
		if (includesNull) {
			return filter.kind === 'in'
				? isNull(target.field.column)
				: isNotNull(target.field.column)
		}

		return filter.kind === 'in' ? falseExpression : trueExpression
	}

	const membership =
		filter.kind === 'in'
			? inArray(target.field.column, values)
			: notInArray(target.field.column, values)

	if (!includesNull) return membership

	const combined =
		filter.kind === 'in'
			? or(membership, isNull(target.field.column))
			: and(membership, isNotNull(target.field.column))

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
	filter: RuntimeStringOrContainmentFilter,
	target: PostgresFilterTarget,
): SQL => {
	const escaped = escapeLikeValue(readStringValue(filter.value))
	const pattern =
		filter.kind === 'contains'
			? `%${escaped}%`
			: filter.kind === 'starts-with'
				? `${escaped}%`
				: `%${escaped}`

	// Both the developer value and the fixed escape character remain parameters.
	return sql`${target.text} LIKE ${pattern} ESCAPE ${'\\'}`
}

const isStructuredTarget = (target: PostgresFilterTarget): boolean =>
	target.plan === undefined ||
	target.plan.kind === 'object' ||
	target.plan.field.kind === 'json'

const compileStructural = (
	filter: RuntimeStringOrContainmentFilter,
	target: PostgresFilterTarget,
): SQL => {
	if (!isStructuredTarget(target)) {
		throw new TypeError(
			'PostgreSQL structural filters require a JSON or object target',
		)
	}

	const encoded = encodeStructuralValue(target, filter.value)

	return filter.kind === 'contains'
		? sql`${target.jsonb} @> ${encoded}::jsonb`
		: sql`${target.jsonb} <@ ${encoded}::jsonb`
}

const compileKeys = (
	filter: RuntimeKeyFilter | RuntimeKeysFilter,
	target: PostgresFilterTarget,
): SQL => {
	if (!isStructuredTarget(target)) {
		throw new TypeError(
			'PostgreSQL key filters require a JSON or object target',
		)
	}

	if (filter.kind === 'has-key') {
		return sql`${target.jsonb} ? ${filter.value}`
	}

	return filter.kind === 'has-any-keys'
		? sql`${target.jsonb} ?| ${sql.param(filter.keys)}::text[]`
		: sql`${target.jsonb} ?& ${sql.param(filter.keys)}::text[]`
}

const compileJsonPath = (
	filter: RuntimeJsonPathFilter,
	target: PostgresFilterTarget,
): SQL => {
	if (!isStructuredTarget(target)) {
		throw new TypeError(
			'PostgreSQL JSONPath filters require a JSON or object target',
		)
	}

	if (filter.variables === undefined) {
		return filter.kind === 'json-path-exists'
			? sql`${target.jsonb} @? ${filter.source}::jsonpath`
			: sql`${target.jsonb} @@ ${filter.source}::jsonpath`
	}

	const variables = stringifyJsonbParameter(filter.variables)

	// Function forms preserve operator-style error suppression when variables are required.
	return filter.kind === 'json-path-exists'
		? sql`jsonb_path_exists(${target.jsonb}, ${filter.source}::jsonpath, ${variables}::jsonb, ${true})`
		: sql`jsonb_path_match(${target.jsonb}, ${filter.source}::jsonpath, ${variables}::jsonb, ${true})`
}

const compileRange = (
	filter: RuntimeRangeFilter,
	field: CompiledPostgresField,
): SQL => {
	const lower = encodeValue(field, filter.lower)
	const upper = encodeValue(field, filter.upper)

	return filter.kind === 'between'
		? between(field.column, lower, upper)
		: notBetween(field.column, lower, upper)
}

const hasRegexFlag = (
	flags: readonly QueryRegexFlag[],
	flag: QueryRegexFlag,
): boolean => flags.some((candidate) => candidate === flag)

const compileRegex = (
	filter: RuntimeRegexFilter,
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
	const target = resolveFilterTarget(filter, schema)

	switch (filter.kind) {
		case 'equal':
		case 'not-equal':
			return compileEquality(filter, target)
		case 'greater-than':
			return gt(target.field.column, encodeValue(target.field, filter.value))
		case 'greater-than-or-equal':
			return gte(target.field.column, encodeValue(target.field, filter.value))
		case 'less-than':
			return lt(target.field.column, encodeValue(target.field, filter.value))
		case 'less-than-or-equal':
			return lte(target.field.column, encodeValue(target.field, filter.value))
		case 'between':
		case 'not-between':
			return compileRange(filter, target.field)
		case 'in':
		case 'not-in':
			return compileMembership(filter, target)
		case 'contains':
			if (isStructuredTarget(target)) {
				return compileStructural(filter, target)
			}

			if (
				target.plan?.kind !== 'scalar' ||
				target.plan.field.kind !== 'string'
			) {
				throw new TypeError(
					'PostgreSQL contains filter requires a string or structured target',
				)
			}

			return compileString(filter, target)
		case 'contained-by':
			return compileStructural(filter, target)
		case 'has-key':
		case 'has-any-keys':
		case 'has-all-keys':
			return compileKeys(filter, target)
		case 'json-path-exists':
		case 'json-path-matches':
			return compileJsonPath(filter, target)
		case 'starts-with':
		case 'ends-with':
			return compileString(filter, target)
		case 'regex':
			return compileRegex(filter, target.field)
		case 'null':
			if (target.path !== undefined) {
				const jsonNull = sql`${stringifyJsonbParameter(null)}::jsonb`

				return filter.isNull
					? eq(target.jsonb, jsonNull)
					: ne(target.jsonb, jsonNull)
			}

			return filter.isNull
				? isNull(target.field.column)
				: isNotNull(target.field.column)
	}
}

const compileRuntimeFilter = (
	filter: RuntimeFilter,
	schema: CompiledPostgresSchema,
	relationCompiler?: PostgresRelationPredicateCompiler,
): SQL => {
	switch (filter.kind) {
		case 'constant':
			return filter.value ? trueExpression : falseExpression
		case 'not':
			return notExpression(
				compileRuntimeFilter(filter.expression, schema, relationCompiler),
			)
		case 'and':
		case 'or': {
			const expressions = filter.expressions.map((expression) =>
				compileRuntimeFilter(expression, schema, relationCompiler),
			)
			const compiled =
				filter.kind === 'and' ? and(...expressions) : or(...expressions)

			if (compiled === undefined) {
				return filter.kind === 'and' ? trueExpression : falseExpression
			}

			return compiled
		}
		case 'relation-predicate':
			if (relationCompiler === undefined) {
				throw new TypeError(
					'PostgreSQL relation predicate compiler is unavailable',
				)
			}

			return relationCompiler(filter, schema)
		default:
			return compilePrimitive(filter, schema)
	}
}

/** Compiles one normalized logical tree into a parameterized Drizzle expression. */
export const compilePostgresFilter = <TSchema extends SchemaDefinition>(
	filter: QueryFilterNode<TSchema>,
	schema: CompiledPostgresSchema,
	relationCompiler?: PostgresRelationPredicateCompiler,
): SQL =>
	// Runtime traversal erases only schema inference after Core validated the exact AST.
	compileRuntimeFilter(
		filter as unknown as RuntimeFilter,
		schema,
		relationCompiler,
	)

/** Compiles Runtime's schema-erased private predicate through the same safe visitor. */
export const compilePostgresRowFilter = (
	filter: DatabaseRowFilterNode,
	schema: CompiledPostgresSchema,
): SQL => compileRuntimeFilter(filter as RuntimeFilter, schema)
