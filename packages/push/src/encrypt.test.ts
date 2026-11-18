// RFC 8291's message encryption, proved by its Appendix A.
import { createECDH } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decrypt, encrypt, maxMessage } from './encrypt.ts'

const bytes = (value: string) => Buffer.from(value, 'base64url')

// RFC 8291 Appendix A.
const rfc = {
	plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
	asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
	uaPublic:
		'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
	uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
	salt: 'DGv6ra1nlYgDCS1FRnbzlw',
	auth: 'BTBZMqHH6r4Tts7J_aSIgg',
	body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

const keyPair = (privateKey: string) => {
	const ecdh = createECDH('prime256v1')
	ecdh.setPrivateKey(bytes(privateKey))
	return ecdh
}

describe('encrypt (RFC 8291)', () => {
	it('gives the body of Appendix A', () => {
		const body = encrypt(
			bytes(rfc.plaintext),
			{ p256dh: bytes(rfc.uaPublic), auth: bytes(rfc.auth) },
			{ salt: bytes(rfc.salt), ecdh: keyPair(rfc.asPrivate) },
		)
		expect(body.toString('base64url')).toBe(rfc.body)
	})

	it('decrypts the body of Appendix A as its browser', () => {
		const message = decrypt(
			bytes(rfc.body),
			keyPair(rfc.uaPrivate),
			bytes(rfc.auth),
		)
		expect(message.toString()).toBe('When I grow up, I want to be a watermelon')
	})

	it('draws a new key and salt for each message', () => {
		const browser = createECDH('prime256v1')
		browser.generateKeys()
		const receiver = { p256dh: browser.getPublicKey(), auth: bytes(rfc.auth) }
		const message = Buffer.from('x'.repeat(maxMessage))
		const first = encrypt(message, receiver)
		const second = encrypt(message, receiver)
		expect(first.subarray(0, 16)).not.toStrictEqual(second.subarray(0, 16))
		// One record of 4096 bytes at most.
		expect(first).toHaveLength(4096)
		expect(decrypt(first, browser, bytes(rfc.auth))).toStrictEqual(message)
	})
})
