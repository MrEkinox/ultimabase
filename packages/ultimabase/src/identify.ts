// How a transport finds who sends a request (D-49, D-106): Master with the
// master key, anonymous otherwise, until auth's Identify hook (phase 5).
import { createHash, timingSafeEqual } from 'node:crypto'
import type { Logger, MasterKey } from './app-options.ts'
import { PublicError } from './errors.ts'
import type { Caller } from './rules.ts'
import { createMaster } from './rules.ts'

/** The header a transport reads the master key from. */
export const masterKeyHeader = 'x-ultimabase-master-key'

export type Identify = (request: Request) => Promise<Caller>

const anonymous: Caller = Object.freeze({ kind: 'anonymous' })
const keyMaster = createMaster('key')

// Digests have one length, so the comparison takes the same time for any key.
const digest = (text: string): Buffer =>
	createHash('sha256').update(text).digest()

/** Why a request sending a key is refused before it is compared, if so. */
function refusalOf(masterKey: MasterKey): string | undefined {
	const key = typeof masterKey === 'object' ? masterKey.key : masterKey
	// An empty variable is unset: an empty header must not open Master.
	if (key === undefined || key === '') return 'No master key is configured.'
	if (
		process.env['NODE_ENV'] === 'production' &&
		typeof masterKey !== 'object'
	) {
		return 'The master key is refused in production.'
	}
	return undefined
}

/** Reads the master key and `NODE_ENV` once, when the application starts. */
export function identifier(masterKey: MasterKey, logger: Logger): Identify {
	const refusal = refusalOf(masterKey)
	const key = typeof masterKey === 'object' ? masterKey.key : masterKey
	const expected = digest(key ?? '')
	// Outside production, the HTTP plugin's development log already shows
	// each request (D-108); a use of the key is an audit line in production.
	const audited = process.env['NODE_ENV'] === 'production'
	return async (request) => {
		const sent = request.headers.get(masterKeyHeader)
		if (sent === null) return anonymous
		const refused =
			refusal ??
			(timingSafeEqual(digest(sent), expected)
				? undefined
				: 'The master key is wrong.')
		if (refused !== undefined) {
			logger.warn(`A request sent the master key, refused: ${refused}`)
			throw new PublicError('ACCESS_DENIED', refused)
		}
		if (audited) logger.info('A request acts as Master with the master key.')
		return keyMaster
	}
}
