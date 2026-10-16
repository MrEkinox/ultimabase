//#region imports
import { hasRole } from '@ultimabase/roles-plugin'

import { App } from './app.ts'
//#endregion imports

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
