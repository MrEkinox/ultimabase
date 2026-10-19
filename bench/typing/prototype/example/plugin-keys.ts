// D-24's two options for plugin keys that change a model's shape: soft
// delete's `softDelete: true` adds `trash` and `restore` (D-15, D-17).
// `tsc` fails if a case does not hold.
import { defineModel, string } from '../index.ts'
import { acl, postgres, softDelete } from '../plugin-values.ts'
import { UltimaBase } from '../use.ts'

// Option B: each plugin adds its keys to global interfaces (plugins.ts).
const GlobalOn = defineModel({
	name: 'GlobalOn',
	softDelete: true,
	fields: { t: string() },
})
const GlobalOff = defineModel({ name: 'GlobalOff', fields: { t: string() } })
export const globalTrash = await GlobalOn.with({
	postgres: { table: 'g' },
}).trash.findMany({
	where: { t: { equals: 'x' } },
})
export const globalRestored = await GlobalOn.restore({ where: { id: 'x' } })
// @ts-expect-error: no `softDelete: true`, no trash.
export type GlobalNoTrash = typeof GlobalOff.trash
export const GlobalTypo = defineModel({
	name: 'GlobalTypo',
	// @ts-expect-error: Did you mean to write 'softDelete'?
	softDelet: true,
	fields: { t: string() },
})

// Option A: models are declared from the plugin set.
const App = UltimaBase.use(
	softDelete(),
	acl(),
	postgres({ url: 'postgres://x' }),
)
const AclOnly = UltimaBase.use(acl())
const SetOn = App.defineModel({
	name: 'SetOn',
	softDelete: true,
	fields: { t: string() },
})
const SetOff = App.defineModel({ name: 'SetOff', fields: { t: string() } })
export const setTrash = await SetOn.with({
	acl: { ownerField: 't' },
	postgres: { table: 's' },
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
export const NoPostgres = AclOnly.defineModel({
	name: 'NoPostgres',
	fields: { t: string() },
}).with({
	// @ts-expect-error: postgres() is not installed
	postgres: {},
})
export const BadOwner = SetOn.with({
	// @ts-expect-error: not a scalar field of the model
	acl: { ownerField: 'nope' },
})
