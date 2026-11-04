// A `oneOf` as the kernel stores it (D-247): a hidden optional `one` per
// kind, one of them set, or at most one when the field is optional. The
// targets' `many` naming the field pairs with its kind's hidden `one`.
import type { OneOfKey } from './adapter.ts'
import type { FieldDefinition, FieldOptions } from './definition.ts'
import { Refused } from './errors.ts'
import type { Linked } from './pairing.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'

type OneOfDefinition = Extract<FieldDefinition, { readonly kind: 'oneOf' }>

export type OneOfInfo = {
	readonly name: string
	readonly optional: boolean
	/** Each kind's hidden `one`, and the model it targets. */
	readonly kinds: ReadonlyMap<
		string,
		{ readonly field: string; readonly target: string }
	>
	readonly options: FieldOptions
}

/** A `oneOf` kind's key, no field of the caller's: its `oneOf` writes it. */
export const hiddenKey = (
	field: FieldInfo | undefined,
): field is Extract<FieldInfo, { readonly kind: 'one' }> & {
	readonly of: OneOfKey
} => field?.kind === 'one' && field.of !== undefined

/** The field a developer declared: a hidden `one`'s `oneOf`, else `field`. */
export function declaredName(model: ModelInfo, field: string): string {
	const known = model.fields.get(field)
	return hiddenKey(known) ? known.of.field : field
}

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
): { readonly info: OneOfInfo; readonly ones: readonly Linked[] } {
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
	const ones: Linked[] = []
	for (const [kind, thunk] of field.targets) {
		// Kind `post` of `target` stores its key as `targetPost`.
		const hidden = `${name}${kind.charAt(0).toUpperCase()}${kind.slice(1)}`
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
		ones.push({
			model,
			name: hidden,
			field: {
				kind: 'one',
				target: thunk,
				options: { optional: true, onDelete },
				...(field.rules === undefined ? {} : { rules: field.rules }),
			},
			target,
		})
	}
	return { info: { name, optional, kinds, options: field.options }, ones }
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
	const of = hiddenKey(one) ? one.of : undefined
	const key = of?.field ?? field
	const set: { [key: string]: string | null } = { [field]: to }
	for (const kind of model.oneOfs.get(key)?.kinds.values() ?? []) {
		if (kind.field !== field) set[kind.field] = null
	}
	const connect = to === null ? undefined : { id: to }
	const data =
		connect === undefined
			? { disconnect: true }
			: { connect: of === undefined ? connect : { [of.kind]: connect } }
	return { key, set, data: { [key]: data } }
}
