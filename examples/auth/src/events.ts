import type { AuthEventHandlers } from '@ultimabase/auth-plugin'

/** One line of the security log. */
export interface SecurityEntry {
	readonly event: string
	readonly userId?: string
	readonly identifier?: string
	readonly address: string | null
}

/**
 * Stands in for a security log or an alerting service; the tests read it.
 * Addresses and identifiers are personal data: keep them under your privacy
 * policy.
 */
export const securityLog: SecurityEntry[] = []

//#region events
/** Run after the transaction commits, best effort: a failure never fails the call. */
export const authEvents: AuthEventHandlers = {
	afterSignUp: ({ userId, address }) => {
		securityLog.push({ event: 'sign-up', userId, address })
	},
	afterLogin: ({ userId, address }) => {
		securityLog.push({ event: 'login', userId, address })
	},
	// `identifier` is the normalized email tried, even for an unknown account.
	afterLoginFailed: ({ identifier, address, limited }) => {
		securityLog.push({
			event: limited ? 'login-locked' : 'login-failed',
			identifier,
			address,
		})
	},
	afterPasswordReset: ({ userId }) => {
		securityLog.push({ event: 'password-reset', userId, address: null })
	},
}
//#endregion events
