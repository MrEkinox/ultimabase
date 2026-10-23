// auth's ready-made rules and default (D-10, D-62, D-79, D-83): each reads
// the caller only, and the record's stored keys (D-77).
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
/** The record's `one` relations, or any name outside a model's rules. */
type OwnerKey<Facts> = [Facts] extends [never]
	? string
	: Facts extends { readonly record: infer R }
		? { [P in keyof R]: R[P] extends Ref ? P : never }[keyof R]
		: Facts extends { readonly where: unknown }
			? 'a read rule has no record to own'
			: string

/** The facts it needs; a read rule's are refused on the name alone. */
type Owned<Facts, K extends string> = Facts extends { readonly where: unknown }
	? Facts
	: Facts & { readonly record: { readonly [P in K]: Ref } }

/**
 * The rule "the caller is the user this `one` relation points to" (D-79),
 * read from the stored key (D-77). Its facts come from where it is used, so
 * a wrong name fails on the name.
 */
export function isOwner<
	Facts extends { readonly caller: Caller },
	const K extends OwnerKey<Facts>,
>(field: K): (facts: Owned<Facts, K>) => boolean {
	return (facts) => {
		const { caller } = facts
		if (caller.kind !== 'user') return false
		const record: unknown = Reflect.get(facts, 'record')
		const owner: unknown =
			typeof record === 'object' && record !== null
				? Reflect.get(record, field)
				: undefined
		return (
			typeof owner === 'object' &&
			owner !== null &&
			Reflect.get(owner, 'id') === caller.user.id
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
