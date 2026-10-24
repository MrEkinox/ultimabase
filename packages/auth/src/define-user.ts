// auth's `define<Kind>` entry (D-13, D-62): the application's one user model,
// an ordinary model with auth first in its `use`.
import type {
	FieldShapes,
	IndexShape,
	ModelFields,
	ModelIndexes,
	ModelOf,
	ModelUse,
	PluginTypes,
} from 'ultimabase'
import { defineModel } from 'ultimabase'
import type { Auth } from './plugin.ts'
import { authUse, userModels } from './plugin.ts'

type Uses = readonly ModelUse<string, PluginTypes>[]
/** The user model's `use`: auth first, then the developer's plugins. */
type WithAuth<U extends Uses> = readonly [ModelUse<'auth', Auth>, ...U]

/** The application's one user model (D-62). */
export function defineUser<
	const N extends string,
	const F extends FieldShapes,
	const U extends Uses = [],
	const X extends readonly IndexShape[] = [],
>(definition: {
	readonly name: N
	/** The stored table's or collection's name (D-63). */
	readonly dbName?: string
	readonly use?: U
	readonly fields: ModelFields<F, WithAuth<U>>
	readonly indexes?: ModelIndexes<X, F, WithAuth<U>>
}): ModelOf<N, F, WithAuth<U>, X> {
	const model: object = defineModel({
		...definition,
		use: [authUse(), ...(definition.use ?? [])],
	})
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- defineModel's own model, with auth in its use; an omitted `use` leaves `U` at its default only when nobody passes it (D-62).
	const user = model as ModelOf<N, F, WithAuth<U>, X>
	userModels.set(model, user.nullable())
	return user
}
