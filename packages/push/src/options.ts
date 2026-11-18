// `pushPlugin`'s options, checked at start (D-408 point 2): a malformed key
// or subject is refused, and no message quotes a key.
import { createECDH } from 'node:crypto'
import { Refused } from 'ultimabase'
import type { Vapid } from './vapid.ts'
import { signingKey } from './vapid.ts'

/** The application's VAPID keys and contact. */
export interface WebKeys {
	/** base64url; `undefined`, as an unset variable, with `privateKey`. */
	readonly publicKey: string | undefined
	/** base64url; `undefined`, as an unset variable, with `publicKey`. */
	readonly privateKey: string | undefined
	/** A contact for the push services: `mailto:` or `https:`. */
	readonly subject: string
}

/** What `pushPlugin` takes. */
export interface PushOptions {
	/** `undefined`, or both keys unset: nothing is registered or sent. */
	readonly web?: WebKeys | undefined
}

const entry = 'pushPlugin()'
const run = 'run npx @ultimabase/push keys'

/** Refuses what is not an object, or holds a key `keys` does not name. */
function ownKeys(
	where: string,
	value: unknown,
	keys: readonly string[],
): asserts value is object {
	if (typeof value !== 'object' || value === null) {
		throw new Refused(`${where} takes an object.`)
	}
	for (const key of Object.keys(value)) {
		if (!keys.includes(key)) throw new Refused(`${where} takes no ${key}.`)
	}
}

/** The bytes of a base64url value, or `undefined` for another string. */
export const bytesOf = (value: string): Buffer | undefined =>
	/^[\w-]+$/u.test(value) ? Buffer.from(value, 'base64url') : undefined

function isContact(subject: unknown): subject is string {
	if (typeof subject !== 'string') return false
	if (/^mailto:.+@.+/u.test(subject)) return true
	return URL.canParse(subject) && new URL(subject).protocol === 'https:'
}

/** The public key, checked; the message never quotes it. */
function publicOf(publicKey: string): Buffer {
	const bytes = bytesOf(publicKey)
	if (bytes?.length !== 65 || bytes[0] !== 4) {
		throw new Refused(
			`${entry}: web.publicKey is not a VAPID public key, 65 bytes in base64url: ${run}.`,
		)
	}
	return bytes
}

/** The private key, checked against the public one; never quoted. */
function privateOf(privateKey: string, publicKey: Buffer): Buffer {
	const bytes = bytesOf(privateKey)
	const ecdh = createECDH('prime256v1')
	let derived: Buffer | undefined
	try {
		if (bytes?.length === 32) {
			ecdh.setPrivateKey(bytes)
			derived = ecdh.getPublicKey()
		}
	} catch {
		// Out of the curve's range: refused below.
	}
	if (bytes === undefined || derived === undefined) {
		throw new Refused(
			`${entry}: web.privateKey is not a VAPID private key, 32 bytes in base64url: ${run}.`,
		)
	}
	if (!derived.equals(publicKey)) {
		throw new Refused(
			`${entry}: web.privateKey is not the private key of web.publicKey.`,
		)
	}
	return bytes
}

/** The web keys, checked; `undefined` when none are set. */
export function vapidOf(options: unknown): Vapid | undefined {
	if (options === undefined) return undefined
	ownKeys(entry, options, ['web'])
	const web: unknown = Reflect.get(options, 'web')
	if (web === undefined) return undefined
	ownKeys(`${entry} web`, web, ['publicKey', 'privateKey', 'subject'])
	const subject: unknown = Reflect.get(web, 'subject')
	// Checked even without keys: it is code, not an environment variable.
	if (!isContact(subject)) {
		throw new Refused(
			`${entry}: web.subject is a mailto: or https: contact, as mailto:ops@example.com.`,
		)
	}
	const publicKey: unknown = Reflect.get(web, 'publicKey')
	const privateKey: unknown = Reflect.get(web, 'privateKey')
	if (publicKey === undefined && privateKey === undefined) return undefined
	if (typeof publicKey !== 'string' || typeof privateKey !== 'string') {
		throw new Refused(
			`${entry}: web needs both publicKey and privateKey, or neither.`,
		)
	}
	const key = publicOf(publicKey)
	return {
		publicKey,
		key: signingKey(key, privateOf(privateKey, key)),
		subject,
	}
}
