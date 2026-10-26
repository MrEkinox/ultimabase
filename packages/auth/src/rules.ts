// auth's ready-made rules and default (D-10, D-62, D-79, D-83): each reads
// the caller, the record's stored keys (D-77) and the value written.
import type { Caller, CallerRule, Register, UserOf } from 'ultimabase'

/** The rule "the caller is signed in" (D-10). */
export const isAuthenticated: CallerRule = ({ caller }) =>
	caller.kind === 'user'

/**
 * A rule for signed-in callers only, which receives `user` (D-79); it is
 * `false` for anyone else. Its facts come from where it is used, as `anyOf`'s
 * do; a read rule may still return a filter.
 */
export function signedIn<
	Facts extends { readonly caller: Caller },
	R extends boolean | object,
>(
	rule: (facts: Facts & { readonly user: UserOf<Register> }) => R,
): (facts: Facts) => R | false {
	return (facts) =>
		facts.caller.kind === 'user'
			? rule({ ...facts, user: facts.caller.user })
			: false
}

type Ref = { readonly id: string } | null
type Connected = { readonly connect: { readonly id: string } }
type Keys<V, Shape> = {
	[P in keyof V]-?: NonNullable<V[P]> extends Shape ? P : never
}[keyof V]
/** The relations a write may connect, which may also create (D-128). */
type Connects<V> = {
	[P in keyof V]-?: [Extract<NonNullable<V[P]>, Connected>] extends [never]
		? never
		: P
}[keyof V]
/**
 * The record's `one` relations, those a create connects, or any name outside
 * a model's rules.
 */
type OwnerKey<Facts> = [Facts] extends [never]
	? string
	: Facts extends { readonly record: infer R }
		? Keys<R, Ref>
		: Facts extends { readonly where: unknown }
			? 'a read rule has no record to own'
			: Facts extends { readonly value: infer V }
				? Connects<V>
				: string

/** The facts it needs; a read rule's are refused on the name alone. */
type Owned<Facts, K extends string> = Facts extends { readonly where: unknown }
	? Facts
	: Facts extends { readonly record: unknown }
		? Facts & { readonly record: { readonly [P in K]: Ref } }
		: Facts extends { readonly value: unknown }
			? Facts
			: Facts & { readonly record: { readonly [P in K]: Ref } }

const get = (value: unknown, key: string): unknown =>
	typeof value === 'object' && value !== null
		? Reflect.get(value, key)
		: undefined

/**
 * The rule "the caller is the user this `one` relation points to, before and
 * after the write" (D-79): the stored key (D-77) when there is one, and the
 * value written, which may only connect the caller. A create that does not
 * write the relation leaves it to its default. Its facts come from where it
 * is used, so a wrong name fails on the name.
 */
export function isOwner<
	Facts extends { readonly caller: Caller },
	const K extends OwnerKey<Facts>,
>(field: K): (facts: Owned<Facts, K>) => boolean {
	return (facts) => {
		const { caller } = facts
		if (caller.kind !== 'user') return false
		const record = get(facts, 'record')
		if (
			record !== undefined &&
			get(get(record, field), 'id') !== caller.user.id
		)
			return false
		const written = get(get(facts, 'value'), field)
		return (
			written === undefined ||
			get(get(written, 'connect'), 'id') === caller.user.id
		)
	}
}

/** The rule "the caller is this record" (D-62). */
export function isSelf(facts: {
	readonly caller: Caller
	readonly record: { readonly id: string }
}): boolean {
	return (
		facts.caller.kind === 'user' && facts.caller.user.id === facts.record.id
	)
}

/**
 * The default "whoever creates the record" (D-53, D-62): the signed-in
 * caller's `{ id }`, no value otherwise. Its declared return type spares the
 * user model's own defaults the annotation.
 */
export function currentUser(facts: {
	readonly caller: Caller
}): { readonly id: string } | undefined {
	return facts.caller.kind === 'user' ? { id: facts.caller.user.id } : undefined
}
