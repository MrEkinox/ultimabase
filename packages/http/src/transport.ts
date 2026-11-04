// What REST and GraphQL share besides pages (D-129, D-139): their errors as
// D-106 sends them, a model's names and fields, and a schema's JSON Schema.
import type { ExposedVirtual, SchemaField, SchemaModel } from 'ultimabase'
import { InvalidQuery, PublicError, Refused } from 'ultimabase'

/** An argument, a parameter or a body of the client's that the API refuses. */
export const badInput = (message: string, cause?: unknown): Error =>
	new PublicError('BAD_USER_INPUT', message, { cause })

/**
 * Runs a kernel query. The arguments come from the client's request, so
 * one the kernel refuses is the client's error, not the server's.
 */
export async function run<T>(query: () => Promise<T>): Promise<T> {
	try {
		return await query()
	} catch (error) {
		if (error instanceof InvalidQuery) {
			throw new PublicError('BAD_USER_INPUT', error.message, {
				details: { path: error.path },
				cause: error,
			})
		}
		throw error
	}
}

/** `post` → `posts`, `category` → `categories`, `box` → `boxes`. */
export function plural(name: string): string {
	if (/[^aeiou]y$/i.test(name)) return `${name.slice(0, -1)}ies`
	if (/(?:s|x|z|ch|sh)$/i.test(name)) return `${name}es`
	return `${name}s`
}

/** A model a transport serves, with its fields' read rules. */
export type Served = {
	readonly model: SchemaModel
	readonly exposed: {
		readonly readRules: { readonly [field: string]: 'private' | 'rule' }
		readonly virtuals: readonly ExposedVirtual[]
	}
}

/** The fields a client reads: no `private` one, for Master too (D-44). */
export const readable = (served: Served): readonly SchemaField[] =>
	served.model.fields.filter(
		(field) =>
			served.exposed.readRules[field.name] !== 'private' &&
			// A `oneOf`'s kinds are read through it (D-247).
			!(field.kind === 'one' && field.of !== undefined),
	)

type One = Extract<SchemaField, { readonly kind: 'one' }>

/** A `oneOf` as transports serve it: each kind with its hidden `one`. */
export type ServedOneOf = {
	readonly name: string
	readonly optional: boolean
	readonly kinds: readonly [Kind, ...Kind[]]
}
type Kind = { readonly kind: string; readonly field: One }

/** A model's `oneOf`s, gathered from their kinds' keys (D-247). */
export function oneOfsOf(model: SchemaModel): readonly ServedOneOf[] {
	const found = new Map<string, ServedOneOf & { kinds: [Kind, ...Kind[]] }>()
	for (const field of model.fields) {
		if (field.kind !== 'one' || field.of === undefined) continue
		const { field: name, kind, optional } = field.of
		const known = found.get(name)
		if (known === undefined) {
			found.set(name, { name, optional, kinds: [{ kind, field }] })
		} else known.kinds.push({ kind, field })
	}
	return [...found.values()]
}

/** The `oneOf`s a client reads, as `readable`. */
export const readableOneOfs = (served: Served): readonly ServedOneOf[] =>
	oneOfsOf(served.model).filter(
		({ name }) => served.exposed.readRules[name] !== 'private',
	)

/** The field a developer declared: a hidden `one`'s `oneOf`, else itself. */
export const declared = (field: SchemaField): string =>
	field.kind === 'one' && field.of !== undefined ? field.of.field : field.name

/**
 * A relation's way back as declared: its target's `oneOf` when the inverse
 * is a kind's key (D-247), `undefined` for a `one` without one (D-237).
 */
export const backOf = (
	field: SchemaField,
	target: SchemaModel,
): string | undefined =>
	field.kind === 'scalar'
		? undefined
		: target.fields
				.filter(({ name }) => name === field.inverse)
				.map(declared)[0]

/** The virtual fields a client reads, as `readable` (D-151). */
export const readableVirtuals = (served: Served): readonly ExposedVirtual[] =>
	served.exposed.virtuals.filter(
		(virtual) => served.exposed.readRules[virtual.name] !== 'private',
	)

/** A JSON Schema, or one of its nodes. */
export type Node = { readonly [key: string]: unknown }

export const isNode = (value: unknown): value is Node =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

/** A schema's JSON Schema, or startup stops naming `where` (D-45). */
export function jsonSchemaOf(
	schema: object,
	side: 'input' | 'output',
	where: string,
): Node {
	const standard: unknown = Reflect.get(schema, '~standard')
	const exporter = isNode(standard) ? standard['jsonSchema'] : undefined
	const exported = isNode(exporter) ? exporter[side] : undefined
	if (typeof exported !== 'function') {
		throw new Refused(`${where} has no standard JSON Schema export.`)
	}
	try {
		const node: unknown = Reflect.apply(exported, exporter, [
			{ target: 'draft-2020-12' },
		])
		if (isNode(node)) return node
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error)
		throw new Refused(`${where}: ${reason}.`, { cause: error })
	}
	throw new Refused(`${where}'s JSON Schema is not an object.`)
}
