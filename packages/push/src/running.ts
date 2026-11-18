// The running plugin's state, which `push` reads: one application runs at a
// time in a realm. And the request that carries a push, which the fake
// replaces.
import type { AuthApi } from '@ultimabase/auth'
import type { Logger } from 'ultimabase'
import type { Vapid } from './vapid.ts'

/** What the plugin holds while the application runs. */
export interface Running {
	/** `undefined` without keys: nothing is registered or sent. */
	readonly vapid: Vapid | undefined
	readonly auth: AuthApi
	readonly logger: Logger
}

let running: Running | undefined

export const useRunning = (state: Running | undefined): void => {
	running = state
}

/** The running plugin; a call before the application starts is a bug. */
export function runningOf(entry: string): Running {
	if (running === undefined) {
		throw new Error(
			`${entry} runs while an application with pushPlugin() runs.`,
		)
	}
	return running
}

/** Sends a push request and gives its status. */
export type Post = (
	endpoint: string,
	headers: Readonly<Record<string, string>>,
	body: Buffer,
) => Promise<number>

const network: Post = async (endpoint, headers, body) => {
	const response = await fetch(endpoint, {
		method: 'POST',
		headers,
		body: new Uint8Array(body),
		// A push service answers; a redirect could lead anywhere.
		redirect: 'error',
		signal: AbortSignal.timeout(10_000),
	})
	await response.body?.cancel()
	return response.status
}

let post: Post = network

/** Replaces the network, as `fakeWebPush` does; `undefined` restores it. */
export const usePost = (replacement: Post | undefined): void => {
	post = replacement ?? network
}

/** Sends with the network, or with what replaces it. */
export const posted: Post = async (endpoint, headers, body) =>
	post(endpoint, headers, body)
