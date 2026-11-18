// `push.register` and `push.unregister` (D-408 points 4 and 5): the device
// of the caller's session, saved or deleted.
import { ECDH } from 'node:crypto'
import type { Caller } from 'ultimabase'
import { isLocalHost, PublicError, transaction } from 'ultimabase'
import { M, PushDevice } from './device.ts'
import { bytesOf } from './options.ts'
import { runningOf } from './running.ts'

/** A browser's subscription, as `PushSubscription.toJSON()` gives its parts. */
export interface WebSubscription {
	/** The push service's `https:` URL for this browser. */
	readonly endpoint: string
	/** `keys.p256dh`: the browser's public key, base64url. */
	readonly p256dh: string
	/** `keys.auth`: the browser's secret, base64url. */
	readonly auth: string
}

/** A device to register: a browser's subscription for now. */
export interface PushDeviceInput {
	readonly web: WebSubscription
}

/** The user and session of a caller, or a bug: a token's caller has one (D-407). */
function sessionOf(caller: Caller, entry: string) {
	if (caller.kind !== 'user' || caller.session === undefined) {
		throw new Error(`${entry} needs a caller signed in with a session.`)
	}
	return { userId: caller.user.id, sessionId: caller.session.id }
}

// A dotted IPv4 address, as the URL parser writes any IPv4 form, or IPv6.
const address = /^(?:\d+\.){3}\d+$|^\[/u

function endpointProblem(endpoint: unknown): string | undefined {
	const url =
		typeof endpoint === 'string' && endpoint.length <= 2048
			? URL.parse(endpoint)
			: null
	if (url?.protocol !== 'https:') {
		return 'is an https: URL of 2048 characters at most'
	}
	// The server posts to it: never to this machine or an address.
	if (isLocalHost(url.hostname) || address.test(url.hostname)) {
		return 'is a push service’s URL, not a local host or an address'
	}
	return undefined
}

const isPoint = (bytes: Buffer): boolean => {
	try {
		ECDH.convertKey(bytes, 'prime256v1')
		return bytes.length === 65
	} catch {
		return false
	}
}

function keyProblem(value: unknown, valid: (bytes: Buffer) => boolean) {
	const bytes =
		typeof value === 'string' && value.length <= 256
			? bytesOf(value)
			: undefined
	return bytes !== undefined && valid(bytes)
		? undefined
		: 'is the browser’s key, in base64url'
}

/** The subscription, or a `VALIDATION_FAILED` naming each malformed part. */
function checked(device: PushDeviceInput): WebSubscription {
	const web: unknown = device.web
	const read = (key: string): unknown =>
		typeof web === 'object' && web !== null ? Reflect.get(web, key) : undefined
	const { endpoint, p256dh, auth } = {
		endpoint: read('endpoint'),
		p256dh: read('p256dh'),
		auth: read('auth'),
	}
	const problems = {
		endpoint: endpointProblem(endpoint),
		p256dh: keyProblem(p256dh, isPoint),
		auth: keyProblem(auth, (bytes) => bytes.length === 16),
	}
	const issues = Object.entries(problems).flatMap(([key, message]) =>
		message === undefined ? [] : [{ path: ['web', key], message }],
	)
	const [first] = issues
	if (first !== undefined) {
		throw new PublicError(
			'VALIDATION_FAILED',
			`${first.path.join('.')}: ${first.message}`,
			{ details: { issues } },
		)
	}
	return {
		endpoint: String(endpoint),
		p256dh: String(p256dh),
		auth: String(auth),
	}
}

/**
 * Saves the device of the caller's session, replacing the one it had; an
 * endpoint another session saved moves to this one. `false` without web
 * keys, saving nothing.
 */
export async function register(
	caller: Caller,
	device: PushDeviceInput,
): Promise<boolean> {
	const entry = 'push.register'
	const { userId, sessionId } = sessionOf(caller, entry)
	if (runningOf(entry).vapid === undefined) return false
	const { endpoint, p256dh, auth } = checked(device)
	await transaction(async () => {
		// The browser signed in to another session, or another account.
		await PushDevice.deleteMany(
			{ where: { endpoint, sessionId: { not: sessionId } } },
			M,
		)
		await PushDevice.upsert(
			{
				where: { sessionId },
				create: {
					kind: 'web',
					user: { connect: { id: userId } },
					sessionId,
					endpoint,
					p256dh,
					auth,
				},
				update: { kind: 'web', endpoint, p256dh, auth },
			},
			M,
		)
	})
	return true
}

/** Deletes the device of the caller's session; none is no error. */
export async function unregister(caller: Caller): Promise<void> {
	const entry = 'push.unregister'
	const { sessionId } = sessionOf(caller, entry)
	runningOf(entry)
	await PushDevice.deleteMany({ where: { sessionId } }, M)
}
