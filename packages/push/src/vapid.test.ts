// VAPID's header (RFC 8292): a token the public key verifies, for the push
// service's origin, a day at most.
import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { authorization, signingKey } from './vapid.ts'

const bytes = (value: string | undefined) =>
	Buffer.from(value ?? '', 'base64url')

const decoded = (part: string | undefined): unknown =>
	JSON.parse(bytes(part).toString())

/** A header read as a push service reads it: its token, checked by `k`. */
function read(header: string) {
	const match = /^vapid t=([^,]+), k=(.+)$/.exec(header)
	const publicKey = bytes(match?.[2])
	const [head, claims, signature] = (match?.[1] ?? '').split('.')
	const key = createPublicKey({
		key: {
			kty: 'EC',
			crv: 'P-256',
			x: publicKey.subarray(1, 33).toString('base64url'),
			y: publicKey.subarray(33).toString('base64url'),
		},
		format: 'jwk',
	})
	const valid = verify(
		'sha256',
		Buffer.from(`${head}.${claims}`),
		{ key, dsaEncoding: 'ieee-p1363' },
		bytes(signature),
	)
	return { head: decoded(head), claims: decoded(claims), valid }
}

// RFC 8292 section 3, Figure 2, with its line breaks taken out.
const example =
	'vapid t=eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJodHRwczovL3B1c2guZXhhbXBsZS5uZXQiLCJleHAiOjE0NTM1MjM3NjgsInN1YiI6Im1haWx0bzpwdXNoQGV4YW1wbGUuY29tIn0.i3CYb7t4xfxCDquptFOepC9GAu_HLGkMlMuCGSK2rpiUfnK9ojFwDXb1JrErtmysazNjjvW2L9OkSSHzvoD1oA, k=BA1Hxzyi1RUM1b5wjxsn7nGxAszw2u61m164i3MrAIxHF6YK5h4SDYic-dRuU_RCPCfA5aq9ojSwk5Y2EmClBPs'

describe('authorization (RFC 8292)', () => {
	it('is read as the RFC’s example is', () => {
		expect(read(example)).toStrictEqual({
			head: { typ: 'JWT', alg: 'ES256' },
			claims: {
				aud: 'https://push.example.net',
				exp: 1_453_523_768,
				sub: 'mailto:push@example.com',
			},
			valid: true,
		})
	})

	it('signs a token for the endpoint’s origin, for 12 hours', () => {
		const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
		const jwk = privateKey.export({ format: 'jwk' })
		const publicKey = Buffer.concat([
			Buffer.from([4]),
			bytes(jwk.x),
			bytes(jwk.y),
		])
		const vapid = {
			publicKey: publicKey.toString('base64url'),
			key: signingKey(publicKey, bytes(jwk.d)),
			subject: 'mailto:ops@example.com',
		}
		const now = Date.UTC(2026, 10, 18)
		const header = authorization(vapid, 'https://push.example.test/a?b=1', now)
		expect(header).toContain(`, k=${vapid.publicKey}`)
		expect(read(header)).toStrictEqual({
			head: { typ: 'JWT', alg: 'ES256' },
			claims: {
				aud: 'https://push.example.test',
				exp: now / 1000 + 12 * 60 * 60,
				sub: 'mailto:ops@example.com',
			},
			valid: true,
		})
	})
})
