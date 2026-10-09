import {
	type DatabaseRowFilterNode,
	type FieldValidationPlan,
	type QueryFilterExpression,
	type QueryFilterNode,
	type QueryRegexFlag,
	type QueryRelationFilterNode,
	type SchemaDefinition,
} from '@ultimabase/core'
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

import { required } from '../required.js'
import {
	resolveCompiledPostgresField,
	type CompiledPostgresField,
	type CompiledPostgresSchema,
} from '../schema/contracts.js'
import {
	createPostgresValueCodec,
	encodePostgresPartialValue,
} from '../schema/value-codec.js'
import {
	compilePostgresPluginFieldContains,
	stringifyJsonbParameter,
} from './jsonb-operand.js'

/** Compiles one correlated relation leaf against the current source alias. */
export type PostgresRelationPredicateCompiler = (
	predicate: QueryRelationFilterNode,
	source: CompiledPostgresSchema,
) => SQL

type FilterLeaf<TLeaf> = Readonly<
	TLeaf & { readonly field: string; readonly path?: readonly string[] }
>

/** Mirrors Core's normalized primitive leaves once schema inference is erased. */
type RuntimePrimitiveFilter = FilterLeaf<
	| {
			kind:
				| 'contains'
				| 'ends-with'
				| 'equal'
				| 'greater-than'
				| 'greater-than-or-equal'
				| 'less-than'
				| 'less-than-or-equal'
				| 'list-has'
				| 'not-equal'
				| 'starts-with'
			value: unknown
	  }
	| { kind: 'between' | 'not-between'; lower: unknown; upper: unknown }
	| {
			kind: 'in' | 'list-has-every' | 'list-has-some' | 'not-in'
			values: readonly unknown[]
	  }
	| { kind: 'list-empty' }
	| { kind: 'has-key'; value: string }
	| { kind: 'has-all-keys' | 'has-any-keys'; keys: readonly string[] }
	| {
			kind: 'regex'
			pattern: Readonly<{ flags: readonly QueryRegexFlag[]; source: string }>
	  }
	| { kind: 'null'; isNull: boolean }
>

type RuntimeFilter = QueryFilterExpression<
	RuntimePrimitiveFilter | QueryRelationFilterNode
>

const trueExpression = sql<boolean>`true`
const falseExpression = sql<boolean>`false`

interface PostgresFilterTarget {
	readonly field: CompiledPostgresField
	readonly jsonb: SQL
	readonly path: readonly string[] | undefined
	readonly plan: FieldValidationPlan | undefined
	readonly text: SQL
}

const jsonbParameter = (value: unknown): SQL =>
	sql`${stringifyJsonbParameter(value)}::jsonb`

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
	const path =
		'path' in filter && Array.isArray(filter.path) ? filter.path : undefined

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

/** Encodes one complete value through the target's JSONB storage codec. */
const encodeJsonbValue = (
	plan: FieldValidationPlan | undefined,
	value: unknown,
): SQL =>
	jsonbParameter(
		plan === undefined ? value : createPostgresValueCodec(plan).encode(value),
	)

const compileEquality = (
	kind: 'equal' | 'not-equal',
	value: unknown,
	target: PostgresFilterTarget,
): SQL => {
	if (target.path === undefined && value === null) {
		return kind === 'equal'
			? isNull(target.field.column)
			: isNotNull(target.field.column)
	}

	const compare = kind === 'equal' ? eq : ne

	// Paths and lists compare whole JSONB documents encoded by the field codec.
	return target.path !== undefined || target.plan?.kind === 'array'
		? compare(target.jsonb, encodeJsonbValue(target.plan, value))
		: compare(target.field.column, value)
}

const compileListElementEquality = (
	target: PostgresFilterTarget,
	value: unknown,
): SQL => {
	if (target.plan?.kind !== 'array') {
		throw new TypeError('PostgreSQL list filters require an array plan')
	}

	const encoded = stringifyJsonbParameter(
		createPostgresValueCodec(target.plan.items).encode(value),
	)

	// Element equality avoids JSONB containment's partial-object semantics.
	return sql`EXISTS (
		SELECT 1
		FROM jsonb_array_elements(
			CASE
				WHEN jsonb_typeof(${target.jsonb}) = 'array' THEN ${target.jsonb}
				ELSE '[]'::jsonb
			END
		) AS list_element(value)
		WHERE list_element.value = ${encoded}::jsonb
	)`
}

const compileMembership = (
	kind: 'in' | 'not-in',
	values: readonly unknown[],
	target: PostgresFilterTarget,
): SQL => {
	const included = kind === 'in'
	const empty = included ? falseExpression : trueExpression

	if (target.path !== undefined) {
		const expressions = values.map((value) =>
			(included ? eq : ne)(target.jsonb, encodeJsonbValue(target.plan, value)),
		)

		return (included ? or(...expressions) : and(...expressions)) ?? empty
	}

	const column = target.field.column
	const includesNull = values.some((value) => value === null)
	const nonNull = values.filter((value) => value !== null)

	if (nonNull.length === 0) {
		if (!includesNull) return empty

		return included ? isNull(column) : isNotNull(column)
	}

	const membership = included
		? inArray(column, nonNull)
		: notInArray(column, nonNull)

	if (!includesNull) return membership

	return required(
		included
			? or(membership, isNull(column))
			: and(membership, isNotNull(column)),
		'PostgreSQL membership filter could not be combined',
	)
}

const compileString = (
	kind: 'contains' | 'ends-with' | 'starts-with',
	value: unknown,
	target: PostgresFilterTarget,
): SQL => {
	if (typeof value !== 'string') {
		throw new TypeError('PostgreSQL string filter value must be a string')
	}

	const escaped = value
		.replaceAll('\\', '\\\\')
		.replaceAll('%', '\\%')
		.replaceAll('_', '\\_')
	const pattern =
		kind === 'contains'
			? `%${escaped}%`
			: kind === 'starts-with'
				? `${escaped}%`
				: `%${escaped}`

	// Both the developer value and the fixed escape character remain parameters.
	return sql`${target.text} LIKE ${pattern} ESCAPE ${'\\'}`
}

const isStructuredTarget = (target: PostgresFilterTarget): boolean =>
	target.plan === undefined ||
	target.plan.kind === 'object' ||
	target.plan.field.kind === 'json'

const assertStructuredTarget = (
	target: PostgresFilterTarget,
	filterLabel: string,
): void => {
	if (!isStructuredTarget(target)) {
		throw new TypeError(
			`PostgreSQL ${filterLabel} filters require a JSON or object target`,
		)
	}
}

const compileStructural = (
	value: unknown,
	target: PostgresFilterTarget,
): SQL => {
	assertStructuredTarget(target, 'structural')
	const encoded = stringifyJsonbParameter(
		target.plan?.kind === 'object'
			? encodePostgresPartialValue(target.plan, value)
			: target.plan === undefined
				? value
				: createPostgresValueCodec(target.plan).encode(value),
	)

	return sql`${target.jsonb} @> ${encoded}::jsonb`
}

const compileContains = (value: unknown, target: PostgresFilterTarget): SQL => {
	const pluginContains = compilePostgresPluginFieldContains(
		value,
		target.jsonb,
		target.plan,
		target.field.storage,
	)

	if (pluginContains !== undefined) return pluginContains
	if (isStructuredTarget(target)) {
		return compileStructural(value, target)
	}
	if (target.plan?.kind !== 'scalar' || target.plan.field.kind !== 'string') {
		throw new TypeError(
			'PostgreSQL contains filter requires a string or structured target',
		)
	}

	return compileString('contains', value, target)
}

const compileRegex = (
	pattern: Readonly<{ flags: readonly QueryRegexFlag[]; source: string }>,
	field: CompiledPostgresField,
): SQL => {
	const hasFlag = (flag: QueryRegexFlag): boolean =>
		pattern.flags.some((candidate) => candidate === flag)
	const multiline = hasFlag('multiline')
	const newlineMode = hasFlag('dot-matches-newline')
		? multiline
			? 'w'
			: 's'
		: multiline
			? 'n'
			: 'p'
	const source = `(?${newlineMode})${pattern.source}`

	return hasFlag('case-insensitive')
		? sql`${field.column} ~* ${source}`
		: sql`${field.column} ~ ${source}`
}

const compilePrimitive = (
	filter: RuntimePrimitiveFilter,
	schema: CompiledPostgresSchema,
): SQL => {
	const target = resolveFilterTarget(filter, schema)
	const column = target.field.column

	switch (filter.kind) {
		case 'equal':
		case 'not-equal':
			return compileEquality(filter.kind, filter.value, target)
		case 'greater-than':
			return gt(column, filter.value)
		case 'greater-than-or-equal':
			return gte(column, filter.value)
		case 'less-than':
			return lt(column, filter.value)
		case 'less-than-or-equal':
			return lte(column, filter.value)
		case 'between':
			return between(column, filter.lower, filter.upper)
		case 'not-between':
			return notBetween(column, filter.lower, filter.upper)
		case 'in':
		case 'not-in':
			return compileMembership(filter.kind, filter.values, target)
		case 'list-empty':
			return eq(target.jsonb, jsonbParameter([]))
		case 'list-has':
			return compileListElementEquality(target, filter.value)
		case 'list-has-every':
			return (
				and(
					...filter.values.map((value) =>
						compileListElementEquality(target, value),
					),
				) ?? trueExpression
			)
		case 'list-has-some':
			return (
				or(
					...filter.values.map((value) =>
						compileListElementEquality(target, value),
					),
				) ?? falseExpression
			)
		case 'contains':
			return compileContains(filter.value, target)
		case 'has-key':
			assertStructuredTarget(target, 'key')
			return sql`${target.jsonb} ? ${filter.value}`
		case 'has-any-keys':
			assertStructuredTarget(target, 'key')
			return sql`${target.jsonb} ?| ${sql.param(filter.keys)}::text[]`
		case 'has-all-keys':
			assertStructuredTarget(target, 'key')
			return sql`${target.jsonb} ?& ${sql.param(filter.keys)}::text[]`
		case 'starts-with':
		case 'ends-with':
			return compileString(filter.kind, filter.value, target)
		case 'regex':
			return compileRegex(filter.pattern, target.field)
		case 'null':
			if (target.path !== undefined) {
				return (filter.isNull ? eq : ne)(target.jsonb, jsonbParameter(null))
			}

			return filter.isNull ? isNull(column) : isNotNull(column)
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

			return filter.kind === 'and'
				? (and(...expressions) ?? trueExpression)
				: (or(...expressions) ?? falseExpression)
		}
		case 'relation-count':
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
	relationCompiler?: PostgresRelationPredicateCompiler,
): SQL =>
	compileRuntimeFilter(filter as RuntimeFilter, schema, relationCompiler)
