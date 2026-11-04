// A json field's types (D-125): exact from its schema's JSON Schema export,
// `JSON` without one. Read as `UserPrefs`, written as `UserPrefsInput`, or as
// the scalar its schema names (D-190), filtered by `JSONFilter` as an untyped
// field (D-149). A plugin field reads as its shape says (D-152).
import type {
	GraphQLNullableInputType,
	GraphQLNullableOutputType,
} from 'graphql'
import type { ServedOneOf } from '@ultimabase/http/internal'
import { oneOfsOf } from '@ultimabase/http/internal'
import { maxFilterDepth } from 'ultimabase/internal'
import type { Path, Typed } from './data.ts'
import { dataType, scopesOf } from './data.ts'
import { exportOf } from './json-schema.ts'
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

/** `UserPrefs` or `PostCover`, and whether the schema reads `null`. */
export function jsonOutput(
	registry: Registry,
	model: string,
	field: Scalar,
): Typed<GraphQLNullableOutputType> {
	const { validators, fieldTypes } = registry.entry(model).exposed
	const schema = validators[field.name] ?? fieldTypes[field.name]?.shape
	const root = schema && exportOf(schema, 'output')
	if (root === undefined) return untyped
	const { output } = scopesOf(root, registry.data, true)
	return dataType(root, pathOf(model, field, ''), output)
}

/** `UserPrefsInput`, and whether the schema takes `null`. */
export function jsonInput(
	registry: Registry,
	model: string,
	field: Scalar,
): Typed<GraphQLNullableInputType> {
	const schema = registry.entry(model).exposed.validators[field.name]
	const root = schema && exportOf(schema, 'input')
	if (root === undefined) return untyped
	const { input } = scopesOf(root, registry.data, true)
	return dataType(root, pathOf(model, field, 'Input'), input)
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

/**
 * A filter's json operands, their dates back to text, through relations.
 * Past the deepest level, it is left as is, for the kernel to refuse
 * (D-228).
 */
export function plainWhere(
	registry: Registry,
	model: string,
	where: Args,
	depth = 1,
): Args {
	if (depth > maxFilterDepth) return where
	const schema = registry.entry(model).model
	const plained: { [key: string]: unknown } = {}
	for (const [key, value] of Object.entries(where)) {
		const field = schema.fields.find((candidate) => candidate.name === key)
		const oneOf = oneOfsOf(schema).find((candidate) => candidate.name === key)
		if (key === 'AND' || key === 'OR' || key === 'NOT') {
			plained[key] = each(value, (inner) =>
				plainWhere(registry, model, inner, depth + 1),
			)
		} else if (field?.kind === 'scalar') {
			plained[key] = field.type === 'json' ? plain(value) : value
		} else if (field !== undefined) {
			// `is`, `some` and the others each take the target's filter.
			plained[key] = each(value, (operators) =>
				Object.fromEntries(
					Object.entries(operators).map(([operator, inner]) => [
						operator,
						each(inner, (target) =>
							plainWhere(registry, field.target, target, depth + 1),
						),
					]),
				),
			)
		} else if (oneOf !== undefined) {
			plained[key] = plainOneOf(registry, oneOf, value, depth)
		} else plained[key] = value
	}
	return plained
}

/**
 * A `oneOf`'s filter (D-247): `is` and `isNot` its first kind's, the shared
 * fields being the same in each, and each kind its target's relation filter.
 */
function plainOneOf(
	registry: Registry,
	oneOf: ServedOneOf,
	value: unknown,
	depth: number,
): unknown {
	const [first] = oneOf.kinds
	const targets = new Map(
		oneOf.kinds.map(({ kind, field }) => [kind, field.target]),
	)
	const within = (target: string) => (inner: unknown) =>
		each(inner, (where) => plainWhere(registry, target, where, depth + 1))
	return each(value, (operators) =>
		Object.fromEntries(
			Object.entries(operators).map(([operator, inner]) => {
				const target = targets.get(operator)
				if (target !== undefined) {
					return [
						operator,
						each(inner, (relation) => plainRelation(relation, within(target))),
					]
				}
				if (operator === 'kind') return [operator, inner]
				return [operator, within(first.field.target)(inner)]
			}),
		),
	)
}

const plainRelation = (relation: Args, within: (inner: unknown) => unknown) =>
	Object.fromEntries(
		Object.entries(relation).map(([operator, inner]) => [
			operator,
			within(inner),
		]),
	)
