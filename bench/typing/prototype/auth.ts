// auth (D-33, D-62) owns the user model. Its `define<Kind>` entry,
// `defineUser`, builds an ordinary model with auth in its `use` (D-13).
import type { Caller, CallerRule, Register, UserOf } from './rules.ts'
import type { IndexShape } from './model.ts'
import type {
	FieldShapes,
	ModelFields,
	ModelIndexes,
	ModelOf,
	ModelUse,
	PluginOf,
	PluginTypes,
} from './ultimabase.ts'
import { definePlugin } from './ultimabase.ts'

interface Auth extends PluginTypes {
	readonly name: 'auth'
}

const authDefinition = definePlugin<Auth>({
	name: 'auth',
	manifest: { name: 'ultimabase-auth', version: '1.0.0' },
})
export const authPlugin: PluginOf<Auth> = authDefinition.plugin

type Uses = readonly ModelUse<string, PluginTypes>[]
/** The user model's `use`: auth first, then the developer's plugins. */
type WithAuth<U extends Uses> = readonly [ModelUse<'auth', Auth>, ...U]

/**
 * The application's one user model (D-62). Its code would call `defineModel`
 * with `[auth(), ...use]`; typing that body needs an assertion, since an
 * omitted `use` leaves `U` at its default only when nobody passes it.
 */
export declare function defineUser<
	const N extends string,
	const F extends FieldShapes,
	const U extends Uses = [],
	const X extends readonly IndexShape[] = [],
>(definition: {
	readonly name: N
	readonly use?: U
	readonly fields: ModelFields<F, WithAuth<U>>
	readonly indexes?: ModelIndexes<X, F, WithAuth<U>>
}): ModelOf<N, F, WithAuth<U>, X>

/** The rule "the caller is signed in" (D-10). */
export declare const isAuthenticated: CallerRule

/**
 * A rule for signed-in callers only, which receives `user` (D-79); it is
 * `false` for anyone else. Its facts come from where it is used, as `anyOf`'s
 * do; a read rule may still return a filter.
 */
export declare function signedIn<
	Facts extends { readonly caller: Caller },
	R extends boolean | object,
>(
	rule: (facts: Facts & { readonly user: UserOf<Register> }) => R,
): (facts: Facts) => R | false

/**
 * The rule "the caller is the user this `one` relation points to" (D-79),
 * read from the stored key (D-77); the field name is checked by the model.
 */
export declare function isOwner<const K extends string>(
	field: K,
): (facts: {
	readonly caller: Caller
	readonly record: { readonly [P in K]: { readonly id: string } | null }
}) => boolean

/** The rule "the caller is this record" (D-62). */
export declare function isSelf(facts: {
	readonly caller: Caller
	readonly record: { readonly id: string }
}): boolean

/**
 * The default "whoever creates the record" (D-53, D-62): the signed-in
 * caller's `{ id }`, no value otherwise. Its declared return type spares the
 * user model's own defaults the annotation.
 */
export declare function currentUser(facts: {
	readonly caller: Caller
}): { readonly id: string } | undefined
