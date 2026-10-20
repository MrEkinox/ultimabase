// auth (D-33, D-62) owns the user model. Its `define<Kind>` entry,
// `defineUser`, builds an ordinary model with auth in its `use` (D-13).
import type { Caller } from './rules.ts'
import type {
	FieldShapes,
	ModelFields,
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
>(definition: {
	readonly name: N
	readonly use?: U
	readonly fields: ModelFields<F, WithAuth<U>>
}): ModelOf<N, F, WithAuth<U>>

/** The rule "the caller is this record" (D-62). */
export declare function isSelf(facts: {
	readonly caller: Caller
	readonly record: { readonly id: string }
}): boolean
