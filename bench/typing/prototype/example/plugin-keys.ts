// Plugin keys that change a model's shape (D-24): soft delete's
// `softDelete: true` adds `trash` and `restore` (D-15, D-17), and only the
// plugins in `use` give keys. `tsc` fails if a case does not hold.
import { UltimaBase, acl, memory, string } from '../index.ts'
import { App } from './app.ts'

const AclOnly = UltimaBase.create({ database: memory() }).use(acl())
const SetOn = App.defineModel({
	name: 'SetOn',
	softDelete: true,
	fields: { t: string() },
})
const SetOff = App.defineModel({ name: 'SetOff', fields: { t: string() } })
export const setTrash = await SetOn.with({
	acl: { ownerField: 't' },
	graphql: { name: 'S' },
}).trash.count()
export const setRestored = await SetOn.restore({ where: { id: 'x' } })
// @ts-expect-error: no `softDelete: true`, no trash.
export type SetNoTrash = typeof SetOff.trash
export const SetTypo = App.defineModel({
	name: 'SetTypo',
	// @ts-expect-error: Did you mean to write 'softDelete'?
	softDelet: true,
	fields: { t: string() },
})
export const NotInstalled = AclOnly.defineModel({
	name: 'NotInstalled',
	// @ts-expect-error: 'softDelete' is not a defineModel key of an installed plugin
	softDelete: true,
	fields: { t: string() },
})
export const NoGraphql = AclOnly.defineModel({
	name: 'NoGraphql',
	fields: { t: string() },
}).with({
	// @ts-expect-error: graphql() is not in `use`
	graphql: {},
})
export const BadOwner = SetOn.with({
	// @ts-expect-error: not a scalar field of the model
	acl: { ownerField: 'nope' },
})
