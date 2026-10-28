// `DateTime` and `JSON` (D-107): a date as an ISO 8601 string, and any JSON
// value as the kernel stores it; `Decimal` (D-145), an exact number, and
// `Date` (D-150), a day, as strings, which the kernel checks.
import type { ConstValueNode } from 'graphql'
import { GraphQLError, GraphQLScalarType, Kind } from 'graphql'

const iso =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/

/** A date a client sent, which keeps its text for a function (D-109). */
export class SentDate extends Date {
	readonly sent: string

	constructor(sent: string) {
		super(sent)
		this.sent = sent
	}
}

function date(value: unknown): Date {
	if (typeof value === 'string' && iso.test(value)) {
		const parsed = new SentDate(value)
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
		// A function's schema output holds its dates as strings (D-109).
		if (typeof value === 'string') return date(value).toISOString()
		throw new GraphQLError('A DateTime field returned no date.')
	},
	coerceInputValue: date,
	coerceInputLiteral: (node) =>
		date(node.kind === Kind.STRING ? node.value : undefined),
})

function decimal(value: unknown): string {
	if (typeof value === 'string') return value
	throw new GraphQLError("A Decimal is a string, such as '12.50'.")
}

export const DecimalScalar: GraphQLScalarType<string, string> =
	new GraphQLScalarType<string, string>({
		name: 'Decimal',
		description: "An exact number, as a string such as '12.50'.",
		coerceOutputValue: decimal,
		coerceInputValue: decimal,
		coerceInputLiteral: (node) =>
			decimal(node.kind === Kind.STRING ? node.value : undefined),
	})

function day(value: unknown): string {
	if (typeof value === 'string') return value
	throw new GraphQLError("A Date is a day as a string, such as '2026-07-31'.")
}

export const DateScalar: GraphQLScalarType<string, string> =
	new GraphQLScalarType<string, string>({
		name: 'Date',
		description: "A day, as an ISO 8601 string such as '2026-07-31'.",
		coerceOutputValue: day,
		coerceInputValue: day,
		coerceInputLiteral: (node) =>
			day(node.kind === Kind.STRING ? node.value : undefined),
	})

/** Dates back to their text: a validator reads what the client sent. */
export function plain(value: unknown): unknown {
	if (value instanceof SentDate) return value.sent
	if (Array.isArray(value)) return value.map(plain)
	if (typeof value !== 'object' || value === null) return value
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [key, plain(item)]),
	)
}

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
