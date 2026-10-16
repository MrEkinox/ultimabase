//#region factory
import { accessPlugin } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { hasRole, rolesPlugin } from '@ultimabase/roles-plugin'

import { roleAuditPlugin } from './role-audit.ts'

/**
 * Roles adds `App.RoleSchema` and resolves memberships; Access turns a
 * membership into a decision through `hasRole()`. The audit plugin observes
 * committed role changes. `postgresPlugin()` reads `DATABASE_URL` when the
 * application starts.
 */
export const App = UltimaBase.use(
	accessPlugin(),
	rolesPlugin(),
	roleAuditPlugin,
	...apiServer({ http: { appId: 'newsroom' }, rest: true }),
	postgresPlugin(),
)
//#endregion factory

//#region staff-role
/** The people of the newsroom; a request principal points to a Member. */
export const Member = App.Schema.define({
	className: 'Member',
	fields: (field) => ({ name: field.string({ required: true }) }),
}).with({ access: { read: true } })

/**
 * Staff roles, created at start when missing. Everyone may read them; no
 * write rule exists, so only trusted server code (Master) changes them.
 */
export const StaffRole = App.RoleSchema.define({
	className: 'StaffRole',
	members: () => Member,
	fields: (field) => ({ description: field.string() }),
}).with({
	roles: {
		// The default: refuse to delete a role that still has members or links.
		deletion: 'fail',
		ensure: ['editor', 'administrator'],
	},
	access: { read: true },
})

export const Editor = StaffRole.role('editor')
export const Administrator = StaffRole.role('administrator')
//#endregion staff-role

//#region team
/**
 * A second role schema. Administrators manage teams as ordinary callers,
 * under these rules. Deleting a team clears its links (`cascade`), which
 * only Master may do.
 */
export const Team = App.RoleSchema.define({
	className: 'Team',
	members: () => Member,
}).with({
	roles: { deletion: 'cascade' },
	access: {
		read: true,
		create: hasRole(Administrator),
		update: hasRole(Administrator),
		delete: hasRole(Administrator),
	},
})
//#endregion team

//#region post
/** Editors write posts; administrators, who are editors too, delete them. */
export const Post = App.Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string({ required: true }) }),
}).with({
	access: {
		read: true,
		create: hasRole(Editor),
		update: hasRole(Editor),
		delete: hasRole(Administrator),
	},
})
//#endregion post
