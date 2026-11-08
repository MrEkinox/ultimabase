// A relation's target, and `AppUser` (D-110, D-333): a plugin's own model
// relates to models of the same plugin, and to the application's user model,
// which it names `AppUser` before `defineUser` exists. Startup resolves
// `AppUser` to the model a `userModel` plugin is used by.
import { defineModel } from './define-model.ts'
import type { ModelDefinition } from './definition.ts'
import type { ModelOf } from './define-model.ts'
import { Refused } from './errors.ts'

/** The application's user model, for a plugin's own model to relate to. */
export const AppUser: ModelOf<
	'AppUser',
	// oxlint-disable-next-line typescript/no-generated-empty-object-type -- no fields, the user model's stand-in
	Record<never, never>,
	[]
> = defineModel({ name: 'AppUser', fields: () => ({}) })

/** The name of the model a relation `name` of `model` targets with `value`. */
export type TargetOf = (model: string, name: string, value: unknown) => string

/** How the models resolve their targets, or startup stops with a message. */
export function targetsOf(
	definitions: ReadonlyMap<string, ModelDefinition>,
	names: ReadonlyMap<object, string>,
	owners: ReadonlyMap<string, string | undefined>,
): TargetOf {
	if (names.has(AppUser)) {
		throw new Refused(
			'models lists AppUser, which stands for the user model; list the user model instead.',
		)
	}
	// Two user models stop startup further on (D-189).
	const [user] = [...definitions]
		.filter(([, definition]) =>
			definition.uses.some((use) => use.code.userModel),
		)
		.map(([name]) => name)
	return (model, name, value) => {
		const at = `${model}.${name}`
		if (value === AppUser) {
			const owner = owners.get(model)
			if (owner === undefined) {
				throw new Refused(
					`${at}: relate to ${user ?? 'the user model'} itself, not to AppUser.`,
				)
			}
			if (user === undefined) {
				throw new Refused(
					`${at}: the ${owner} plugin needs the application's user model, and none is declared.`,
				)
			}
			return user
		}
		const target =
			typeof value === 'object' && value !== null ? names.get(value) : undefined
		if (target === undefined) {
			throw new Refused(`${at}: its target is not in models.`)
		}
		if (owners.get(model) !== owners.get(target)) {
			throw new Refused(
				`${at}: a plugin's model relates only to models of the same plugin, and to AppUser.`,
			)
		}
		return target
	}
}
