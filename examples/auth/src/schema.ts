//#region factory
import { accessPlugin } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import {
	password,
	passwordEmailOperations,
	passwordOperations,
} from '@ultimabase/auth-password'
import { authOperations, authPlugin } from '@ultimabase/auth-plugin'
import { UltimaBase, isAuthenticated } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

import { emailChange, reset, verification } from './email-flows.ts'
import { authEvents } from './events.ts'

const day = 24 * 60 * 60_000

/**
 * `authPlugin` adds `App.UserSchema`, sessions and the `/api/auth` routes;
 * `password()` signs members in by email. Authentication grants no
 * permission: the Access rules below decide what a signed-in member may do.
 * `postgresPlugin()` reads `DATABASE_URL` when the application starts.
 */
export const App = UltimaBase.use(
	accessPlugin(),
	authPlugin({
		methods: [
			password({ identifier: 'email', reset, verification, emailChange }),
		],
		session: {
			expiresInMs: day, // Ends a day after login or the last refresh.
			absoluteExpiresInMs: 30 * day, // The default ceiling.
			revokeOnPasswordChange: true, // The default.
			recentAuthenticationMs: 5 * 60_000, // The default.
		},
		// Browsers keep the session in this cookie instead of reading a token.
		http: { cookie: { name: '__Host-notes-session', sameSite: 'lax' } },
		events: authEvents,
	}),
	...apiServer({
		http: {
			// One reverse proxy in front: `X-Forwarded-For` names the client.
			trustProxy: 1,
			browser: { origins: ['https://notes.example.com'], credentials: true },
		},
		// Clients use the `/api/auth` routes; REST serves only the schemas.
		rest: {
			hide: [
				...Object.values(authOperations),
				...Object.values(passwordOperations),
				...Object.values(passwordEmailOperations),
			],
		},
	}),
	postgresPlugin(),
)
//#endregion factory

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
