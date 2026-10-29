// A live list or row over Server-Sent Events (D-154), read with `fetch`,
// which sends the caller's headers. One stream serves every listener; it
// reconnects with its token, backing off, and grows by reopening with it.
import type { EventSourceMessage } from 'eventsource-parser/stream'
import { EventSourceParserStream } from 'eventsource-parser/stream'
import { applyLive } from './apply.ts'
import { LiveError } from './error.ts'
import { isList, isMessage, isRecord } from './guards.ts'

/** What a live read sends with each request. */
export type LiveFetchOptions = {
	readonly headers?: ConstructorParameters<typeof Headers>[0]
}

/** A live read: each whole result to its listeners, grown on demand. */
export type LiveFetch<T> = {
	/** Hands `listener` each result, the current one first; returns what stops it. */
	readonly subscribe: (
		listener: (result: T) => void,
		failed?: (error: LiveError) => void,
	) => () => void
	/** Adds `first` rows to the list; resolves once they arrived. */
	readonly fetchMore: (options: { readonly first: number }) => Promise<void>
}

type Listener<T> = {
	readonly listener: (result: T) => void
	readonly failed: ((error: LiveError) => void) | undefined
}

const firstBackoff = 100
const lastBackoff = 5000

/** The server's `{ code, message }`, as a `LiveError`. */
function errorOf(body: unknown): LiveError {
	if (
		isRecord(body) &&
		typeof body['code'] === 'string' &&
		typeof body['message'] === 'string'
	) {
		return new LiveError(body['code'], body['message'])
	}
	return new LiveError('INTERNAL', 'The live read failed.')
}

/** Follows `url`, a live model's list or row, once a listener subscribes. */
export function liveFetch<T = unknown>(
	url: string,
	options: LiveFetchOptions = {},
): LiveFetch<T> {
	const at = url.indexOf('?')
	const path = at < 0 ? url : url.slice(0, at)
	const params = new URLSearchParams(at < 0 ? '' : url.slice(at + 1))
	const arg = ['first', 'take'].find((name) => params.has(name))
	const headers = new Headers(options.headers)
	headers.set('accept', 'text/event-stream')
	const listeners = new Set<Listener<T>>()
	const waiting: { resolve: () => void; reject: (error: LiveError) => void }[] =
		[]
	let result: { readonly value: unknown } | undefined
	let revision = 0
	let token: string | undefined
	let request: AbortController | undefined
	let timer: ReturnType<typeof setTimeout> | undefined
	let backoff = firstBackoff

	const settle = (error?: LiveError) => {
		for (const { resolve, reject } of waiting.splice(0)) {
			if (error === undefined) resolve()
			else reject(error)
		}
	}
	const halt = () => {
		request?.abort()
		request = undefined
		clearTimeout(timer)
		timer = undefined
	}
	const fail = (error: LiveError) => {
		halt()
		for (const { failed } of listeners) failed?.(error)
		settle(error)
	}
	const emit = (value: unknown) => {
		result = { value }
		settle()
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the caller names what its request selects.
		for (const { listener } of listeners) listener(value as T)
	}
	const open = () => {
		halt()
		const controller = new AbortController()
		request = controller
		const asked = new URLSearchParams(params)
		if (token !== undefined) asked.set('resume', token)
		void read(controller, `${path}?${asked.toString()}`)
	}
	const afresh = () => {
		token = undefined
		open()
	}
	/** Handles `event`; `false` once the stream is replaced or failed. */
	const handle = ({ event, id, data }: EventSourceMessage): boolean => {
		const body: unknown = JSON.parse(data)
		if (event === 'resume' && typeof body === 'string') token = body
		if (event === 'data') {
			revision = Number(id)
			emit(body)
		}
		if (event === 'error') {
			fail(errorOf(body))
			return false
		}
		if (event !== 'live') return true
		const list = result?.value
		const next =
			isMessage(body) && body.revision === revision + 1 && isList(list)
				? applyLive(list, body)
				: undefined
		// Out of step: read the list again.
		if (next === undefined) {
			afresh()
			return false
		}
		revision += 1
		emit(next)
		return true
	}
	async function read(controller: AbortController, href: string) {
		try {
			const { signal } = controller
			const response = await fetch(href, { headers, signal })
			if (!response.ok && response.status < 500) {
				const body: unknown = await response.json().catch(() => undefined)
				return fail(errorOf(body))
			}
			if (!response.ok) await response.body?.cancel()
			const reader = (response.ok ? response.body : null)
				?.pipeThrough(new TextDecoderStream())
				.pipeThrough(new EventSourceParserStream())
				.getReader()
			for (;;) {
				const next = await reader?.read()
				if (next === undefined || next.done || signal.aborted) break
				backoff = firstBackoff
				if (!handle(next.value)) return
			}
		} catch (error) {
			if (error instanceof LiveError) return fail(error)
		}
		if (request !== controller) return
		// Cut, ended or refused for a while: reconnect with the token.
		timer = setTimeout(open, backoff)
		backoff = Math.min(backoff * 2, lastBackoff)
	}

	return {
		subscribe: (listener, failed) => {
			const entry = { listener, failed }
			listeners.add(entry)
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the caller names what its request selects.
			if (result !== undefined) listener(result.value as T)
			if (request === undefined) open()
			return () => {
				listeners.delete(entry)
				if (listeners.size > 0) return
				halt()
				settle()
			}
		},
		fetchMore: async ({ first: more }) => {
			const shown = Number(params.get(arg ?? '') ?? Number.NaN)
			if (arg === undefined || !Number.isInteger(shown)) {
				throw new LiveError(
					'BAD_USER_INPUT',
					'fetchMore grows a live list: its URL needs first or take.',
				)
			}
			if (!Number.isInteger(more) || more < 1) {
				throw new LiveError(
					'BAD_USER_INPUT',
					'first must be a positive integer.',
				)
			}
			params.set(arg, String(shown + more))
			if (request === undefined) return
			const grown = new Promise<void>((resolve, reject) => {
				waiting.push({ resolve, reject })
			})
			open()
			return grown
		},
	}
}
