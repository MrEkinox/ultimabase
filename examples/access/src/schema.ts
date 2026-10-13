//#region factory
import { accessPlugin } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { rolesPlugin } from '@ultimabase/roles-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

/**
 * Access denies every operation that has no schema rule. Roles supplies the
 * `hasRole()` facts and Soft Delete the commands and permission ruled in
 * `comments.ts`; Access imports neither. `postgresPlugin()` reads
 * `DATABASE_URL` when the application starts.
 */
export const App = UltimaBase.use(
	accessPlugin(),
	rolesPlugin(),
	softDeletePlugin(),
	...apiServer({ http: { appId: 'newsroom' }, rest: true }),
	postgresPlugin(),
)
//#endregion factory

//#region members
/** The people who use the newsroom; a request principal points to a Member. */
export const Member = App.Schema.define({
	className: 'Member',
	fields: (field) => ({ name: field.string({ required: true }) }),
})

/** Created at start when missing. Only trusted server code changes members. */
export const StaffRole = App.RoleSchema.define({
	className: 'StaffRole',
	members: () => Member,
	ensure: ['editor', 'admin', 'muted'],
})

export const Editor = StaffRole.role('editor')
export const Admin = StaffRole.role('admin')
export const Muted = StaffRole.role('muted')
//#endregion members
