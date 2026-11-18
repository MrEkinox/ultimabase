// `pushPlugin()`'s options (D-408): a malformed key or subject is refused at
// start, and no message quotes a key.
import { describe, expect, it } from 'vitest'
import { main, newKeys } from './keys.ts'
import { vapidOf } from './options.ts'
import { keys, web } from './test/app.ts'

const run = 'run npx @ultimabase/push keys.'
const publicMessage = `pushPlugin(): web.publicKey is not a VAPID public key, 65 bytes in base64url: ${run}`
const privateMessage = `pushPlugin(): web.privateKey is not a VAPID private key, 32 bytes in base64url: ${run}`

const bytes = (value: string) => Buffer.from(value, 'base64url')

/** The message `vapidOf` refuses `options` with; it never holds a key. */
function refusal(options: unknown): string {
	let message = 'Not refused.'
	try {
		vapidOf(options)
	} catch (error) {
		message = error instanceof Error ? error.message : ''
	}
	expect(message).not.toContain(keys.privateKey)
	return message
}

describe('pushPlugin() options', () => {
	it('takes both keys, or neither', () => {
		expect(vapidOf({ web })).toMatchObject({
			publicKey: keys.publicKey,
			subject: 'mailto:ops@example.com',
		})
		const https = { ...web, subject: 'https://example.com/contact' }
		expect(vapidOf({ web: https })).toMatchObject({ subject: https.subject })
		expect(vapidOf(undefined)).toBeUndefined()
		expect(vapidOf({})).toBeUndefined()
		expect(vapidOf({ web: undefined })).toBeUndefined()
		const unset = { publicKey: undefined, privateKey: undefined }
		expect(vapidOf({ web: { ...web, ...unset } })).toBeUndefined()
		for (const one of [{ publicKey: undefined }, { privateKey: undefined }]) {
			expect(refusal({ web: { ...web, ...one } })).toBe(
				'pushPlugin(): web needs both publicKey and privateKey, or neither.',
			)
		}
	})

	it('refuses a malformed key without quoting it', () => {
		const other = newKeys()
		const compressed = Buffer.from(bytes(keys.publicKey).subarray(0, 33))
		compressed[0] = 2
		for (const publicKey of [
			'not base64url!',
			compressed.toString('base64url'),
			bytes(keys.publicKey).subarray(1).toString('base64url') + 'AA',
		]) {
			expect(refusal({ web: { ...web, publicKey } })).toBe(publicMessage)
		}
		for (const privateKey of [
			'not base64url!',
			bytes(keys.privateKey).subarray(1).toString('base64url'),
			Buffer.alloc(32).toString('base64url'),
			Buffer.alloc(32, 0xff).toString('base64url'),
		]) {
			expect(refusal({ web: { ...web, privateKey } })).toBe(privateMessage)
		}
		expect(refusal({ web: { ...web, privateKey: other.privateKey } })).toBe(
			'pushPlugin(): web.privateKey is not the private key of web.publicKey.',
		)
	})

	it('checks the subject, keys or not', () => {
		const message =
			'pushPlugin(): web.subject is a mailto: or https: contact, as mailto:ops@example.com.'
		for (const subject of [
			'ops@example.com',
			'http://example.com',
			'mailto:ops',
			7,
		]) {
			expect(refusal({ web: { ...web, subject } })).toBe(message)
			const keyless = { publicKey: undefined, privateKey: undefined, subject }
			expect(refusal({ web: keyless })).toBe(message)
		}
	})

	it('refuses what it does not take', () => {
		expect(refusal({ apns: {} })).toBe('pushPlugin() takes no apns.')
		expect(refusal({ web: { ...web, ttl: 1 } })).toBe(
			'pushPlugin() web takes no ttl.',
		)
		expect(refusal(null)).toBe('pushPlugin() takes an object.')
		expect(refusal({ web: 'keys' })).toBe('pushPlugin() web takes an object.')
	})
})

describe('npx @ultimabase/push keys', () => {
	it('prints a new pair the plugin takes', () => {
		let printed = ''
		expect(main(['keys'], (text) => (printed += text))).toBe(0)
		const match =
			/^PUSH_WEB_PUBLIC_KEY=([\w-]+)\nPUSH_WEB_PRIVATE_KEY=([\w-]+)\n$/.exec(
				printed,
			)
		const [, publicKey = '', privateKey = ''] = match ?? []
		const subject = 'mailto:ops@example.com'
		expect(vapidOf({ web: { publicKey, privateKey, subject } })).toMatchObject({
			publicKey,
		})
		expect(newKeys().publicKey).not.toBe(publicKey)
	})

	it('prints its usage otherwise', () => {
		for (const args of [[], ['key'], ['keys', 'now']]) {
			let printed = ''
			expect(main(args, (text) => (printed += text))).toBe(1)
			expect(printed).toBe('Usage: npx @ultimabase/push keys\n')
		}
	})
})
