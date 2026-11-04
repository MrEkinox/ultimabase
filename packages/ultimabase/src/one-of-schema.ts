// A `oneOf` as the kernel stores it (D-247): a hidden optional `one` per
// kind, one of them set, or at most one when the field is optional. The
// targets' `many` naming the field pairs with its kind's hidden `one`.
import type { OneOfKey } from './adapter.ts'
import type { FieldDefinition, FieldOptions } from './definition.ts'
import { Refused } from './errors.ts'
import type { Linked } from './pairing.ts'
import type { ModelInfo } from './schema.ts'

type OneOfDefinition = Extract<FieldDefinition, { readonly kind: 'oneOf' }>
type OneDefinition = Extract<
	FieldDefinition,
	{ readonly kind: 'one' | 'many' | 'exists' }
>

export type OneOfInfo = {
	readonly name: string
	readonly optional: boolean
	readonly onDelete: 'cascade' | 'restrict' | 'setNull'
	/** Each kind's hidden `one`, and the model it targets. */
	readonly kinds: ReadonlyMap<
		string,
		{ readonly field: string; readonly target: string }
	>
	readonly options: FieldOptions
}

/** The field a developer declared: a hidden `one`'s `oneOf`, else `field`. */
export function declaredName(model: ModelInfo, field: string): string {
	const known = model.fields.get(field)
	return known?.kind === 'one' && known.of !== undefined
		? known.of.field
		: field
}

/** A kind's hidden `one`, `targetPost` for kind `post` of `target`. */
export const hiddenOf = (name: string, kind: string): string =>
	`${name}${kind.charAt(0).toUpperCase()}${kind.slice(1)}`

const unsupported = ['within', 'unique', 'default', 'dbName', 'from', 'inverse']

function fail(message: string): never {
	throw new Refused(message)
}

/**
 * The hidden `one` of each kind of `field`, its target resolved by
 * `targetOf`; stops startup on an option a `oneOf` does not take.
 */
export function oneOfOf(
	model: string,
	name: string,
	field: OneOfDefinition,
	declared: ReadonlyMap<string, unknown>,
	targetOf: (kind: string, target: () => unknown) => string,
): {
	readonly info: OneOfInfo
	readonly ones: readonly (Linked & { readonly of: OneOfKey })[]
} {
	const where = `${model}.${name}`
	for (const option of unsupported) {
		if (field.options[option] !== undefined) {
			fail(`${where}: a oneOf takes no ${option}.`)
		}
	}
	const optional = field.options['optional'] === true
	const asked = field.options['onDelete']
	if (asked === 'setNull' && !optional) {
		fail(`${where}: setNull needs an optional relation.`)
	}
	const onDelete =
		asked === 'cascade' || asked === 'restrict' || asked === 'setNull'
			? asked
			: optional
				? 'setNull'
				: 'restrict'
	const kinds = new Map<string, { field: string; target: string }>()
	const ones: (Linked & { readonly of: OneOfKey })[] = []
	for (const [kind, thunk] of field.targets) {
		const hidden = hiddenOf(name, kind)
		if (declared.has(hidden)) {
			fail(
				`${where}: kind ${kind} stores its key as ${hidden}, a field of ${model}.`,
			)
		}
		const target = targetOf(kind, thunk)
		const twin = [...kinds].find(([, other]) => other.target === target)
		if (twin !== undefined) {
			fail(`${where}: kinds ${twin[0]} and ${kind} both target ${target}.`)
		}
		kinds.set(kind, { field: hidden, target })
		const one: OneDefinition = {
			kind: 'one',
			target: thunk,
			options: { optional: true, onDelete },
			...(field.rules === undefined ? {} : { rules: field.rules }),
		}
		ones.push({
			model,
			name: hidden,
			field: one,
			target,
			of: { field: name, kind, optional },
		})
	}
	return {
		info: { name, optional, onDelete, kinds, options: field.options },
		ones,
	}
}

/**
 * A target's `many` naming a `oneOf` with `inverse`, made to name the
 * hidden `one` of its kind; any other link as it is.
 */
export function facing(
	link: Linked,
	oneOfs: ReadonlyMap<string, ReadonlyMap<string, OneOfInfo>>,
): Linked {
	const { field } = link
	const named = field.options['inverse']
	const info =
		typeof named === 'string' ? oneOfs.get(link.target)?.get(named) : undefined
	if (field.kind !== 'many' || info === undefined) return link
	const where = `${link.model}.${link.name}`
	for (const option of ['within', 'size']) {
		if (field.options[option] !== undefined) {
			fail(`${where}: a many facing a oneOf takes no ${option}.`)
		}
	}
	const kind = [...info.kinds.values()].find((k) => k.target === link.model)
	if (kind === undefined) {
		fail(`${where}: ${link.target}.${info.name} has no kind of ${link.model}.`)
	}
	return {
		...link,
		field: { ...field, options: { ...field.options, inverse: kind.field } },
	}
}

/**
 * A move from the other side (D-78): the keys it sets, a kind's emptying
 * the other kinds', and its data as hooks and rules see it, by the field
 * they know.
 */
export function moveOf(
	model: ModelInfo,
	field: string,
	to: string | null,
): {
	readonly key: string
	readonly set: { readonly [key: string]: string | null }
	readonly data: { readonly [key: string]: unknown }
} {
	const one = model.fields.get(field)
	const of = one?.kind === 'one' ? one.of : undefined
	const info = of === undefined ? undefined : model.oneOfs.get(of.field)
	const set: { [key: string]: string | null } = { [field]: to }
	const connect = to === null ? undefined : { id: to }
	if (of === undefined || info === undefined) {
		const data = connect === undefined ? { disconnect: true } : { connect }
		return { key: field, set, data: { [field]: data } }
	}
	for (const kind of info.kinds.values()) {
		if (kind.field !== field) set[kind.field] = null
	}
	const data =
		connect === undefined
			? { disconnect: true }
			: { connect: { [of.kind]: connect } }
	return { key: of.field, set, data: { [of.field]: data } }
}
