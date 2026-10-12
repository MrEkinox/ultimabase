import { authPlugin, type AuthEventHandlers } from '@ultimabase/auth-plugin'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import type { Pool } from 'pg'

import { password } from '../../src/index.js'

/** A valid password of the fixtures (15 code points at least). */
export const secret = 'correct horse battery staple'

/** Argon2id at the security floor keeps the suite fast. */
export const fastPolicy = {
	memoryCostKiB: 19_456,
	parallelism: 1,
	policyVersion: 1,
	timeCost: 2,
} as const

/** Builds one application with an email password User on the given pool. */
export const createPasswordApplication = (
	pool: Pool,
	options: Readonly<{
		events?: AuthEventHandlers
		revokeOnPasswordChange?: boolean
	}> = {},
) => {
	const App = UltimaBase.use(
		postgresPlugin({ pool, schemaPolicy: 'override' }),
		authPlugin({
			events: options.events ?? {},
			methods: [password({ identifier: 'email', policy: fastPolicy })],
			session: {
				recentAuthenticationMs: 60_000,
				revokeOnPasswordChange: options.revokeOnPasswordChange ?? true,
			},
		}),
	)
	const AuthUser = App.UserSchema.define({
		className: 'AuthUser',
		fields: (field) => ({ displayName: field.string({ required: true }) }),
	}).with({})
	const ultimabase = new App({ logger: false, schemas: [AuthUser] })
	return { AuthUser, ultimabase }
}
