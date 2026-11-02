// The maintenance key (D-207): it switches the maintenance, nothing else, so a
// deployment pipeline does not hold the master key. It follows the master
// key's rules: unset when empty, a header's characters only, and 32
// characters at least in production.
import { createHash, timingSafeEqual } from 'node:crypto'
import { Refused } from 'ultimabase'

/** The header a request sends the maintenance key in. */
export const keyHeader = 'x-ultimabase-maintenance-key'

// Digests have one length, so the comparison takes the same time for any key.
const digest = (text: string): Buffer =>
	createHash('sha256').update(text).digest()

/** Whether a request sends `key`; never, when it is unset. */
export function keyed(key: string | undefined): (request: Request) => boolean {
	if (key === undefined || key === '') return () => false
	if (!/^[\x21-\x7e]+$/.test(key)) {
		throw new Refused(
			'The maintenance key holds a space or a character outside ASCII, which a header cannot carry: use letters, digits and symbols only.',
		)
	}
	if (process.env['NODE_ENV'] === 'production' && key.length < 32) {
		throw new Refused(
			`The maintenance key is ${key.length} characters long; production needs 32 at least: \`openssl rand -base64 32\` gives one.`,
		)
	}
	const expected = digest(key)
	return (request) => {
		const sent = request.headers.get(keyHeader)
		return sent !== null && timingSafeEqual(digest(sent), expected)
	}
}
