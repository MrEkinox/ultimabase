//#region factory
import { accessPlugin } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { hasRole, rolesPlugin } from '@ultimabase/roles-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

/**
 * The configured factory types the `softDelete` key, its commands and fields.
 * Access and Roles only decide who may read the trash; Soft Delete needs
 * neither. `postgresPlugin()` reads `DATABASE_URL` when the application starts.
 */
export const App = UltimaBase.use(
	softDeletePlugin(),
	accessPlugin(),
	rolesPlugin(),
	...apiServer({ http: { appId: 'blog' }, rest: true, graphql: true }),
	postgresPlugin(),
)
//#endregion factory

//#region moderators
/** The people who use the blog; a request principal points to a Member. */
export const Member = App.Schema.define({
	className: 'Member',
	fields: (field) => ({ name: field.string({ required: true }) }),
})

/** Created at start when missing, so the `moderator` role always exists. */
export const StaffRole = App.RoleSchema.define({
	className: 'StaffRole',
	members: () => Member,
}).with({ roles: { ensure: ['moderator'] } })

export const Moderator = StaffRole.role('moderator')
//#endregion moderators

//#region post
/** Default mode: `deleteOne` and `deleteMany` write tombstones. */
export const Post = App.Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string({ required: true }) }),
	softDelete: true,
}).with({
	access: {
		// Every caller may write, delete and restore posts in this example.
		read: true,
		create: true,
		delete: true,
		softDeleteOne: true,
		softDeleteMany: true,
		restoreOne: true,
		restoreMany: true,
		// Only moderators see tombstones in ordinary reads.
		readDeleted: hasRole(Moderator),
	},
	// A command reaches REST or GraphQL only when the rule names it.
	rest: { softDeleteOne: true, restoreOne: true },
	graphql: { softDeleteOne: true, restoreOne: true },
})
//#endregion post

//#region comment
/** Command mode: `deleteOne` stays permanent; `softDeleteOne` hides a row. */
export const Comment = App.Schema.define({
	className: 'Comment',
	fields: (field) => ({ body: field.string({ required: true }) }),
	softDelete: { mode: 'command' },
})
//#endregion comment

//#region article
/** A partial unique index lets a tombstone release its slug. */
export const Article = App.Schema.define({
	className: 'Article',
	fields: (field) => ({ slug: field.string({ required: true }) }),
	indexes: [{ fields: ['slug'], unique: true, where: { isDeleted: false } }],
	softDelete: true,
})
//#endregion article
