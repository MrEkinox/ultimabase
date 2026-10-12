import { authPlugin, type AuthEventHandlers } from '@ultimabase/auth-plugin'
import { MasterAuthority, UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import type { Pool } from 'pg'

import { password, type PasswordOptions } from '../../src/index.js'

/** A valid password of the fixtures (15 code points at least). */
export const secret = 'correct horse battery staple'

/** Argon2id at the security floor keeps the suite fast. */
export const fastPolicy = {
	memoryCostKiB: 19_456,
	parallelism: 1,
	policyVersion: 1,
	timeCost: 2,
} as const

/** The email flows a fixture application enables. */
export type EmailFlows<TRequireVerifiedEmail extends boolean = false> = Pick<
	PasswordOptions<'email', TRequireVerifiedEmail>,
	'emailChange' | 'reset' | 'verification'
>

/** Builds one application with an email password User on the given pool. */
export const createPasswordApplication = <
	const TRequireVerifiedEmail extends boolean = false,
>(
	pool: Pool,
	options: Readonly<{
		email?: EmailFlows<TRequireVerifiedEmail>
		events?: AuthEventHandlers
		/** Configures a Master key for application code (none by default). */
		master?: boolean
		revokeOnPasswordChange?: boolean
	}> = {},
) => {
	const App = UltimaBase.use(
		postgresPlugin({ pool, schemaPolicy: 'override' }),
		authPlugin({
			events: options.events ?? {},
			methods: [
				password({
					identifier: 'email',
					policy: fastPolicy,
					...options.email,
				}),
			],
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
	const ultimabase = new App({
		logger: false,
		...(options.master === true
			? {
					masterAuthority: new MasterAuthority({
						keys: [{ id: 'auth-password-e2e', value: 'server-only' }],
						onUse: () => undefined,
					}),
				}
			: {}),
		schemas: [AuthUser],
	})
	return { AuthUser, ultimabase }
}

/** One message an email callback received. */
export interface SentMessage {
	readonly email: string
	readonly kind: 'confirmation' | 'notice' | 'reset' | 'verification'
	readonly message: Readonly<Record<string, unknown>>
}

/** Records every message the email callbacks receive, in order. */
export const createOutbox = <
	const TRequireVerifiedEmail extends boolean = false,
>(
	options: Readonly<{ requireVerifiedEmail?: TRequireVerifiedEmail }> = {},
) => {
	const sent: SentMessage[] = []
	const record =
		(kind: SentMessage['kind']) => (message: Readonly<{ email: string }>) => {
			sent.push({ email: message.email, kind, message: { ...message } })
		}
	const flows: EmailFlows<TRequireVerifiedEmail> = {
		emailChange: {
			sendConfirmationEmail: record('confirmation'),
			sendNoticeEmail: record('notice'),
		},
		reset: { sendResetEmail: record('reset') },
		verification: {
			...(options.requireVerifiedEmail === undefined
				? {}
				: { requireVerifiedEmail: options.requireVerifiedEmail }),
			sendVerificationEmail: record('verification'),
		},
	}
	/** The token of the latest message of one kind sent to one address. */
	const tokenFor = (kind: SentMessage['kind'], email: string): string => {
		const token = sent.findLast(
			(entry) => entry.kind === kind && entry.email === email,
		)?.message.token
		if (typeof token !== 'string') {
			throw new TypeError(`No ${kind} token was sent to ${email}`)
		}
		return token
	}
	return { flows, sent, tokenFor }
}
