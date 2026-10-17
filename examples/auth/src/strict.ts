import { password } from '@ultimabase/auth-password'
import { authPlugin } from '@ultimabase/auth-plugin'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

import { sendEmail } from './mailer.ts'

// A second, stricter application: the tests start it on its own database.

//#region strict-password
/**
 * Stronger Argon2id parameters, and no session before the email is
 * verified. Raise `policyVersion` with any hash parameter: a successful
 * login upgrades an older verifier.
 */
export const strictPassword = password({
	identifier: 'email',
	policy: {
		policyVersion: 2,
		memoryCostKiB: 131_072,
		timeCost: 3,
		parallelism: 4,
	},
	verification: {
		sendVerificationEmail: ({ email, token }) => {
			sendEmail({
				to: email,
				subject: 'Verify your email',
				link: `https://reader.example.com/verify#${token}`,
			})
		},
		requireVerifiedEmail: true,
	},
})
//#endregion strict-password

export const StrictApp = UltimaBase.use(
	authPlugin({ methods: [strictPassword] }),
	postgresPlugin(),
)

export const Reader = StrictApp.UserSchema.define({ className: 'Reader' })

export const strict = new StrictApp({ schemas: [Reader] })
