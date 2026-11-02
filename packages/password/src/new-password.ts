// A new password's checks (D-209): never the account's email, and, with
// `breached: true`, in no known data breach, which Have I Been Pwned's
// range API tells from the first 5 characters of its SHA-1.
import { createHash } from 'node:crypto'
import type { Logger } from 'ultimabase'
import { PublicError } from 'ultimabase'
import type { State } from './core.ts'

const range = 'https://api.pwnedpasswords.com/range/'

/** Whether a breach holds `password`; `false`, with a warning, when the service fails. */
async function breached(password: string, logger: Logger): Promise<boolean> {
	const hash = createHash('sha1').update(password).digest('hex').toUpperCase()
	try {
		const response = await fetch(`${range}${hash.slice(0, 5)}`, {
			headers: { 'Add-Padding': 'true' },
			signal: AbortSignal.timeout(2000),
		})
		if (!response.ok) throw new Error(`It answered ${response.status}.`)
		const suffix = hash.slice(5)
		// Padding lines count 0: they are no breach.
		return (await response.text()).split('\n').some((line) => {
			const [found, count] = line.trim().split(':')
			return found === suffix && count !== '0'
		})
	} catch (error) {
		logger.warn(
			{ err: error },
			'Have I Been Pwned did not answer: the password was accepted unchecked.',
		)
		return false
	}
}

const refused = (path: string, message: string) =>
	new PublicError('VALIDATION_FAILED', `${path}: ${message}`, {
		details: { issues: [{ path: [path], message }] },
	})

/**
 * Refuses `password`, normalized, as the new password of the account whose
 * email is `email`; `path` names the input field.
 */
export async function checkNew(
	state: State,
	password: string,
	email: string | undefined,
	path = 'password',
): Promise<void> {
	const typed = password.toLowerCase()
	const local = email?.slice(0, email.indexOf('@'))
	if (typed === email || typed === local) {
		throw refused(path, 'A password cannot be the email.')
	}
	// An application's tests call no third party (D-209).
	if (!state.breached || process.env['NODE_ENV'] === 'test') return
	if (await breached(password, state.logger)) {
		throw refused(
			path,
			'This password appears in a data breach: choose another.',
		)
	}
}

/** Warns, in production, of an application that did not choose (D-209). */
export function warnUnchosen(
	chosen: boolean | undefined,
	logger: Logger,
): void {
	if (chosen !== undefined || process.env['NODE_ENV'] !== 'production') {
		return
	}
	logger.warn(
		'Breached passwords are accepted: passwordPlugin({ breached: true }) refuses them.',
	)
}
