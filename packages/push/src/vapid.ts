// VAPID (RFC 8292): the application's signature on each push request, an
// ES256 JSON Web Token on `node:crypto` (D-408 point 1).
import type { KeyObject } from 'node:crypto'
import { createPrivateKey, sign } from 'node:crypto'

/** The application's web keys, checked. */
export interface Vapid {
	/** The public key, base64url, as the browser's `applicationServerKey`. */
	readonly publicKey: string
	/** The private key, for ES256. */
	readonly key: KeyObject
	/** The contact, `mailto:` or `https:`. */
	readonly subject: string
}

/** How long a token holds: RFC 8292 allows a day at most. */
const lifetime = 12 * 60 * 60

/** The private key of a pair, the public one uncompressed (65 bytes). */
export function signingKey(publicKey: Buffer, privateKey: Buffer): KeyObject {
	const jwk = {
		kty: 'EC',
		crv: 'P-256',
		x: publicKey.subarray(1, 33).toString('base64url'),
		y: publicKey.subarray(33).toString('base64url'),
		d: privateKey.toString('base64url'),
	}
	return createPrivateKey({ key: jwk, format: 'jwk' })
}

const encoded = (value: object) =>
	Buffer.from(JSON.stringify(value)).toString('base64url')

/** The `Authorization` header of a push request to `endpoint`. */
export function authorization(
	vapid: Vapid,
	endpoint: string,
	now: number = Date.now(),
): string {
	const claims = {
		aud: new URL(endpoint).origin,
		exp: Math.floor(now / 1000) + lifetime,
		sub: vapid.subject,
	}
	const data = `${encoded({ typ: 'JWT', alg: 'ES256' })}.${encoded(claims)}`
	const signature = sign('sha256', Buffer.from(data), {
		key: vapid.key,
		dsaEncoding: 'ieee-p1363',
	})
	const token = `${data}.${signature.toString('base64url')}`
	return `vapid t=${token}, k=${vapid.publicKey}`
}
