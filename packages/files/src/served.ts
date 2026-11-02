// The files a storage serves itself (D-202): their URLs on the
// application's origin, a private one signed for D-200's window, and the
// answer of `GET /files/<key>`.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { FileBody, Server } from './storage.ts'
import { isPublic, urlWindow, windowOf } from './storage.ts'

/** An object a storage reads back. */
export interface StoredObject {
	readonly body: FileBody
	readonly size: number
	readonly type: string
	readonly attachment: boolean
}

/** Where a served storage's files are, and how a private one is signed. */
export interface Serving {
	readonly start: (server: Server) => void
	readonly url: (key: string) => string
	readonly serve: (
		key: string,
		url: URL,
		read: () => Promise<StoredObject | undefined>,
	) => Promise<Response>
}

const answer = (status: 403 | 404, code: string, message: string) =>
	Response.json({ code, message }, { status })

/**
 * A storage's URLs, at `servedAt` or the HTTP server's address; `secret`
 * signs the private ones, drawn at random when none is given.
 */
export function serving(
	name: string,
	options: {
		readonly servedAt?: string | undefined
		readonly secret?: string | undefined
	},
): Serving {
	const secret = options.secret ?? randomBytes(32).toString('base64url')
	let origin: string | undefined
	const signature = (key: string, expires: number) =>
		createHmac('sha256', secret).update(`${key}\n${expires}`).digest()
	const signed = (key: string, url: URL) => {
		const expires = Number(url.searchParams.get('expires'))
		const given = Buffer.from(
			url.searchParams.get('signature') ?? '',
			'base64url',
		)
		const expected = signature(key, expires)
		return (
			expires * 1000 > Date.now() &&
			given.length === expected.length &&
			timingSafeEqual(given, expected)
		)
	}
	return {
		start: (server) => {
			origin = (options.servedAt ?? server.url).replace(/\/+$/u, '')
		},
		url: (key) => {
			if (origin === undefined) {
				throw new Error(
					`${name} gives a file's URL once the application starts.`,
				)
			}
			if (isPublic(key)) return `${origin}/files/${key}`
			// The same URL for a whole window, valid one more (D-200).
			const expires = (windowOf(Date.now()) + 2 * urlWindow) / 1000
			const sig = signature(key, expires).toString('base64url')
			return `${origin}/files/${key}?expires=${expires}&signature=${sig}`
		},
		serve: async (key, url, read) => {
			if (!isPublic(key) && !signed(key, url)) {
				return answer(
					403,
					'FORBIDDEN',
					'This file URL is not signed, or has expired.',
				)
			}
			const object = await read()
			if (object === undefined) {
				return answer(404, 'NOT_FOUND', 'No file at this address.')
			}
			const expires = Number(url.searchParams.get('expires'))
			const headers = new Headers({
				'Content-Type': object.type,
				'Content-Length': String(object.size),
				'X-Content-Type-Options': 'nosniff',
				// An origin of its own, even when it is opened (D-202).
				'Content-Security-Policy': 'sandbox',
				'Cache-Control': isPublic(key)
					? 'public, max-age=31536000, immutable'
					: `private, max-age=${Math.max(0, Math.floor(expires - Date.now() / 1000))}`,
			})
			if (object.attachment) headers.set('Content-Disposition', 'attachment')
			return new Response(object.body, { headers })
		},
	}
}
