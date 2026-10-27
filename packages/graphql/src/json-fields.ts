// A json field's types (D-125): exact from its schema's JSON Schema export,
// `JSON` without one. Read as `UserPrefs`, written as `UserPrefsInput`,
// filtered by `UserPrefsFilter`.
import type {
	GraphQLNullableInputType,
	GraphQLNullableOutputType,
} from 'graphql'
import { GraphQLInputObjectType, GraphQLList, GraphQLNonNull } from 'graphql'
import type { Path, Typed } from './data.ts'
import { fieldInput, fieldOutput } from './data.ts'
import { upper } from './names.ts'
import type { Args, Registry, Scalar } from './registry.ts'
import { JSONScalar, plain } from './scalars.ts'

const pathOf = (model: string, field: Scalar, suffix: string): Path => ({
	owner: `${model}.${field.name}`,
	name: `${model}${upper(field.name)}`,
	suffix,
	at: field.name,
})

const untyped = { type: JSONScalar, nullable: false }

/** `UserPrefs`, and whether the schema reads `null`. */
export function jsonOutput(
	registry: Registry,
	model: string,
	field: Scalar,
): Typed<GraphQLNullableOutputType> {
	const schema = registry.entry(model).exposed.validators[field.name]
	const path = pathOf(model, field, '')
	return (schema && fieldOutput(schema, path, registry.data)) ?? untyped
}

/** `UserPrefsInput`, and whether the schema takes `null`. */
export function jsonInput(
	registry: Registry,
	model: string,
	field: Scalar,
): Typed<GraphQLNullableInputType> {
	const schema = registry.entry(model).exposed.validators[field.name]
	const path = pathOf(model, field, 'Input')
	return (schema && fieldInput(schema, path, registry.data)) ?? untyped
}

/**
 * `UserPrefsFilter { equals, not, in, notIn }` on the input type; `JSONFilter`
 * when untyped, as `JSON` is given.
 */
export function jsonFilter(
	registry: Registry,
	model: string,
	field: Scalar,
	untypedFilter: () => GraphQLInputObjectType,
): GraphQLInputObjectType {
	const { type } = jsonInput(registry, model, field)
	if (type === JSONScalar) return untypedFilter()
	const name = `${model}${upper(field.name)}Filter`
	const list = new GraphQLList(new GraphQLNonNull(type))
	return registry.input(
		name,
		() =>
			new GraphQLInputObjectType({
				name,
				fields: {
					equals: { type },
					not: { type },
					in: { type: list },
					notIn: { type: list },
				},
			}),
	)
}

/** A written row's json and plugin values, their dates back to text. */
export function plainData(registry: Registry, model: string, data: Args): Args {
	const plained: { [field: string]: unknown } = { ...data }
	const { exposed, model: schema } = registry.entry(model)
	for (const field of schema.fields) {
		const value = plained[field.name]
		if (value === undefined || field.kind !== 'scalar') continue
		if (field.type === 'json' || exposed.fieldTypes[field.name] !== undefined) {
			plained[field.name] = plain(value)
		}
	}
	return plained
}

const each = (value: unknown, map: (where: Args) => Args): unknown =>
	Array.isArray(value)
		? value.map((item) => each(item, map))
		: typeof value === 'object' && value !== null
			? map({ ...value })
			: value

/** A filter's json operands, their dates back to text, through relations. */
export function plainWhere(
	registry: Registry,
	model: string,
	where: Args,
): Args {
	const fields = registry.entry(model).model.fields
	const plained: { [key: string]: unknown } = {}
	for (const [key, value] of Object.entries(where)) {
		const field = fields.find((candidate) => candidate.name === key)
		if (key === 'AND' || key === 'OR' || key === 'NOT') {
			plained[key] = each(value, (inner) => plainWhere(registry, model, inner))
		} else if (field?.kind === 'scalar') {
			plained[key] = field.type === 'json' ? plain(value) : value
		} else if (field !== undefined) {
			// `is`, `some` and the others each take the target's filter.
			plained[key] = each(value, (operators) =>
				Object.fromEntries(
					Object.entries(operators).map(([operator, inner]) => [
						operator,
						each(inner, (target) => plainWhere(registry, field.target, target)),
					]),
				),
			)
		} else plained[key] = value
	}
	return plained
}
