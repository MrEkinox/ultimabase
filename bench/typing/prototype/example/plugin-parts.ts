// D-57 stress test, part two: the plugin parts D-15, D-16 and D-32 list.
import type {
	Field,
	ScalarOptions,
} from '../../../../packages/ultimabase/src/fields.ts'
import type {
	PluginOf,
	PluginTypes,
	UseOf,
} from '../../../../packages/ultimabase/src/plugin.ts'
import {
	acl,
	aclPlugin,
	defineApp,
	defineModel,
	memory,
	softDelete,
	softDeletePlugin,
} from '../index.ts'
import type {
	Queries,
	UniqueWhere,
} from '../../../../packages/ultimabase/src/query.ts'
import type { RecordOf } from '../../../../packages/ultimabase/src/record.ts'
import { definePlugin } from '../../../../packages/ultimabase/src/plugin.ts'

// Each plugin's `package.json`, imported with `with { type: 'json' }`: only
// `name`, `version` and `peerDependencies` are read (D-57).
declare const manifest: {
	name: string
	version: string
	type: string
	peerDependencies: { ultimabase: string }
	devDependencies: { typescript: string }
}

// A stand-in for the plugin's runtime, as for soft delete.
declare function markArchived<F>(
	queries: Queries<F>,
	where: UniqueWhere<F>,
): Promise<RecordOf<F>>

// 6a: the rules of the model's plugins on a field's `.with`, typed by the
// field's value (D-12): `fields` is a callback whose builders know `use`.
export const Secret = defineModel({
	name: 'Secret',
	use: [acl()],
	fields: (f) => ({
		code: f.string().with({ acl: { check: (value) => value.length > 4 } }),
		level: f.number().with({
			access: { read: ({ caller }) => caller.kind === 'master' },
			acl: { roles: ['admin'], check: (value) => value > 0 },
		}),
		note: f.string().with<{ level: number }>({
			access: { read: ({ record }) => record.level > 1 },
			acl: { roles: ['admin'] },
		}),
		owner: f.one(() => Shop).with({ acl: { roles: ['admin'] } }),
	}),
})
// Destructured, and written before `use`.
export const Badge = defineModel({
	name: 'Badge',
	fields: ({ string }) => ({ code: string().with({ acl: { roles: ['hr'] } }) }),
	use: [acl()],
})
defineModel({
	name: 'Wrong',
	use: [acl()],
	fields: ({ string }) => ({
		// @ts-expect-error: the value is a string.
		code: string().with({ acl: { check: (value) => value > 0 } }),
		// @ts-expect-error: `softDelete` has no field rules.
		name: string().with({ softDelete: {} }),
		// @ts-expect-error: no plugin is named `search`.
		tag: string().with({ search: { weight: 2 } }),
	}),
})
defineModel({
	name: 'NoUse',
	fields: ({ string }) => ({
		// @ts-expect-error: without `use`, a field takes `access` only.
		code: string().with({ acl: { roles: ['admin'] } }),
	}),
})
defineModel({
	name: 'Plain',
	// @ts-expect-error: `fields` is a callback, its only form.
	fields: { code: 'string' },
})

// 6b: a plugin provides a field type (D-32); its plugin must be installed.
interface GeoPoint {
	readonly lat: number
	readonly lng: number
}
declare function geoPoint<
	const O extends ScalarOptions<GeoPoint> = ScalarOptions<GeoPoint>,
>(options?: O): Field<GeoPoint, O, 'geo'>
interface Geo extends PluginTypes {
	readonly name: 'geo'
}
const geoDefinition = definePlugin<Geo>({ name: 'geo', manifest })
export const geoPlugin: PluginOf<Geo> = geoDefinition.plugin
export const Shop = defineModel({
	name: 'Shop',
	fields: (f) => ({ name: f.string(), place: geoPoint({ optional: true }) }),
})
export async function nearby(): Promise<number | undefined> {
	const shop = await Shop.findUnique({ where: { id: '1' } })
	// @ts-expect-error: `place` is optional, so it may be null.
	void shop?.place.lat
	return shop?.place?.lat
}
void Shop.findMany({ where: { place: { equals: { lat: 1, lng: 2 } } } })
defineApp({ database: memory(), plugins: [geoPlugin()], models: [Shop] })
// @ts-expect-error: `Shop.place` needs the geo plugin.
defineApp({ database: memory(), models: [Shop] })

// 6c, 6d, 6e: `redirect`, several requirements, an optional plugin, and the
// application options read at start.
interface Auth extends PluginTypes {
	readonly name: 'auth'
	readonly api: { currentUserId(): string | undefined }
}
interface Tenant extends PluginTypes {
	readonly name: 'tenant'
	readonly api: { readonly id: string }
}
interface Roles extends PluginTypes {
	readonly name: 'roles'
	readonly api: { has(role: string): boolean }
}
const authDefinition = definePlugin<Auth>({
	name: 'auth',
	manifest,
	api: () => ({ currentUserId: () => undefined }),
})
export const authPlugin: PluginOf<Auth> = authDefinition.plugin
const tenantDefinition = definePlugin<Tenant>({
	name: 'tenant',
	manifest,
	api: () => ({ id: 't1' }),
})
export const tenantPlugin: PluginOf<Tenant> = tenantDefinition.plugin
const rolesDefinition = definePlugin<Roles>({
	name: 'roles',
	manifest,
	api: () => ({ has: () => false }),
})
export const rolesPlugin: PluginOf<Roles> = rolesDefinition.plugin
// @ts-expect-error: a plugin that declares an `api` must build it.
definePlugin<Roles>({ name: 'roles', manifest })

interface Archive extends PluginTypes {
	readonly name: 'archive'
	readonly requires: Auth | Tenant
	readonly optional: Roles
	readonly appOptions: { readonly keepDays?: number }
}
const archiveDefinition = definePlugin<Archive>({
	name: 'archive',
	manifest,
	requires: { auth: authPlugin, tenant: tenantPlugin },
	optional: { roles: rolesPlugin },
	start: ({ options, plugins }) => {
		const days: number = options.keepDays ?? 30
		void days
		void plugins.tenant.id
		// @ts-expect-error: roles may be absent.
		void plugins.roles.has('admin')
		void plugins.roles?.has('admin')
	},
	// Runs once when the application stops (D-15); the logger is the
	// application's (D-58).
	stop: ({ logger }) => {
		logger.info('archive stopped')
	},
	redirect: {
		delete: ({ where, queries, plugins }) => {
			void plugins.auth.currentUserId()
			return markArchived(queries, where)
		},
	},
	hooks: {
		beforeDelete: ({ plugins }) => {
			void plugins.auth.currentUserId()
		},
	},
})
export const archive: UseOf<Archive> = archiveDefinition.use
export const archivePlugin: PluginOf<Archive> = archiveDefinition.plugin
definePlugin<Archive>({
	name: 'archive',
	manifest,
	optional: { roles: rolesPlugin },
	// @ts-expect-error: tenant is missing.
	requires: { auth: authPlugin },
})
definePlugin<Archive>({
	name: 'archive',
	manifest,
	optional: { roles: rolesPlugin },
	requires: {
		auth: authPlugin,
		tenant: tenantPlugin,
		// @ts-expect-error: soft delete is not a requirement of archive.
		softDelete: softDeletePlugin,
	},
})
definePlugin<Archive>({
	name: 'archive',
	manifest,
	optional: { roles: rolesPlugin },
	// @ts-expect-error: each requirement is its own plugin's value.
	requires: { auth: tenantPlugin, tenant: tenantPlugin },
})
// @ts-expect-error: archive declares requirements.
definePlugin<Archive>({ name: 'archive', manifest })
definePlugin<Auth>({
	name: 'auth',
	manifest,
	api: () => ({ currentUserId: () => undefined }),
	// @ts-expect-error: auth declares no requirement.
	requires: { tenant: tenantPlugin },
})
definePlugin<Archive>({
	name: 'archive',
	manifest,
	requires: { auth: authPlugin, tenant: tenantPlugin },
	optional: { roles: rolesPlugin },
	redirect: {
		// @ts-expect-error: a redirected delete returns the deleted record.
		delete: ({ queries }) => queries.count(),
	},
})
// @ts-expect-error: `keepDays` is a number.
archivePlugin({ keepDays: '30' })

const Doc = defineModel({ name: 'Doc', use: [archive()], fields: () => ({}) })
defineApp({
	database: memory(),
	plugins: [archivePlugin(), authPlugin(), tenantPlugin(), aclPlugin()],
	models: [Doc],
})
// Roles is optional: the app runs without it.
defineApp({
	database: memory(),
	plugins: [archivePlugin(), authPlugin(), tenantPlugin()],
	models: [Doc],
})
// @ts-expect-error: archive requires auth and tenant.
defineApp({ database: memory(), plugins: [archivePlugin()], models: [Doc] })
void softDelete
