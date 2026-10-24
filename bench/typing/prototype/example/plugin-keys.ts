// What a model's `use` gives (D-24): soft delete adds `trash` and `restore`
// (D-15, D-17), and only the plugins in `use` give `.with` keys. `defineApp`
// refuses a used plugin missing from `plugins` and a relation target missing
// from `models`. `tsc` fails if a case does not hold.
import {
	acl,
	aclPlugin,
	authPlugin,
	defineApp,
	defineModel,
	graphql,
	graphqlPlugin,
	httpPlugin,
	memory,
	softDelete,
	softDeletePlugin,
} from '../index.ts'
import { Post } from './post.ts'
import { User } from './user.ts'

const SetOn = defineModel({
	name: 'SetOn',
	use: [softDelete(), acl(), graphql()],
	fields: (f) => ({ t: f.string() }),
})
const SetOff = defineModel({
	name: 'SetOff',
	fields: (f) => ({ t: f.string() }),
})
export const setTrash = await SetOn.with({
	acl: { ownerField: 't' },
	graphql: { name: 'S' },
}).trash.count()
export const setRestored = await SetOn.restore({ where: { id: 'x' } })
// @ts-expect-error: no `softDelete()` in `use`, no trash.
export type SetNoTrash = typeof SetOff.trash
export const NoAcl = SetOff.with({
	// @ts-expect-error: no `acl()` in `use`, no `acl` key.
	acl: { ownerField: 't' },
})
export const BadOwner = SetOn.with({
	// @ts-expect-error: not a scalar field of the model
	acl: { ownerField: 'nope' },
})

// @ts-expect-error: a model uses 'softDelete', which is not in plugins
export const MissingPlugin = defineApp({
	database: memory(),
	plugins: [aclPlugin(), graphqlPlugin()],
	models: [SetOn],
})
// @ts-expect-error: a relation points to 'Tag', which is not in models
export const MissingModel = defineApp({
	database: memory(),
	plugins: [
		softDeletePlugin(),
		aclPlugin(),
		graphqlPlugin(),
		httpPlugin(),
		authPlugin(),
	],
	models: [Post, User],
})
export const Plain = defineApp({ database: memory(), models: [SetOff] })
