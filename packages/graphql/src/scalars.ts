// `DateTime` and `JSON` (D-107): a date as an ISO 8601 string, and any JSON
// value as the kernel stores it.
import type { ConstValueNode } from 'graphql'
import { GraphQLError, GraphQLScalarType, Kind } from 'graphql'

const iso =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/

function date(value: unknown): Date {
	if (typeof value === 'string' && iso.test(value)) {
		const parsed = new Date(value)
		if (!Number.isNaN(parsed.getTime())) return parsed
	}
	throw new GraphQLError(
		'A DateTime is an ISO 8601 string, such as 2026-01-31T12:00:00.000Z.',
	)
}

export const DateTime: GraphQLScalarType<Date, string> = new GraphQLScalarType<
	Date,
	string
>({
	name: 'DateTime',
	description: 'A date and time, as an ISO 8601 string.',
	coerceOutputValue: (value) => {
		if (value instanceof Date) return value.toISOString()
		throw new GraphQLError('A DateTime field returned no date.')
	},
	coerceInputValue: date,
	coerceInputLiteral: (node) =>
		date(node.kind === Kind.STRING ? node.value : undefined),
})

/** A literal as the plain value the kernel's JSON check accepts. */
function literal(node: ConstValueNode): unknown {
	if (node.kind === Kind.OBJECT) {
		return Object.fromEntries(
			node.fields.map((field) => [field.name.value, literal(field.value)]),
		)
	}
	if (node.kind === Kind.LIST) return node.values.map(literal)
	if (node.kind === Kind.INT || node.kind === Kind.FLOAT) {
		return Number(node.value)
	}
	if (node.kind === Kind.NULL) return null
	// A string, a boolean or an enum's name.
	return node.value
}

export const JSONScalar: GraphQLScalarType<unknown, unknown> =
	new GraphQLScalarType<unknown, unknown>({
		name: 'JSON',
		description: 'Any JSON value.',
		coerceOutputValue: (value) => value,
		coerceInputValue: (value) => value,
		coerceInputLiteral: literal,
	})
