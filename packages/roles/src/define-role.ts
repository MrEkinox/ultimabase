// `defineRole` (D-13, D-123): the application's one role model, an ordinary
// model with a unique name, its members, and the roles it inherits.
import type {
	Field,
	FieldShapes,
	IndexShape,
	Many,
	ModelFields,
	ModelIndexes,
	ModelOf,
	ModelUse,
	PluginTypes,
} from 'ultimabase'
import { defineModel, Refused } from 'ultimabase'
import type { Roles } from './plugin.ts'
import { roleModels, rolesUse } from './plugin.ts'

type Uses = readonly ModelUse<string, PluginTypes>[]
/** The role model's `use`: roles first, then the developer's plugins. */
type WithRoles<U extends Uses> = readonly [ModelUse<'roles', Roles>, ...U]

/** The fields `defineRole` adds; `R` is the role model's own thunk. */
export type RoleFields<M, R> = {
	readonly name: Field<string, { readonly unique: true }>
	readonly members: Many<M, { readonly inverse?: string }>
	readonly inherits: Many<R, { readonly inverse: 'inheritedBy' }>
	readonly inheritedBy: Many<R, { readonly inverse: 'inherits' }>
}

/** The role model, typed through an interface: it refers to itself. */
export interface RoleThunk<
	N extends string,
	F,
	M,
	U extends Uses,
	X extends readonly IndexShape[],
> {
	(): ModelOf<N, F & RoleFields<M, RoleThunk<N, F, M, U, X>>, WithRoles<U>, X>
}

const reserved = ['name', 'members', 'inherits', 'inheritedBy']

/** What every role model declares; `F` types `indexes` only. */
type RoleDefinition<N, M, F, U extends Uses, X> = {
	readonly name: N
	/** The stored table's or collection's name (D-63). */
	readonly dbName?: string
	/** The user model, `() => User`. */
	readonly members: M
	readonly use?: U
	// Checked on the scalar fields only: the role model's own type would
	// infer `X` from itself.
	readonly indexes?: ModelIndexes<
		X,
		F & RoleFields<M, () => object>,
		WithRoles<U>
	>
}

/** The application's one role model, with its own fields (D-123). */
export function defineRole<
	const N extends string,
	const M extends () => object,
	const F extends FieldShapes,
	const U extends Uses = [],
	const X extends readonly IndexShape[] = [],
>(
	definition: RoleDefinition<N, M, F, U, X> & {
		readonly fields: ModelFields<F, WithRoles<U>>
	},
): ReturnType<RoleThunk<N, F, M, U, X>>
/** The application's one role model, without fields of its own (D-123). */
export function defineRole<
	const N extends string,
	const M extends () => object,
	const U extends Uses = [],
	const X extends readonly IndexShape[] = [],
>(
	definition: RoleDefinition<N, M, {}, U, X>,
): ReturnType<RoleThunk<N, {}, M, U, X>>
export function defineRole(definition: {
	readonly name: string
	readonly dbName?: string
	readonly members: unknown
	readonly use?: Uses
	readonly fields?: Function
	readonly indexes?: readonly IndexShape[]
}): object {
	const { name, members, fields } = definition
	if (typeof members !== 'function') {
		throw new Refused(`defineRole(${name}): members is () => the user model.`)
	}
	const self = (): object => model
	const model: object = defineModel<
		string,
		FieldShapes,
		Uses,
		readonly IndexShape[]
	>({
		name,
		...(definition.dbName === undefined ? {} : { dbName: definition.dbName }),
		use: [rolesUse(), ...(definition.use ?? [])],
		fields: (f) => {
			// The developer's fields, typed by its own `use`.
			const own: unknown =
				fields === undefined ? {} : Reflect.apply(fields, undefined, [f])
			if (typeof own !== 'object' || own === null) {
				throw new Refused(`defineRole(${name}): fields returns an object.`)
			}
			const taken = reserved.find((key) => Object.hasOwn(own, key))
			if (taken !== undefined) {
				throw new Refused(
					`defineRole(${name}): ${taken} is a field defineRole adds.`,
				)
			}
			return {
				...own,
				name: f.string({ unique: true }),
				members: f.many(members),
				inherits: f.many(self, { inverse: 'inheritedBy' }),
				inheritedBy: f.many(self, { inverse: 'inherits' }),
			}
		},
		indexes: definition.indexes ?? [],
	})
	roleModels.add(model)
	return model
}
