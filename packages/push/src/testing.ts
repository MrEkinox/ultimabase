// `@ultimabase/push/testing` (D-408 point 9): push services that keep each
// push, decrypted as the browser reads it, instead of the network.
import { createECDH, randomBytes } from 'node:crypto'
import type { ECDH } from 'node:crypto'
import { decrypt } from './encrypt.ts'
import type { WebSubscription } from './register.ts'
import { usePost } from './running.ts'
import type { PushMessage } from './send.ts'

/** A push a fake push service received. */
export interface FakePush {
	readonly endpoint: string
	/** The message, as the service worker reads it. */
	readonly message: PushMessage
	readonly ttl: number
	readonly urgency: string | undefined
	readonly topic: string | undefined
}

/** The fake push services, until `restore`. */
export interface FakeWebPush {
	/** A new browser's subscription, to `push.register`. */
	subscription(): WebSubscription
	/** Each push received, in order. */
	readonly pushes: readonly FakePush[]
	/** Makes `endpoint` answer 410, as a browser that unsubscribed. */
	gone(endpoint: string): void
	/** Gives the network back. */
	restore(): void
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null

const text = (value: unknown): string | undefined =>
	typeof value === 'string' ? value : undefined

/** The JSON `push.send` wrote, read back. */
function messageOf(json: string): PushMessage {
	const value: unknown = JSON.parse(json)
	if (!isRecord(value)) throw new Error('A push is a JSON object.')
	const { title, body, url, tag, data } = value
	return {
		title: text(title) ?? '',
		body: text(body) ?? '',
		url: text(url),
		tag: text(tag),
		data,
	}
}

/** Replaces the push services with fakes; one at a time. */
export function fakeWebPush(): FakeWebPush {
	const browsers = new Map<string, { ecdh: ECDH; auth: Buffer }>()
	const gone = new Set<string>()
	const pushes: FakePush[] = []
	usePost(async (endpoint, headers, body) => {
		const browser = browsers.get(endpoint)
		if (browser === undefined) return 404
		if (gone.has(endpoint)) return 410
		const message = decrypt(body, browser.ecdh, browser.auth)
		pushes.push({
			endpoint,
			message: messageOf(message.toString()),
			ttl: Number(headers['TTL']),
			urgency: headers['Urgency'],
			topic: headers['Topic'],
		})
		return 201
	})
	return {
		subscription: () => {
			const ecdh = createECDH('prime256v1')
			ecdh.generateKeys()
			const auth = randomBytes(16)
			const endpoint = `https://push.example.test/${browsers.size + 1}`
			browsers.set(endpoint, { ecdh, auth })
			return {
				endpoint,
				p256dh: ecdh.getPublicKey().toString('base64url'),
				auth: auth.toString('base64url'),
			}
		},
		pushes,
		gone: (endpoint) => {
			gone.add(endpoint)
		},
		restore: () => {
			usePost(undefined)
		},
	}
}
