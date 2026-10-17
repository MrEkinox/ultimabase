//#region factory
import { accessPlugin } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import { password } from '@ultimabase/auth-password'
import { authPlugin } from '@ultimabase/auth-plugin'
import { UltimaBase } from '@ultimabase/core'
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
	apiServer({
		http: {
			// One reverse proxy in front: `X-Forwarded-For` names the client.
			trustProxy: 1,
			browser: { origins: ['https://notes.example.com'], credentials: true },
		},
		// REST serves the schemas; authentication serves `/api/auth` itself.
		rest: true,
	}),
	postgresPlugin(),
)
//#endregion factory
