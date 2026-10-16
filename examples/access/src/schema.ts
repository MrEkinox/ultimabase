//#region factory
import { accessPlugin, allOf, anyOf, not } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import { UltimaBase, isAuthenticated } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { hasRole, rolesPlugin } from '@ultimabase/roles-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

/**
 * Access denies every operation that has no schema rule. Roles supplies the
 * `hasRole()` facts and Soft Delete the commands and permission ruled on
 * `Comment`; Access imports neither. `postgresPlugin()` reads
 * `DATABASE_URL` when the application starts.
 */
export const App = UltimaBase.use(
	accessPlugin(),
	rolesPlugin(),
	softDeletePlugin(),
	...apiServer({ rest: true }),
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
}).with({ roles: { ensure: ['editor', 'admin', 'muted'] } })

export const Editor = StaffRole.role('editor')
export const Admin = StaffRole.role('admin')
export const Muted = StaffRole.role('muted')
//#endregion members

//#region article
/** Readers see published articles only; `internalNote` never leaves the server. */
export const Article = App.Schema.define({
	className: 'Article',
	fields: (field) => ({
		internalNote: field.string({ access: { read: false, write: false } }),
		published: field.boolean({ default: false }),
		title: field.string({ required: true }),
	}),
}).with({
	// No create, update, upsert or delete rule: they stay denied.
	access: { read: ({ where }) => where.eq('published', true) },
})
//#endregion article

//#region subscriber
/** The number of subscribers is public; the subscribers are not. */
export const Subscriber = App.Schema.define({
	className: 'Subscriber',
	fields: (field) => ({ email: field.string({ required: true }) }),
}).with({ access: { read: { count: true } } })
//#endregion subscriber

//#region story
/** Updates reach unlocked stories and never retitle a published one. */
export const Story = App.Schema.define({
	className: 'Story',
	fields: (field) => ({
		locked: field.boolean({ default: false }),
		published: field.boolean({ default: false }),
		title: field.string({ required: true }),
	}),
}).with({
	access: {
		read: true,
		update: {
			// Before loading: a private filter on the rows an update may reach.
			where: ({ where }) => where.eq('locked', false),
			// On each locked original and its prepared candidate.
			item: ({ item, originalItem }) =>
				!originalItem.published || item.title === originalItem.title,
		},
	},
})
//#endregion story

//#region note
/** Private notes: members write their own, and only their author reads them. */
export const Note = App.Schema.define({
	className: 'Note',
	fields: (field) => ({
		author: field.string({ required: true }),
		body: field.string({ required: true }),
	}),
}).with({
	access: {
		read: ({ principal, where }) =>
			principal === undefined ? false : where.eq('author', principal.id),
		create: {
			// Nothing is loaded before a create: `where` is a decision.
			where: isAuthenticated,
			item: ({ item, principal }) => item.author === principal?.id,
		},
		update: {
			where: ({ principal }) => principal !== undefined,
			item: ({ item, originalItem, principal }) =>
				originalItem.author === principal?.id &&
				item.author === originalItem.author,
		},
		delete: hasRole(Admin),
	},
})
//#endregion note

//#region audit-entry
/** Write-only: any caller appends entries, only Master reads them. */
export const AuditEntry = App.Schema.define({
	className: 'AuditEntry',
	fields: (field) => ({ action: field.string({ required: true }) }),
}).with({ access: { create: true, read: false } })
//#endregion audit-entry

//#region profile
/** Field rules are partial: an omitted member restricts nothing. */
export const Profile = App.Schema.define({
	className: 'Profile',
	fields: (field) => ({
		// Shown in results, but never usable to filter or sort.
		email: field.string({
			access: { read: { where: false, orderBy: false } },
		}),
		// Set once: a first value is allowed, replacing or clearing it is not.
		handle: field.string({
			access: { write: { replace: false, clear: false } },
		}),
		bio: field.string(),
	}),
}).with({ access: { read: true, create: true, update: true } })
//#endregion profile

//#region comment
/**
 * `softDelete: true` adds request commands (`softDeleteOne`, `restoreOne`…) and
 * the `readDeleted` permission. Each has its own Access key: `update` and
 * `delete` grant none of them.
 */
export const Comment = App.Schema.define({
	className: 'Comment',
	fields: (field) => ({
		author: field.string({ required: true }),
		body: field.string({ required: true }),
		pinned: field.boolean({ default: false }),
	}),
	softDelete: true,
}).with({
	access: {
		read: true,
		// Authenticated members may comment unless they are muted.
		create: allOf(isAuthenticated, not(hasRole(Muted))),
		// Authors hide their own comments, except pinned ones.
		softDeleteOne: {
			where: ({ principal, where }) =>
				principal === undefined ? false : where.eq('author', principal.id),
			item: ({ originalItem }) => !originalItem.pinned,
		},
		restoreOne: anyOf(hasRole(Editor), hasRole(Admin)),
		// Editors also see hidden comments in ordinary reads.
		readDeleted: hasRole(Editor),
	},
})
//#endregion comment
