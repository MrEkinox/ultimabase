//#region factory
import { accessPlugin } from '@ultimabase/access-plugin'
import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { UltimaBase, isAuthenticated } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { hasRole, rolesPlugin } from '@ultimabase/roles-plugin'

/**
 * ACL stores the rights of each row with the row. Access decides which
 * operations run at all, creation included; Roles tells ACL the caller's
 * roles. `postgresPlugin()` reads `DATABASE_URL` when the application starts.
 */
export const App = UltimaBase.use(
	aclPlugin(),
	accessPlugin(),
	rolesPlugin(),
	postgresPlugin(),
)
//#endregion factory

//#region members
/** The people who use the notebook; a request principal points to a Member. */
export const Member = App.Schema.define({
	className: 'Member',
	fields: (field) => ({ name: field.string({ required: true }) }),
})

/** Created at start when missing. Only trusted server code changes members. */
export const Team = App.RoleSchema.define({
	className: 'Team',
	members: () => Member,
}).with((plugins) =>
	plugins.roles({
		// The Announcement default grants this role, so it must exist.
		ensure: ['editors'],
	}),
)

export const Editors = Team.role('editors')
//#endregion members

//#region note
/**
 * Private notes. Access lets members create them and lets every operation
 * run; each note's ACL then decides who may read, update or delete it.
 */
export const Note = App.Schema.define({
	className: 'Note',
	fields: (field) => ({ title: field.string({ required: true }) }),
	acl: true,
}).with((plugins) =>
	plugins
		.access({ read: true, create: isAuthenticated, update: true, delete: true })
		.acl({
			// The creator may read, update and delete; nobody else sees the note.
			default: ({ principal }) => new ACL(principal),
			//#region client-sharing
			// Whoever may update a note may share it.
			clientSharing: ({ principal, currentAcl }) =>
				principal !== undefined &&
				currentAcl.hasPrincipalPermission(principal, 'update'),
			//#endregion client-sharing
			// The owner and two other members at most.
			limits: { maxPrincipals: 3 },
		}),
)
//#endregion note

//#region announcement
/**
 * Everyone reads announcements and editors change them. Access still hides
 * drafts and lets only editors create: the ACL cannot widen either rule.
 */
export const Announcement = App.Schema.define({
	className: 'Announcement',
	fields: (field) => ({
		published: field.boolean({ default: false }),
		title: field.string({ required: true }),
	}),
	acl: true,
}).with((plugins) =>
	plugins
		.access({
			read: ({ where }) => where.eq('published', true),
			create: hasRole(Editors),
			update: true,
			delete: true,
		})
		.acl({
			// One fixed ACL for every row; `'write'` means update and delete.
			default: new ACL().grantPublic('read').grantRole(Editors, 'write'),
		}),
)
//#endregion announcement

//#region page
/** Wiki pages: the author edits; every signed-in member reads published ones. */
export const Page = App.Schema.define({
	className: 'Page',
	fields: (field) => ({
		published: field.boolean({ default: false }),
		title: field.string({ required: true }),
	}),
	acl: true,
}).with((plugins) =>
	plugins
		.access({ read: true, create: isAuthenticated, update: true, delete: true })
		.acl({
			default: ({ principal }) => new ACL(principal),
			// Recomputed on each create and singular update without an explicit ACL.
			resolveInput: ({ currentAcl, data, principal }) => {
				const acl = currentAcl ?? new ACL(principal)
				return data.published
					? acl.grantAuthenticated('read')
					: acl.revokeAuthenticated('read')
			},
		}),
)
//#endregion page
