// `push.send` (D-408 point 6): one message to each device of some users,
// encrypted for each (RFC 8291) and signed by the application (RFC 8292).
import { createHash } from 'node:crypto'
import { M, PushDevice } from './device.ts'
import { encrypt, maxMessage } from './encrypt.ts'
import type { Logger } from 'ultimabase'
import { posted, runningOf } from './running.ts'
import type { Vapid } from './vapid.ts'
import { authorization } from './vapid.ts'

/** What a device shows; the service worker reads it. */
export interface PushMessage {
	readonly title: string
	readonly body: string
	/** The page a click opens. */
	readonly url?: string | undefined
	/** A later message with the same tag replaces this one. */
	readonly tag?: string | undefined
	/** Anything else the service worker reads, as JSON. */
	readonly data?: unknown
}

/** How the push services deliver it. */
export interface SendOptions {
	/** Seconds a push service keeps it for an offline device: a day by default. */
	readonly ttl?: number | undefined
	readonly urgency?: 'very-low' | 'low' | 'normal' | 'high' | undefined
}

/** What became of each device. */
export interface Sent {
	readonly sent: number
	/** Devices deleted: their session ended, or their browser unsubscribed. */
	readonly gone: number
	/** Devices whose push service refused or did not answer; logged. */
	readonly failed: number
}

const urgencies = new Set(['very-low', 'low', 'normal', 'high'])
// How many pushes are in flight at once.
const parallel = 32

/** The message as JSON, refused before anything is sent when too long. */
function payloadOf(message: PushMessage): Buffer {
	const { title, body, url, tag, data } = message
	const payload = Buffer.from(JSON.stringify({ title, body, url, tag, data }))
	if (payload.length > maxMessage) {
		throw new Error(
			`push.send: the message is ${payload.length} bytes, over the ${maxMessage} a push carries.`,
		)
	}
	return payload
}

function headersOf(options: SendOptions, tag: string | undefined) {
	const { ttl = 86_400, urgency } = options
	if (!Number.isSafeInteger(ttl) || ttl < 0) {
		throw new Error('push.send: ttl is a number of seconds, 0 or more.')
	}
	if (urgency !== undefined && !urgencies.has(urgency)) {
		throw new Error('push.send: urgency is very-low, low, normal or high.')
	}
	const headers: Record<string, string> = {
		TTL: String(ttl),
		'Content-Encoding': 'aes128gcm',
		'Content-Type': 'application/octet-stream',
	}
	if (urgency !== undefined) headers['Urgency'] = urgency
	if (tag !== undefined) {
		// A topic is 32 URL-safe characters at most (RFC 8030 section 5.4).
		headers['Topic'] = /^[\w-]{1,32}$/u.test(tag)
			? tag
			: createHash('sha256').update(tag).digest('base64url').slice(0, 32)
	}
	return headers
}

interface Device {
	readonly endpoint: string
	readonly p256dh: string
	readonly auth: string
}
type Outcome = 'sent' | 'gone' | 'failed'
interface Sending {
	readonly vapid: Vapid
	readonly logger: Logger
	readonly headers: Readonly<Record<string, string>>
	readonly payload: Buffer
}

async function delivered(
	{ vapid, logger, headers, payload }: Sending,
	device: Device,
): Promise<Outcome> {
	// Logs name the push service, never the device's endpoint.
	const { origin } = new URL(device.endpoint)
	try {
		const body = encrypt(payload, {
			p256dh: Buffer.from(device.p256dh, 'base64url'),
			auth: Buffer.from(device.auth, 'base64url'),
		})
		const status = await posted(
			device.endpoint,
			{ ...headers, Authorization: authorization(vapid, device.endpoint) },
			body,
		)
		if (status >= 200 && status < 300) return 'sent'
		if (status === 404 || status === 410) return 'gone'
		logger.warn({ origin, status }, 'A push service refused a push.')
	} catch (error) {
		logger.warn({ err: error, origin }, 'A push service did not answer.')
	}
	return 'failed'
}

/**
 * Sends `message` to each device of `userIds`, at most 32 at once; a
 * failure is logged and counted, never retried.
 */
export async function send(
	userIds: readonly string[],
	message: PushMessage,
	options: SendOptions = {},
): Promise<Sent> {
	const { vapid, auth, logger } = runningOf('push.send')
	const payload = payloadOf(message)
	const headers = headersOf(options, message.tag)
	if (vapid === undefined || userIds.length === 0) {
		return { sent: 0, gone: 0, failed: 0 }
	}
	const devices = await PushDevice.findMany(
		{ where: { user: { is: { id: { in: [...userIds] } } } } },
		M,
	)
	const live = await auth.liveSessions(
		devices.map((device) => device.sessionId),
	)
	const ended = devices.filter((device) => !live.has(device.sessionId))
	if (ended.length > 0) {
		const sessionIds = ended.map((device) => device.sessionId)
		await PushDevice.deleteMany({ where: { sessionId: { in: sessionIds } } }, M)
	}
	const outcomes = await deliveredAll(
		{ vapid, logger, headers, payload },
		devices.filter((device) => live.has(device.sessionId)),
	)
	const unsubscribed = outcomes.flatMap(([device, outcome]) =>
		outcome === 'gone' ? [device.endpoint] : [],
	)
	if (unsubscribed.length > 0) {
		await PushDevice.deleteMany(
			{ where: { endpoint: { in: unsubscribed } } },
			M,
		)
	}
	const count = (outcome: Outcome) =>
		outcomes.filter(([, each]) => each === outcome).length
	return {
		sent: count('sent'),
		gone: ended.length + unsubscribed.length,
		failed: count('failed'),
	}
}

/** Each device's outcome, with `parallel` workers sharing the list. */
async function deliveredAll(
	sending: Sending,
	devices: readonly Device[],
): Promise<readonly (readonly [Device, Outcome])[]> {
	const outcomes: (readonly [Device, Outcome])[] = []
	const queue = devices.values()
	const worker = async () => {
		for (const device of queue) {
			outcomes.push([device, await delivered(sending, device)])
		}
	}
	const workers = Math.min(parallel, devices.length)
	await Promise.all(Array.from({ length: workers }, worker))
	return outcomes
}
