// How a transport finds who sends a request (D-49, D-106, D-112): Master with
// the master key, then the first plugin that knows it, anonymous otherwise.
import { createHash, timingSafeEqual } from 'node:crypto'
import type { Logger, MasterKey } from './app-options.ts'
import { PublicError, Refused } from './errors.ts'
import type { Caller } from './rules.ts'
import { createMaster } from './rules.ts'

/** The header a transport reads the master key from. */
export const masterKeyHeader = 'x-ultimabase-master-key'

export type Identify = (request: Request) => Promise<Caller>
/** A plugin's `identify`, bound to its context. */
export type PluginIdentify = (request: Request) => Promise<Caller | undefined>

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

/**
 * Reads the master key and `NODE_ENV` once, when the application starts.
 * `plugins` is read on each request: it is filled once their contexts exist.
 */
export function identifier(
	masterKey: MasterKey,
	logger: Logger,
	plugins: readonly PluginIdentify[],
): Identify {
	const refusal = refusalOf(masterKey)
	const key = typeof masterKey === 'object' ? masterKey.key : masterKey
	// A header drops the spaces around a value and mangles what is not ASCII:
	// such a key could never match.
	if (key !== undefined && key !== '' && !/^[\x21-\x7e]+$/.test(key)) {
		throw new Refused(
			'The master key holds a space or a character outside ASCII, which a header cannot carry: use letters, digits and symbols only.',
		)
	}
	const expected = digest(key ?? '')
	// Outside production, the HTTP plugin's development log already shows
	// each request (D-108); a use of the key is an audit line in production.
	const audited = process.env['NODE_ENV'] === 'production'
	// Nothing limits the keys a client tries: one that opens Master in
	// production must not be guessed.
	if (
		audited &&
		refusal === undefined &&
		key !== undefined &&
		key.length < 32
	) {
		throw new Refused(
			`The master key is ${key.length} characters long; production needs 32 at least: \`openssl rand -base64 32\` gives one.`,
		)
	}
	return async (request) => {
		const sent = request.headers.get(masterKeyHeader)
		if (sent === null) {
			for (const identify of plugins) {
				const caller = await identify(request)
				if (caller !== undefined) return caller
			}
			return anonymous
		}
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
