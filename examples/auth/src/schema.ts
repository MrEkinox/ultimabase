//#region imports
import { isAuthenticated } from '@ultimabase/core'

import { App } from './app.ts'
//#endregion imports

//#region member
/**
 * The User: `password({ identifier: 'email' })` adds `email`,
 * `emailVerified` and `emailVerifiedAt`, which no create or update input
 * accepts. Sign-up creates members without any `create` rule.
 */
export const Member = App.UserSchema.define({
	className: 'Member',
	fields: (field) => ({
		displayName: field.string({ required: true }),
		bio: field.string(),
	}),
}).with({
	access: {
		// Members read and edit only their own profile.
		read: ({ principal, where }) =>
			principal === undefined ? false : where.eq('id', principal.id),
		update: ({ principal, where }) =>
			principal === undefined ? false : where.eq('id', principal.id),
	},
})
//#endregion member

//#region note
/** Private notes: the session's member is the `principal` of every rule. */
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
			where: isAuthenticated,
			item: ({ item, principal }) => item.author === principal?.id,
		},
	},
})
//#endregion note
